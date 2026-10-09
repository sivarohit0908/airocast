
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="AIROCAST API",
    description="Weather and air-quality data powered by Open-Meteo.",
    version="2.0.0",
)

# GitHub Pages frontend + local development.
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

TIMEOUT = httpx.Timeout(15.0, connect=8.0)

WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"


async def get_json(
    client: httpx.AsyncClient,
    url: str,
    params: dict[str, Any],
) -> dict[str, Any]:
    try:
        response = await client.get(url, params=params)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail="An Open-Meteo data service is temporarily unavailable.",
        ) from exc


def value_at(data: dict, key: str, index: int = 0):
    values = data.get("hourly", {}).get(key) or []
    return values[index] if len(values) > index else None


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
        return (
            "Air-quality guidance is unavailable because the required "
            "data could not be retrieved."
        )
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
            "Particle pollution is elevated relative to the WHO annual "
            "PM2.5 guideline. Consider reducing unnecessary exposure."
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
    location: str = Query(..., min_length=2, max_length=100),
):
    city = location.strip()
    if not city:
        raise HTTPException(status_code=400, detail="Enter a city name.")

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        geo = await get_json(
            client,
            GEOCODING_URL,
            {"name": city, "count": 1, "language": "en", "format": "json"},
        )

        results = geo.get("results") or []
        if not results:
            raise HTTPException(
                status_code=404,
                detail=f'Could not find "{city}". Try a nearby city name.',
            )

        place = results[0]
        lat = place["latitude"]
        lon = place["longitude"]
        timezone_name = place.get("timezone") or "auto"

        weather_params = {
            "latitude": lat,
            "longitude": lon,
            "timezone": timezone_name,
            "forecast_days": 2,
            "current": (
                "temperature_2m,relative_humidity_2m,"
                "wind_speed_10m,weather_code"
            ),
            "hourly": (
                "temperature_2m,relative_humidity_2m,"
                "wind_speed_10m"
            ),
        }

        air_params = {
            "latitude": lat,
            "longitude": lon,
            "timezone": timezone_name,
            "forecast_days": 2,
            "current": "pm2_5,pm10,us_aqi",
            "hourly": "pm2_5,pm10,us_aqi",
        }

        weather, air = await __import__("asyncio").gather(
            get_json(client, WEATHER_URL, weather_params),
            get_json(client, AIR_URL, air_params),
        )

    weather_current = weather.get("current") or {}
    air_current = air.get("current") or {}
    units = {
        **weather.get("current_units", {}),
        **air.get("current_units", {}),
    }

    pm25 = air_current.get("pm2_5")
    pm10 = air_current.get("pm10")
    us_aqi = air_current.get("us_aqi")
    current_time = weather_current.get("time")

    weather_codes = {
        0: "Clear sky",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        48: "Depositing rime fog",
        51: "Light drizzle",
        53: "Drizzle",
        55: "Heavy drizzle",
        61: "Light rain",
        63: "Rain",
        65: "Heavy rain",
        71: "Light snow",
        73: "Snow",
        75: "Heavy snow",
        80: "Rain showers",
        81: "Rain showers",
        82: "Heavy rain showers",
        95: "Thunderstorm",
        96: "Thunderstorm with hail",
        99: "Thunderstorm with heavy hail",
    }
    weather_code = weather_current.get("weather_code")

    # Merge hourly series by their timestamps.
    weather_hourly = weather.get("hourly") or {}
    air_hourly = air.get("hourly") or {}
    weather_times = weather_hourly.get("time") or []
    air_times = air_hourly.get("time") or []
    air_index = {t: i for i, t in enumerate(air_times)}

    hourly_forecast = []
    for i, timestamp in enumerate(weather_times):
        if timestamp < (current_time or timestamp):
            continue
        j = air_index.get(timestamp)
        if j is None:
            continue

        hourly_forecast.append({
            "time": timestamp,
            "pm2_5": value_at(air, "pm2_5", j),
            "pm10": value_at(air, "pm10", j),
            "us_aqi": value_at(air, "us_aqi", j),
            "temperature": value_at(weather, "temperature_2m", i),
            "humidity": value_at(weather, "relative_humidity_2m", i),
            "wind_speed": value_at(weather, "wind_speed_10m", i),
        })

        if len(hourly_forecast) >= 24:
            break

    if not hourly_forecast:
        # Keep a valid response if the providers' hourly grids do not align.
        for i, timestamp in enumerate(air_times):
            if timestamp < (current_time or timestamp):
                continue
            hourly_forecast.append({
                "time": timestamp,
                "pm2_5": value_at(air, "pm2_5", i),
                "pm10": value_at(air, "pm10", i),
                "us_aqi": value_at(air, "us_aqi", i),
                "temperature": None,
                "humidity": None,
                "wind_speed": None,
            })
            if len(hourly_forecast) >= 24:
                break

    return {
        "location": {
            "name": place.get("name", city),
            "admin1": place.get("admin1"),
            "country": place.get("country"),
            "latitude": lat,
            "longitude": lon,
            "timezone": timezone_name,
        },
        "updated_at": current_time,
        "data_source": "Open-Meteo",
        "data_note": (
            "These are model-based current-condition estimates and forecasts, "
            "not readings from a local regulatory monitoring station."
        ),
        "pollution": {
            "pm2_5": pm25,
            "pm10": pm10,
            "us_aqi": us_aqi,
            "aqi_status": aqi_label(us_aqi),
        },
        "weather": {
            "temperature": weather_current.get("temperature_2m"),
            "humidity": weather_current.get("relative_humidity_2m"),
            "wind_speed": weather_current.get("wind_speed_10m"),
            "weather_code": weather_code,
            "description": weather_codes.get(
                weather_code, "Weather conditions"
            ),
        },
        "units": units,
        "forecast": {
            "hourly": hourly_forecast,
            "source": "Open-Meteo hourly forecast",
            "hours": len(hourly_forecast),
        },
        "guidance": build_guidance(us_aqi, pm25),
        "model_status": "not_used",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

