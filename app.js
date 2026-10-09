const BACKEND_URL = "https://airocast.onrender.com";

const searchForm = document.getElementById("searchForm");
const analyzeButton = document.getElementById("analyzeBtn");
const locationInput = document.getElementById("locationInput");
const currentLocationButton = document.getElementById("currentLocationBtn");
const dashboard = document.getElementById("dashboard");

function setText(id, value) {
const element = document.getElementById(id);
if (element) element.textContent = value;
}

async function analyzeLocation(event) {
if (event) event.preventDefault();

```
const location = locationInput?.value.trim();

if (!location) {
    alert("Please enter a city name.");
    return;
}

if (analyzeButton) {
    analyzeButton.disabled = true;
    analyzeButton.textContent = "Analyzing...";
}

setText("dataStatus", "Loading live pollution and weather data...");

try {
    const response = await fetch(
        `${BACKEND_URL}/api/analyze?location=${encodeURIComponent(location)}`
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.detail || "Could not retrieve data.");
    }

    console.log("AIROCAST response:", data);

    if (dashboard) dashboard.style.display = "block";

    setText("locationName", data.location?.name || location);

    // PM2.5: support current and older backend field names.
    const pm25 = data.pollution?.pm2_5 ?? data.pollution?.pm25;
    setText("pm25", pm25 != null ? `${pm25} µg/m³` : "--");

    setText(
        "aqi",
        data.pollution?.us_aqi != null ? data.pollution.us_aqi : "--"
    );

    setText(
        "temperature",
        data.weather?.temperature != null
            ? `${data.weather.temperature}°C`
            : "--"
    );

    setText(
        "humidity",
        data.weather?.humidity != null
            ? `${data.weather.humidity}%`
            : "--"
    );

    setText(
        "wind",
        data.weather?.wind_speed != null
            ? `${data.weather.wind_speed} m/s`
            : "--"
    );

    setText(
        "weatherDescription",
        data.weather?.description || "--"
    );

    // Read the current forecast response structure.
    const forecast = data.prediction?.forecast_30_60_min;
    let predictionText = "Forecast currently unavailable.";

    if (forecast && typeof forecast === "object") {
        const in30 = forecast.forecast_30_min;
        const in60 = forecast.forecast_60_min;

        if (in30 != null && in60 != null) {
            predictionText =
                `30 minutes: ${in30} µg/m³ | 60 minutes: ${in60} µg/m³`;
        }
    } else if (typeof forecast === "string") {
        predictionText = forecast;
    } else if (
        data.prediction?.pm25_in_30_min != null &&
        data.prediction?.pm25_in_60_min != null
    ) {
        predictionText =
            `30 minutes: ${data.prediction.pm25_in_30_min} µg/m³ | ` +
            `60 minutes: ${data.prediction.pm25_in_60_min} µg/m³`;
    }

    setText("prediction", predictionText);

    const forecastSource =
        forecast?.source ||
        data.prediction?.source ||
        "External forecast estimate; not an ML prediction.";

    setText("predictionSource", forecastSource);
    setText("dataStatus", "Data loaded successfully.");

    if (dashboard) {
        dashboard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

} catch (error) {
    console.error("AIROCAST analysis error:", error);
    setText("dataStatus", `Error: ${error.message}`);
    alert(error.message || "Could not connect to AIROCAST. Please try again.");

} finally {
    if (analyzeButton) {
        analyzeButton.disabled = false;
        analyzeButton.textContent = "Analyze";
    }
}
```

}

// Handle form submission once. This prevents the page from reloading.
if (searchForm) {
searchForm.addEventListener("submit", analyzeLocation);
} else if (analyzeButton) {
analyzeButton.addEventListener("click", analyzeLocation);
}

// Current-location button.
if (currentLocationButton) {
currentLocationButton.addEventListener("click", () => {
if (!navigator.geolocation) {
alert("Your browser does not support location services.");
return;
}

```
    currentLocationButton.disabled = true;
    currentLocationButton.textContent = "Getting location...";

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            try {
                const { latitude, longitude } = position.coords;

                const response = await fetch(
                    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
                );

                if (!response.ok) {
                    throw new Error("Could not look up your location.");
                }

                const result = await response.json();
                const city =
                    result.city ||
                    result.locality ||
                    result.principalSubdivision;

                if (!city) {
                    throw new Error("City not found. Please enter it manually.");
                }

                locationInput.value = city;
                await analyzeLocation();

            } catch (error) {
                console.error("Location error:", error);
                alert(error.message || "Could not determine your location.");

            } finally {
                currentLocationButton.disabled = false;
                currentLocationButton.textContent = "Use my current location";
            }
        },
        (error) => {
            console.error("Geolocation error:", error);
            alert("Location access failed. Allow location permission or enter your city manually.");
            currentLocationButton.disabled = false;
            currentLocationButton.textContent = "Use my current location";
        }
    );
});
```

}

console.log("AIROCAST loaded successfully.");
