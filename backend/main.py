from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx

app = FastAPI(
    title="AIROCAST API",
    description="AI-powered pollution intelligence backend",
    version="1.0.0"
)

# Allow our GitHub Pages frontend to communicate with the backend.
# We will restrict this later when the project is deployed properly.
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
    """
    Analyze a location and return its coordinates and current weather.
    Example:
    /api/analyze?location=Hyderabad
    """

    if not location.strip():
        raise HTTPException(
            status_code=400,
            detail="Location cannot be empty"
        )

    async with httpx.AsyncClient(timeout=15.0) as client:

        # --------------------------------------------------
        # 1. Convert location name → latitude/longitude
        # --------------------------------------------------
        geocode_url = "https://geocoding-api.open-meteo.com/v1/search"

        geocode_params = {
            "name": location,
            "count": 1,
            "language": "en",
            "format": "json"
        }

        geocode_response = await client.get(
            geocode_url,
            params=geocode_params
        )

        if geocode_response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail="Could not contact location service"
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

        # --------------------------------------------------
        # 2. Get current weather
        # --------------------------------------------------
        weather_url = "https://api.open-meteo.com/v1/forecast"

        weather_params = {
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

        weather_response = await client.get(
            weather_url,
            params=weather_params
        )

        if weather_response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail="Could not contact weather service"
            )

        weather_data = weather_response.json()

        current_weather = weather_data.get("current", {})

    # --------------------------------------------------
    # 3. Return AIROCAST response
    # --------------------------------------------------
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
            "temperature": current_weather.get("temperature_2m"),
            "humidity": current_weather.get("relative_humidity_2m"),
            "wind_speed": current_weather.get("wind_speed_10m"),
            "wind_direction": current_weather.get("wind_direction_10m")
        },

        "pollution": {
            "pm25": None,
            "status": "Coming in next step"
        },

        "prediction": {
            "forecast_30_60_min": None,
            "status": "AI model will be connected next"
        }
    }
