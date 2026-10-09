
import asyncio
import math
import os
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="AIROCAST API",
    description="Weather by OpenWeather and air quality by Open-Meteo.",
    version="2.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://sivarohit0908.github.io",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

TIMEOUT = httpx.Timeout(20.0, connect=8.0)

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
REVERSE_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/reverse"
OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"
AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"


async def get_json(client, url, params, service):
    try:
        response = await client.get(url, params=params)
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as exc:
        if service == "OpenWeather" and exc.response.status_code == 401:
            raise HTTPException(
                status_code=503,
                detail="OpenWeather rejected the API key. Check OPENWEATHER_API_KEY in Render.",
            ) from exc

        raise HTTPException(
            status_code=502,
            detail=f"{service} returned an error. Please try again shortly.",
        ) from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not retrieve data from {service}.",
        ) from exc


def aqi_label(aqi):
    if aqi is None:
        return {"label": "Unavailable", "level": "unknown"}
    if aqi <= 50:
        return {"label": "Good", "level": "good"}
    if aqi <= 100:
        return {"label": "Moderate", "level": "moderate"}
    if aqi <= 150:
        return {
            "label": "Unhealthy for sensitive groups",
            "level": "sensitive",
        }
    if aqi <= 200:
        return {"label": "Unhealthy", "level": "unhealthy"}
    if aqi <= 300:
        return {"label": "Very unhealthy", "level": "very_unhealthy"}
    return {"label": "Hazardous", "level": "hazardous"}


def build_guidance(aqi, pm25):
    if aqi is None and pm25 is None:
        return "Air-quality guidance is unavailable because data could not be retrieved."
    if aqi is not None and aqi > 150:
        return (
            "Consider limiting prolonged or strenuous outdoor activity. "
            "Sensitive groups should take extra care."
        )
    if aqi is not None and aqi > 100:
        return (
            "Sensitive groups may want to reduce prolonged or strenuous "
            "outdoor activity."
        )
    if pm25 is not None and pm25 > 15:
        return (
            "PM2.5 is elevated relative to the WHO annual guideline. "
            "Consider reducing unnecessary exposure."
        )
    return (
        "Conditions look relatively favorable in this model estimate. "
        "Check local advisories if you are sensitive to air pollution."
    )


@app.get("/")
async def root():
    return {
        "service": "AIROCAST API",
        "status": "online",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/analyze")
async def analyze(
    location: Optional[str] = Query(None, min_length=2, max_length=100),
    latitude: Optional[float] = Query(None, ge=-90, le=90),
    longitude: Optional[float] = Query(None, ge=-180, le=180),
):
    # Require both coordinates together, or neither.
    if (latitude is None) != (longitude is None):
        raise HTTPException(
            status_code=400,
            detail="Provide both latitude and longitude.",
        )

    use_coordinates = latitude is not None and longitude is not None

    if not use_coordinates:
        city = (location or "").strip()
        if not city:
            raise HTTPException(
                status_code=400,
                detail="Enter a city name or provide GPS coordinates.",
            )
    else:
        city = ""

    api_key = os.getenv("OPENWEATHER_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "Weather service is not configured. Add "
                "OPENWEATHER_API_KEY in Render environment variables."
            ),
        )

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        if use_coordinates:
            # Use the device coordinates directly for weather and air quality.
            lat = latitude
            lon = longitude

            # Reverse geocoding is only for the displayed place name.
            # If it fails, the analysis can still use the supplied coordinates.
            place = {
                "name": "Your current location",
                "admin1": None,
                "country": None,
                "latitude": lat,
                "longitude": lon,
                "timezone": "auto",
            }

            try:
                reverse_response = await client.get(
                    REVERSE_GEOCODING_URL,
                    params={
                        "latitude": lat,
                        "longitude": lon,
                        "language": "en",
                        "format": "json",
                    },
                )
                reverse_response.raise_for_status()
                reverse_data = reverse_response.json()
                reverse_results = reverse_data.get("results") or []

                if reverse_results:
                    found = reverse_results[0]
                    place.update({
                        "name": found.get("name") or place["name"],
                        "admin1": found.get("admin1"),
                        "country": found.get("country"),
                        "timezone": found.get("timezone") or "auto",
                    })
            except (httpx.HTTPError, ValueError):
                # Location naming is optional; don't block GPS analysis.
                pass

            timezone_name = place.get("timezone") or "auto"

        else:
            # Preserve the existing city-name search behavior.
            geo = await get_json(
                client,
                GEOCODING_URL,
                {
                    "name": city,
                    "count": 1,
                    "language": "en",
                    "format": "json",
                },
                "Open-Meteo geocoding",
            )

            results = geo.get("results") or []
            if not results:
                raise HTTPException(
                    status_code=404,
                    detail=f'Could not find "{city}". Try another city name.',
                )

            place = results[0]
            lat = place["latitude"]
            lon = place["longitude"]
            timezone_name = place.get("timezone") or "auto"

        weather_task = get_json(
            client,
            OPENWEATHER_URL,
            {
                "lat": lat,
                "lon": lon,
                "appid": api_key,
                "units": "metric",
            },
            "OpenWeather",
        )

        air_task = get_json(
            client,
            AIR_URL,
            {
                "latitude": lat,
                "longitude": lon,
                "timezone": timezone_name,
                "forecast_days": 2,
                "current": "pm2_5,pm10,us_aqi",
                "hourly": "pm2_5,pm10,us_aqi",
            },
            "Open-Meteo air quality",
        )

        weather, air = await asyncio.gather(weather_task, air_task)

    current_weather = weather.get("weather") or [{}]
    weather_details = current_weather[0] if current_weather else {}
    main = weather.get("main") or {}
    wind = weather.get("wind") or {}
    air_current = air.get("current") or {}

    pm25 = air_current.get("pm2_5")
    pm10 = air_current.get("pm10")
    us_aqi = air_current.get("us_aqi")

    hourly = air.get("hourly") or {}
    times = hourly.get("time") or []
    current_time = air_current.get("time")

    pm25_values = hourly.get("pm2_5") or []
    pm10_values = hourly.get("pm10") or []
    aqi_values = hourly.get("us_aqi") or []

    forecast = []

    for i, timestamp in enumerate(times):
        if current_time and timestamp < current_time:
            continue

        forecast.append({
            "time": timestamp,
            "pm2_5": pm25_values[i] if i < len(pm25_values) else None,
            "pm10": pm10_values[i] if i < len(pm10_values) else None,
            "us_aqi": aqi_values[i] if i < len(aqi_values) else None,
        })

        if len(forecast) >= 24:
            break

    weather_timestamp = weather.get("dt")
    updated_at = (
        datetime.fromtimestamp(weather_timestamp, tz=timezone.utc).isoformat()
        if weather_timestamp
        else datetime.now(timezone.utc).isoformat()
    )

    return {
        "location": {
            "name": place.get("name", city or "Your current location"),
            "admin1": place.get("admin1"),
            "country": place.get("country"),
            "latitude": lat,
            "longitude": lon,
            "timezone": timezone_name,
        },
        "updated_at": updated_at,
        "data_source": {
            "weather": "OpenWeather",
            "air_quality": "Open-Meteo",
        },
        "data_note": (
            "Weather is supplied by OpenWeather. Air-quality current values "
            "and forecasts are model-based Open-Meteo estimates, not guaranteed "
            "measurements from a local monitoring station. GPS coordinates "
            "identify the requested location but do not guarantee street-level "
            "pollution accuracy."
        ),
        "pollution": {
            "pm2_5": pm25,
            "pm10": pm10,
            "us_aqi": us_aqi,
            "aqi_status": aqi_label(us_aqi),
        },
        "weather": {
            "temperature": main.get("temp"),
            "feels_like": main.get("feels_like"),
            "humidity": main.get("humidity"),
            "wind_speed": wind.get("speed"),
            "description": weather_details.get(
                "description", "Weather conditions unavailable"
            ).capitalize(),
            "icon": weather_details.get("icon"),
            "weather_code": weather_details.get("id"),
        },
        "units": {
            "temperature": "°C",
            "wind_speed": "m/s",
            "pm2_5": "μg/m³",
            "pm10": "μg/m³",
            "us_aqi": "US AQI",
        },
        "forecast": {
            "hourly": forecast,
            "source": "Open-Meteo hourly air-quality forecast",
            "hours": len(forecast),
        },
        "guidance": build_guidance(us_aqi, pm25),
        "model_status": "not_used",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
