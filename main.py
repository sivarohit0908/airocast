from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx

app = FastAPI(
    title="AIROCAST API",
    description="AI-powered pollution intelligence backend",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "message": "AIROCAST backend is running!",
        "status": "online"
    }


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "AIROCAST API"
    }


@app.get("/api/analyze")
async def analyze(location: str):

    if not location.strip():
        raise HTTPException(
            status_code=400,
            detail="Location cannot be empty"
        )

    async with httpx.AsyncClient(timeout=15.0) as client:

        # Find location coordinates
        geocode_response = await client.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={
                "name": location,
                "count": 1,
                "language": "en",
                "format": "json"
            }
        )

        if geocode_response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail="Location service unavailable"
            )

        geocode_data = geocode_response.json()

        if not geocode_data.get("results"):
            raise HTTPException(
                status_code=404,
                detail=f"Location '{location}' was not found"
            )

        place = geocode_data["results"][0]

        latitude = place["latitude"]
        longitude = place["longitude"]

        # Get weather
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
                "timezone": "auto"
            }
        )

        if weather_response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail="Weather service unavailable"
            )

        weather_data = weather_response.json()
        current = weather_data.get("current", {})

    return {
        "status": "success",

        "location": {
            "searched": location,
            "name": place.get("name"),
            "country": place.get("country"),
            "latitude": latitude,
            "longitude": longitude
        },

        "weather": {
            "temperature": current.get("temperature_2m"),
            "humidity": current.get("relative_humidity_2m"),
            "wind_speed": current.get("wind_speed_10m"),
            "wind_direction": current.get("wind_direction_10m")
        },

        "pollution": {
            "pm25": None,
            "status": "Pollution data coming next"
        },

        "prediction": {
            "forecast_30_60_min": None,
            "status": "AI model coming next"
        }
    }
