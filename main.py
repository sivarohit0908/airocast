```python
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx

app = FastAPI(
    title="AIROCAST API",
    description="AI-powered pollution intelligence backend",
    version="1.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://sivarohit0908.github.io",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
WEATHER_URL = "https://api.open-meteo.com/v1/forecast"


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
    location = location.strip()

    if not location:
        raise HTTPException(
            status_code=400,
            detail="Please enter a location."
        )

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(25.0, connect=10.0),
            follow_redirects=True
        ) as client:

            # Find the location
            geo_response = await client.get(
                GEOCODING_URL,
                params={
                    "name": location,
                    "count": 1,
                    "language": "en",
                    "format": "json"
                },
                headers={"User-Agent": "AIROCAST/1.1"}
            )
            geo_response.raise_for_status()
            geo_data = geo_response.json()

            if not geo_data.get("results"):
                raise HTTPException(
                    status_code=404,
                    detail=f"Location '{location}' was not found."
                )

            place = geo_data["results"][0]
            latitude = place["latitude"]
            longitude = place["longitude"]

            # Retrieve current weather
            weather_response = await client.get(
                WEATHER_URL,
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
                },
                headers={"User-Agent": "AIROCAST/1.1"}
            )
            weather_response.raise_for_status()
            weather_data = weather_response.json()

            current = weather_data.get("current")
            if not current:
                raise HTTPException(
                    status_code=502,
                    detail="Weather provider returned no current weather data."
                )

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
                    "status": "Live PM2.5 integration coming next"
                },
                "prediction": {
                    "forecast_30_60_min": None,
                    "status": "AI prediction model coming next"
                }
            }

    except HTTPException:
        raise

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="A data provider timed out. Please try again."
        )

    except httpx.HTTPStatusError as exc:
        provider_status = exc.response.status_code
        raise HTTPException(
            status_code=502,
            detail=(
                "An external data provider returned an error "
                f"(HTTP {provider_status}). Please try again later."
            )
        )

    except (httpx.RequestError, ValueError):
        raise HTTPException(
            status_code=502,
            detail=(
                "Could not retrieve weather data from Open-Meteo. "
                "Please try again shortly."
            )
        )
```

