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

        // Pollution readings
        setText("pm25", data.pollution?.pm25 ?? "--");

        // Weather readings
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
                ? `${data.weather.wind_speed} km/h`
                : "--"
        );

        // Prediction is a placeholder until a prediction model is added.
        setText(
            "prediction",
            data.prediction?.forecast_30_60_min ?? "Coming soon"
        );

        // Add AQI only if the HTML already has an element for it.
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

        currentLocationButton.disabled = true;
        currentLocationButton.textContent = "Getting location...";

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const { latitude, longitude } = position.coords;

                    const response = await fetch(
                        `https://geocoding-api.open-meteo.com/v1/search?name=${latitude},${longitude}&count=1&language=en&format=json`
                    );

                    if (!response.ok) {
                        throw new Error("Location lookup failed.");
                    }

                    const data = await response.json();

                    if (data.results?.length) {
                        locationInput.value = data.results[0].name;
                        await analyzeLocation();
                    } else {
                        // Fallback: use coordinates as the location query.
                        locationInput.value = `${latitude},${longitude}`;
                        alert(
                            "Could not find your city name. Please enter your city manually."
                        );
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
}

if (locationInput) {
    locationInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            analyzeLocation();
        }
    });
}

console.log("AIROCAST loaded.");
