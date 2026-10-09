
import os
import glob
import joblib
import httpx
import numpy as np

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AIROCAST API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://sivarohit0908.github.io",
    ],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(
    BASE_DIR, "random_forest_pm25.joblib"
)

model = None
model_load_error = None

try:
    if os.path.exists(MODEL_PATH):
        model = joblib.load(MODEL_PATH)
    else:
        model_load_error = (
            "Model file not found: random_forest_pm25.joblib"
        )
except Exception as exc:
    model_load_error = f"Model loading failed: {type(exc).__name__}"


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
        "model_loaded": model is not None,
        "model_error": model_load_error,
    }


async def get_coordinates(client, location):
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
        raise ValueError(f"Location not found: {location}")

    place = results[0]
    return {
        "name": place.get("name", location),
        "latitude": place["latitude"],
        "longitude": place["longitude"],
        "country": place.get("country"),
    }


async def get_pollution(client, latitude, longitude):
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
    if not OPENWEATHER_API_KEY:
        return None, "OPENWEATHER_API_KEY is not configured"

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
        weather = response.json()

        return {
            "temperature": weather.get("main", {}).get("temp"),
            "humidity": weather.get("main", {}).get("humidity"),
            "wind_speed": weather.get("wind", {}).get("speed"),
            "description": (
                weather.get("weather", [{}])[0].get("description")
            ),
        }, "ok"

    except httpx.HTTPStatusError as exc:
        return None, f"OpenWeather HTTP error: {exc.response.status_code}"
    except httpx.RequestError:
        return None, "OpenWeather connection error"


def interpolate_pm25(hourly):
    values = hourly.get("pm2_5", [])
    times = hourly.get("time", [])

    forecast = []
    for minutes in (30, 60):
        index = min(minutes // 60, max(len(values) - 1, 0))

        if not values:
            forecast.append(None)
        elif minutes < 60 and len(values) >= 2:
            first, second = values[0], values[1]
            if first is None or second is None:
                forecast.append(None)
            else:
                forecast.append(round((first + second) / 2, 2))
        else:
            value = values[index]
            forecast.append(
                round(value, 2) if value is not None else None
            )

    return {
        "forecast_30_min": forecast[0],
        "forecast_60_min": forecast[1],
        "forecast_times": times[:2],
        "source": "Open-Meteo forecast, not ML",
    }


def predict_with_model(pollution, weather):
    """
    The trained model expects all of its training features.
    Do not fabricate missing values and present the output as
    a reliable local forecast. Return unavailable until actual
    feature inputs are supplied.
    """
    if model is None:
        return {
            "available": False,
            "value": None,
            "message": model_load_error or "Model unavailable",
        }

    return {
        "available": False,
        "value": None,
        "message": (
            "Model loaded, but the live API does not yet provide "
            "all trained features and PM2.5 history. ML prediction "
            "is disabled until those inputs are connected."
        ),
    }


@app.get("/api/analyze")
async def analyze(
    location: str = Query("Hyderabad", min_length=2, max_length=100)
):
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            place = await get_coordinates(client, location)
            latitude = place["latitude"]
            longitude = place["longitude"]

            pollution_data = await get_pollution(
                client, latitude, longitude
            )
            weather, weather_status = await get_weather(
                client, latitude, longitude
            )

        current = pollution_data.get("current", {})
        hourly = pollution_data.get("hourly", {})

        pm25 = current.get("pm2_5")
        pm10 = current.get("pm10")
        us_aqi = current.get("us_aqi")

        return {
            "location": place,
            "pollution": {
                "pm2_5": pm25,
                "pm10": pm10,
                "us_aqi": us_aqi,
                "source": "Open-Meteo",
            },
            "weather": weather,
            "weather_status": weather_status,
            "prediction": {
                "forecast_30_60_min": interpolate_pm25(hourly),
                "ml_model": predict_with_model(
                    pollution_data, weather
                ),
            },
            "model_status": (
                "loaded" if model is not None else "unavailable"
            ),
        }

    except ValueError as exc:
        return {
            "error": str(exc),
            "location": location,
        }
    except httpx.HTTPStatusError as exc:
        return {
            "error": "An upstream data service returned an error",
            "status_code": exc.response.status_code,
        }
    except httpx.RequestError:
        return {
            "error": "Could not connect to an upstream data service"
        }


