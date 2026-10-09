
import os
import logging

import httpx
import joblib
import numpy as np
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("airocast")

app = FastAPI(title="AIROCAST API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://sivarohit0908.github.io"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "random_forest_pm25.joblib")
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")

# Load the trained model safely at startup.
model = None
model_load_error = None

try:
    if os.path.isfile(MODEL_PATH):
        model = joblib.load(MODEL_PATH)
        logger.info("Random Forest model loaded successfully.")
    else:
        model_load_error = (
            "Model file not found at the repository root. "
            "Expected random_forest_pm25.joblib."
        )
        logger.warning(model_load_error)
except Exception as exc:
    model_load_error = f"{type(exc).__name__}: {str(exc)[:200]}"
    logger.exception("Could not load the Random Forest model.")


@app.get("/")
def home():
    return {
        "message": "AIROCAST API is running",
        "model_loaded": model is not None,
    }


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "AIROCAST API",
        "model_loaded": model is not None,
        "model_error": model_load_error,
    }


async def get_location(client, location):
    response = await client.get(
        "https://geocoding-api.open-meteo.com/v1/search",
        params={
            "name": location,
            "count": 1,
            "language": "en",
            "format": "json",
        },
    )
    response.raise_for_status()
    results = response.json().get("results", [])

    if not results:
        raise HTTPException(
            status_code=404,
            detail=f"Location not found: {location}",
        )

    place = results[0]
    return {
        "searched": location,
        "name": place.get("name", location),
        "country": place.get("country", ""),
        "latitude": place["latitude"],
        "longitude": place["longitude"],
    }


async def get_air_quality(client, latitude, longitude):
    response = await client.get(
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
    response.raise_for_status()
    return response.json()


async def get_weather(client, latitude, longitude):
    # Prefer the configured OpenWeather service.
    if OPENWEATHER_API_KEY:
        try:
            response = await client.get(
                "https://api.openweathermap.org/data/2.5/weather",
                params={
                    "lat": latitude,
                    "lon": longitude,
                    "appid": OPENWEATHER_API_KEY,
                    "units": "metric",
                },
            )
            response.raise_for_status()
            result = response.json()
            main = result.get("main", {})
            wind = result.get("wind", {})

            return {
                "temperature": main.get("temp"),
                "humidity": main.get("humidity"),
                "wind_speed": wind.get("speed"),
                "wind_direction": wind.get("deg"),
                "description": result.get("weather", [{}])[0].get(
                    "description"
                ),
                "source": "OpenWeather",
            }, "success"

        except httpx.HTTPStatusError as exc:
            logger.warning(
                "OpenWeather returned HTTP %s",
                exc.response.status_code,
            )
            weather_status = (
                f"OpenWeather HTTP error: {exc.response.status_code}"
            )
        except httpx.RequestError:
            weather_status = "OpenWeather connection error"
    else:
        weather_status = "OpenWeather API key not configured"

    # Fallback to Open-Meteo so weather can still be displayed.
    try:
        response = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": latitude,
                "longitude": longitude,
                "current": (
                    "temperature_2m,relative_humidity_2m,"
                    "wind_speed_10m,wind_direction_10m"
                ),
                "timezone": "auto",
            },
        )
        response.raise_for_status()
        current = response.json().get("current", {})

        return {
            "temperature": current.get("temperature_2m"),
            "humidity": current.get("relative_humidity_2m"),
            "wind_speed": current.get("wind_speed_10m"),
            "wind_direction": current.get("wind_direction_10m"),
            "source": "Open-Meteo",
        }, f"success (fallback; {weather_status})"

    except (httpx.HTTPError, ValueError):
        return None, weather_status


def make_forecast(air_data):
    current = air_data.get("current", {})
    hourly = air_data.get("hourly", {})
    values = hourly.get("pm2_5", [])

    # Open-Meteo hourly forecast: interpolate between the
    # current value and the next hourly forecast when possible.
    current_pm25 = current.get("pm2_5")
    next_pm25 = values[1] if len(values) > 1 else None

    def valid_number(value):
        return (
            isinstance(value, (int, float))
            and np.isfinite(value)
        )

    pm30 = None
    pm60 = None
    trend = "unavailable"

    if valid_number(current_pm25) and valid_number(next_pm25):
        pm30 = round((current_pm25 + next_pm25) / 2, 1)
        pm60 = round(float(next_pm25), 1)

        difference = next_pm25 - current_pm25
        if difference > 1:
            trend = "rising"
        elif difference < -1:
            trend = "falling"
        else:
            trend = "stable"

        forecast_text = (
            f"Estimated PM2.5: {pm30} µg/m³ in 30 min; "
            f"{pm60} µg/m³ in 60 min. Trend: {trend}. "
            "Based on Open-Meteo hourly forecast."
        )
        status = "success"
    else:
        forecast_text = "PM2.5 forecast is currently unavailable."
        status = "unavailable"

    return {
        "forecast_30_60_min": forecast_text,
        "pm25_in_30_min": pm30,
        "pm25_in_60_min": pm60,
        "trend": trend,
        "status": status,
        "source": "Open-Meteo hourly air-quality forecast",
        "method": "Hourly forecast interpolation",
        "note": (
            "External forecast, not an AIROCAST ML prediction."
        ),
    }


@app.get("/api/analyze")
async def analyze(
    location: str = Query(
        default="Hyderabad", min_length=2, max_length=100
    )
):
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            place = await get_location(client, location)
            latitude = place["latitude"]
            longitude = place["longitude"]

            air_data = await get_air_quality(
                client, latitude, longitude
            )
            weather, weather_status = await get_weather(
                client, latitude, longitude
            )

        current = air_data.get("current", {})
        pm25 = current.get("pm2_5")
        pm10 = current.get("pm10")
        us_aqi = current.get("us_aqi")

        # The trained model requires pollutant history and all
        # training features. The live API does not supply the
        # complete, correctly aligned feature set yet.
        ml_prediction = {
            "available": False,
            "value": None,
            "status": (
                "model_loaded_but_inputs_missing"
                if model is not None
                else "model_unavailable"
            ),
            "message": (
                "Model loaded, but ML predictions are disabled "
                "until matching historical and weather features "
                "are connected."
                if model is not None
                else model_load_error or "Model is not loaded."
            ),
        }

        return {
            "status": "success",
            "location": place,
            "weather": weather,
            "weather_status": weather_status,
            "pollution": {
                "pm25": pm25,
                "pm10": pm10,
                "us_aqi": us_aqi,
                "unit": "µg/m³",
                "status": "success",
                "source": "Open-Meteo Air Quality API",
            },
            "prediction": {
                **make_forecast(air_data),
                "ml_prediction": ml_prediction,
            },
            "model_status": {
                "loaded": model is not None,
                "error": model_load_error,
            },
            "data_attribution": (
                "Air quality and fallback weather: Open-Meteo. "
                "Weather when available: OpenWeather."
            ),
        }

    except HTTPException:
        raise
    except httpx.HTTPStatusError as exc:
        logger.exception("An upstream API returned an HTTP error.")
        raise HTTPException(
            status_code=502,
            detail=(
                "An upstream data service returned HTTP "
                f"{exc.response.status_code}."
            ),
        )
    except httpx.RequestError:
        logger.exception("Could not connect to an upstream API.")
        raise HTTPException(
            status_code=502,
            detail="Could not connect to an upstream data service.",
        )

