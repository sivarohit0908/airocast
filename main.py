from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx

app = FastAPI(
    title="AIROCAST API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://sivarohit0908.github.io",
    ],
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
            # Find the requested location.
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
            geo_data = geo_response.json()

            results = geo_data.get("results", [])

            if not results:
                raise HTTPException(
                    status_code=404,
                    detail=f"Location '{location}' was not found. Try another city name.",
                )

            place = results[0]
            latitude = place["latitude"]
            longitude = place["longitude"]

            # Get current weather for that location.
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
            weather_data = weather_response.json()
            current = weather_data.get("current")

            if not current:
                raise HTTPException(
                    status_code=502,
                    detail="The weather service returned no current weather data.",
                )

            return {
                "status": "success",
                "location": {
                    "searched": location,
                    "name": place.get("name", location),
                    "country": place.get("country", ""),
                    "latitude": latitude,
                    "longitude": longitude,
                },
                "weather": {
                    "temperature": current.get("temperature_2m"),
                    "humidity": current.get("relative_humidity_2m"),
                    "wind_speed": current.get("wind_speed_10m"),
                    "wind_direction": current.get("wind_direction_10m"),
                },
                "pollution": {
                    "pm25": None,
                    "status": "PM2.5 data is not connected yet.",
                },
                "prediction": {
                    "forecast_30_60_min": None,
                    "status": "AI pollution prediction is not connected yet.",
                },
            }

    except HTTPException:
        raise

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="The weather service took too long to respond. Please try again.",
        )

    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"An external weather service returned HTTP {exc.response.status_code}.",
        )

    except (httpx.RequestError, ValueError, KeyError):
        raise HTTPException(
            status_code=502,
            detail="Could not retrieve location or weather data. Please try again.",
        )


if __name__ == "__main__":
    import os
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
    )


