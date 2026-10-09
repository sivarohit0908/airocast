from datetime import datetime, timedelta
import os
import uvicorn
import httpx

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AIROCAST API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://sivarohit0908.github.io"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "message": "AIROCAST backend is running!",
        "status": "online",
    }


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "AIROCAST API",
    }


def estimate_pm25(target_time, points):
    """Interpolate PM2.5 between available forecast timestamps."""
    points = sorted(points, key=lambda item: item[0])

    for index in range(len(points) - 1):
        time_a, value_a = points[index]
        time_b, value_b = points[index + 1]

        if time_a <= target_time <= time_b:
            duration = (time_b - time_a).total_seconds()

            if duration <= 0:
                return value_a

            fraction = (
                (target_time - time_a).total_seconds() / duration
            )

            return round(value_a + fraction * (value_b - value_a), 1)

    return None


@app.get("/api/analyze")
async def analyze(location: str):
    location = location.strip()

    if not location:
        raise HTTPException(
            status_code=400,
            detail="Please enter a location.",
        )

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:

            # 1. Find the location.
            geo_response = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={
                    "name": location,
                    "count": 1,
                    "language": "en",
                    "format": "json",
                },
            )
            geo_response.raise_for_status()

            results = geo_response.json().get("results", [])

            if not results:
                raise HTTPException(
                    status_code=404,
                    detail=f"Location '{location}' was not found.",
                )

            place = results[0]
            latitude = place["latitude"]
            longitude = place["longitude"]

            # 2. Get current pollution and hourly pollution forecasts.
            air_response = await client.get(
                "https://air-quality-api.open-meteo.com/v1/air-quality",
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    "current": "pm2_5,pm10,us_aqi",
                    "hourly": "pm2_5,pm10,us_aqi",
                    "forecast_hours": 6,
                    "timezone": "auto",
                },
            )
            air_response.raise_for_status()

            air_data = air_response.json()
            air_current = air_data.get("current", {})
            hourly = air_data.get("hourly", {})

            current_pm25 = air_current.get("pm2_5")

            if current_pm25 is None:
                raise HTTPException(
                    status_code=502,
                    detail="Current PM2.5 data is unavailable.",
                )

            # 3. Estimate PM2.5 for 30 and 60 minutes ahead.
            # The source forecast is hourly; 30-minute values are
            # interpolated estimates, not native 30-minute forecasts.
            forecast_30 = None
            forecast_60 = None
            trend = "unavailable"
            prediction_status = "forecast_unavailable"
            prediction_message = (
                "Pollution forecast is temporarily unavailable."
            )

            try:
                current_time_text = air_current.get("time")

                if not current_time_text:
                    raise ValueError("Current timestamp is missing.")

                current_time = datetime.fromisoformat(current_time_text)

                points = [(current_time, float(current_pm25))]

                times = hourly.get("time", [])
                values = hourly.get("pm2_5", [])

                for time_text, value in zip(times, values):
                    if value is None:
                        continue

                    forecast_time = datetime.fromisoformat(time_text)

                    if forecast_time > current_time:
                        points.append((forecast_time, float(value)))

                target_30 = current_time + timedelta(minutes=30)
                target_60 = current_time + timedelta(minutes=60)

                forecast_30 = estimate_pm25(target_30, points)
                forecast_60 = estimate_pm25(target_60, points)

                if forecast_60 is not None:
                    difference = forecast_60 - float(current_pm25)

                    if difference > 0.5:
                        trend = "rising"
                    elif difference < -0.5:
                        trend = "falling"
                    else:
                        trend = "stable"

                    prediction_status = "success"
                    prediction_message = (
                        f"Estimated PM2.5: {forecast_30 if forecast_30 is not None else 'unavailable'} "
                        f"µg/m³ in 30 min; {forecast_60} µg/m³ in 60 min. "
                        f"Trend: {trend}. Based on Open-Meteo hourly forecast."
                    )

            except (ValueError, TypeError, IndexError):
                pass

            # 4. Get weather from OpenWeather.
            weather = {
                "temperature": None,
                "humidity": None,
                "wind_speed": None,
                "wind_direction": None,
            }
            weather_status = "Weather data is unavailable."

            api_key = os.getenv("OPENWEATHER_API_KEY")

            if api_key:
                try:
                    weather_response = await client.get(
                        "https://api.openweathermap.org/data/2.5/weather",
                        params={
                            "lat": latitude,
                            "lon": longitude,
                            "appid": api_key,
                            "units": "metric",
                        },
                    )
                    weather_response.raise_for_status()

                    weather_data = weather_response.json()
                    main_data = weather_data.get("main", {})
                    wind_data = weather_data.get("wind", {})

                    weather = {
                        "temperature": main_data.get("temp"),
                        "humidity": main_data.get("humidity"),
                        "wind_speed": (
                            wind_data["speed"] * 3.6
                            if wind_data.get("speed") is not None
                            else None
                        ),
                        "wind_direction": wind_data.get("deg"),
                    }
                    weather_status = "success"

                except httpx.HTTPError:
                    weather_status = (
                        "Weather service unavailable. Check the API key."
                    )
            else:
                weather_status = (
                    "OPENWEATHER_API_KEY is not configured in Render."
                )

            # 5. Return the dashboard data.
            return {
                "status": "success",
                "location": {
                    "searched": location,
                    "name": place.get("name", location),
                    "country": place.get("country", ""),
                    "latitude": latitude,
                    "longitude": longitude,
                },
                "weather": weather,
                "weather_status": weather_status,
                "pollution": {
                    "pm25": current_pm25,
                    "pm10": air_current.get("pm10"),
                    "us_aqi": air_current.get("us_aqi"),
                    "unit": "µg/m³",
                    "status": "success",
                    "source": "Open-Meteo Air Quality API",
                },
                "prediction": {
                    "forecast_30_60_min": prediction_message,
                    "pm25_in_30_min": forecast_30,
                    "pm25_in_60_min": forecast_60,
                    "trend": trend,
                    "status": prediction_status,
                    "source": "Open-Meteo hourly air-quality forecast",
                    "method": "Hourly forecast interpolation",
                    "note": (
                        "This is an external model forecast, not the "
                        "AIROCAST Random Forest or XGBoost prediction."
                    ),
                },
                "data_attribution": (
                    "Air quality and forecast: Open-Meteo / Copernicus CAMS. "
                    "Weather: OpenWeather."
                ),
            }

    except HTTPException:
        raise

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="A data service timed out. Please try again shortly.",
        )

    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "An external service returned HTTP "
                f"{exc.response.status_code}."
            ),
        )

    except (httpx.RequestError, ValueError, KeyError):
        raise HTTPException(
            status_code=502,
            detail="Could not retrieve data. Please try again.",
        )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)


