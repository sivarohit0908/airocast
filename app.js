const BACKEND_URL = "https://airocast.onrender.com";

const analyzeButton = document.getElementById("analyzeBtn");
const locationInput = document.getElementById("locationInput");
const currentLocationButton = document.getElementById("currentLocationBtn");
const dashboard = document.getElementById("dashboard");

function setText(id, value) {
const element = document.getElementById(id);
if (element) {
element.textContent = value;
}
}

async function analyzeLocation() {
const location = locationInput.value.trim();

```
if (!location) {
    alert("Please enter a location.");
    return;
}

analyzeButton.disabled = true;
analyzeButton.textContent = "Analyzing...";

try {
    const response = await fetch(
        `${BACKEND_URL}/api/analyze?location=${encodeURIComponent(location)}`
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.detail || "Could not retrieve data.");
    }

    console.log("AIROCAST response:", data);

    dashboard.style.display = "block";

    // PM2.5: support both the current and older API field names.
    const pm25 = data.pollution?.pm2_5 ?? data.pollution?.pm25;
    setText("pm25", pm25 != null ? `${pm25} µg/m³` : "--");

    // Weather readings.
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

    // Forecast: support the current nested response and older formats.
    const forecast = data.prediction?.forecast_30_60_min;
    let predictionText = "Prediction unavailable";

    if (forecast && typeof forecast === "object") {
        const in30 = forecast.forecast_30_min;
        const in60 = forecast.forecast_60_min;

        if (in30 != null && in60 != null) {
            predictionText =
                `30 min: ${in30} µg/m³ | 60 min: ${in60} µg/m³`;
        }
    } else if (typeof forecast === "string") {
        predictionText = forecast;
    } else if (
        data.prediction?.pm25_in_30_min != null &&
        data.prediction?.pm25_in_60_min != null
    ) {
        predictionText =
            `30 min: ${data.prediction.pm25_in_30_min} µg/m³ | ` +
            `60 min: ${data.prediction.pm25_in_60_min} µg/m³`;
    }

    setText("prediction", predictionText);

    // Display AQI if its element exists in the HTML.
    if (data.pollution?.us_aqi != null) {
        setText("aqi", data.pollution.us_aqi);
    }

    dashboard.scrollIntoView({ behavior: "smooth" });

} catch (error) {
    console.error("AIROCAST analysis error:", error);
    alert(error.message || "Could not connect to AIROCAST. Please try again.");

} finally {
    analyzeButton.disabled = false;
    analyzeButton.textContent = "Analyze";
}
```

}

if (analyzeButton) {
analyzeButton.addEventListener("click", analyzeLocation);
}

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

                // Reverse geocode coordinates to find the user's city.
                const response = await fetch(
                    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
                );

                if (!response.ok) {
                    throw new Error("Location lookup failed.");
                }

                const data = await response.json();
                const city =
                    data.city ||
                    data.locality ||
                    data.principalSubdivision;

                if (city) {
                    locationInput.value = city;
                    await analyzeLocation();
                } else {
                    alert("Could not find your city. Please enter it manually.");
                }
            } catch (error) {
                console.error(error);
                alert("Could not determine your location. Please enter your city manually.");
            } finally {
                currentLocationButton.disabled = false;
                currentLocationButton.textContent = "Use my current location";
            }
        },
        () => {
            alert("Location access was denied. Please allow it in your browser.");
            currentLocationButton.disabled = false;
            currentLocationButton.textContent = "Use my current location";
        }
    );
});
```

}

if (locationInput) {
locationInput.addEventListener("keydown", (event) => {
if (event.key === "Enter") {
analyzeLocation();
}
});
}

console.log("AIROCAST loaded.");

