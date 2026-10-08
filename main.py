from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
import uvicorn

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


@app.get("/api/analyze")
async def analyze(location: str):
    location = location.strip()

    if not location:
        raise HTTPException(
            status_code=400,
            detail="Please enter a location.",
        )

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:

            # 1. Find the city coordinates.
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

            # 2. Get air quality from the dedicated API.
            air_response = await client.get(
                "https://air-quality-api.open-meteo.com/v1/air-quality",
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    "current": "pm2_5,pm10,us_aqi",
                    "timezone": "auto",
                },
            )
            air_response.raise_for_status()

            air_data = air_response.json()
            air_current = air_data.get("current")

            if not air_current:
                raise HTTPException(
                    status_code=502,
                    detail="The air-quality service returned no current data.",
                )

            # 3. Weather is optional: pollution data can still be returned
            # if the weather endpoint is temporarily rate-limited.
            weather = {
                "temperature": None,
                "humidity": None,
                "wind_speed": None,
                "wind_direction": None,
            }
            weather_status = "Weather data is temporarily unavailable."

            try:
                weather_response = await client.get(
                    "https://api.open-meteo.com/v1/forecast",
                    params={
                        "latitude": latitude,
                        "longitude": longitude,
                        "current": (
                            "temperature_2m,"
                            "relative_humidity_2m,"
                            "wind_speed_10m,"
                            "wind_direction_10m"
                        ),
                        "timezone": "auto",
                    },
                )
                weather_response.raise_for_status()

                weather_current = weather_response.json().get("current")

                if weather_current:
                    weather = {
                        "temperature": weather_current.get("temperature_2m"),
                        "humidity": weather_current.get(
                            "relative_humidity_2m"
                        ),
                        "wind_speed": weather_current.get("wind_speed_10m"),
                        "wind_direction": weather_current.get(
                            "wind_direction_10m"
                        ),
                    }
                    weather_status = "success"

            except httpx.HTTPError:
                pass

            # 4. Return the dashboard data.
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
                    "pm25": air_current.get("pm2_5"),
                    "pm10": air_current.get("pm10"),
                    "us_aqi": air_current.get("us_aqi"),
                    "unit": "µg/m³",
                    "status": "success",
                    "source": "Open-Meteo Air Quality API",
                },
                "prediction": {
                    "forecast_30_60_min": None,
                    "status": (
                        "AI prediction model is not connected yet."
                    ),
                },
                "data_attribution": (
                    "Air quality: Open-Meteo / Copernicus CAMS. "
                    "Weather: Open-Meteo."
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
        if exc.response.status_code == 429:
            raise HTTPException(
                status_code=503,
                detail=(
                    "The location or air-quality service is rate-limited. "
                    "Please wait a few minutes and try again."
                ),
            )

        raise HTTPException(
            status_code=502,
            detail=(
                "An external data service returned HTTP "
                f"{exc.response.status_code}."
            ),
        )

    except (httpx.RequestError, ValueError, KeyError):
        raise HTTPException(
            status_code=502,
            detail="Could not retrieve location or pollution data. Try again.",
        )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)


