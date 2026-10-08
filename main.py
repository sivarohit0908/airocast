from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx

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
return {"message": "AIROCAST backend is running!", "status": "online"}

@app.get("/api/health")
def health_check():
return {"status": "healthy", "service": "AIROCAST API"}

@app.get("/api/analyze")
async def analyze(location: str):
location = location.strip()
if not location:
raise HTTPException(status_code=400, detail="Please enter a location.")

```
try:
    async with httpx.AsyncClient(timeout=25.0) as client:
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

        if not geo_data.get("results"):
            raise HTTPException(
                status_code=404,
                detail=f"Location '{location}' was not found.",
            )

        place = geo_data["results"][0]

        weather_response = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": place["latitude"],
                "longitude": place["longitude"],
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
                detail="Weather data was not returned by the provider.",
            )

        return {
            "status": "success",
            "location": {
                "searched": location,
                "name": place.get("name"),
                "country": place.get("country"),
                "latitude": place.get("latitude"),
                "longitude": place.get("longitude"),
            },
            "weather": {
                "temperature": current.get("temperature_2m"),
                "humidity": current.get("relative_humidity_2m"),
                "wind_speed": current.get("wind_speed_10m"),
                "wind_direction": current.get("wind_direction_10m"),
            },
            "pollution": {
                "pm25": None,
                "status": "PM2.5 integration coming next",
            },
            "prediction": {
                "forecast_30_60_min": None,
                "status": "AI prediction model coming next",
            },
        }

except HTTPException:
    raise
except httpx.TimeoutException:
    raise HTTPException(
        status_code=504,
        detail="Weather service timed out. Please try again.",
    )
except httpx.HTTPStatusError as exc:
    raise HTTPException(
        status_code=502,
        detail=f"External data provider returned HTTP {exc.response.status_code}.",
    )
except (httpx.RequestError, ValueError):
    raise HTTPException(
        status_code=502,
        detail="Could not retrieve data from the external weather service.",
    )
```


