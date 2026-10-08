// ==========================================
// AIROCAST - FRONTEND JAVASCRIPT
// ==========================================

// 🔴 REPLACE THIS with your Render backend URL
const BACKEND_URL = "YOUR-RENDER-URL-HERE";


// ------------------------------------------
// GET HTML ELEMENTS
// ------------------------------------------

const analyzeButton = document.getElementById("analyzeBtn");
const locationInput = document.getElementById("locationInput");
const currentLocationButton = document.getElementById("currentLocationBtn");
const dashboard = document.getElementById("dashboard");


// ------------------------------------------
// ANALYZE LOCATION
// ------------------------------------------

analyzeButton.addEventListener("click", async () => {

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

        if (!response.ok) {
            throw new Error("Backend request failed");
        }

        const data = await response.json();

        console.log("AIROCAST RESPONSE:", data);

        displayResults(data);

    } catch (error) {

        console.error("AIROCAST ERROR:", error);

        alert(
            "Unable to connect to AIROCAST.\n\n" +
            "Please check that the backend is running."
        );

    } finally {

        analyzeButton.disabled = false;
        analyzeButton.textContent = "Analyze";

    }

});


// ------------------------------------------
// DISPLAY RESULTS
// ------------------------------------------

function displayResults(data) {

    if (!dashboard) {
        console.error("Dashboard element not found.");
        return;
    }

    dashboard.style.display = "block";


    // PM2.5
    const pm25Element = document.getElementById("pm25");

    if (pm25Element) {

        if (data.pollution && data.pollution.pm25 !== null) {
            pm25Element.textContent = data.pollution.pm25;
        } else {
            pm25Element.textContent = "--";
        }

    }


    // Temperature
    const temperatureElement = document.getElementById("temperature");

    if (temperatureElement) {

        if (
            data.weather &&
            data.weather.temperature !== null &&
            data.weather.temperature !== undefined
        ) {
            temperatureElement.textContent =
                `${data.weather.temperature}°C`;
        } else {
            temperatureElement.textContent = "--";
        }

    }


    // Humidity
    const humidityElement = document.getElementById("humidity");

    if (humidityElement) {

        if (
            data.weather &&
            data.weather.humidity !== null &&
            data.weather.humidity !== undefined
        ) {
            humidityElement.textContent =
                `${data.weather.humidity}%`;
        } else {
            humidityElement.textContent = "--";
        }

    }


    // Wind
    const windElement = document.getElementById("wind");

    if (windElement) {

        if (
            data.weather &&
            data.weather.wind_speed !== null &&
            data.weather.wind_speed !== undefined
        ) {
            windElement.textContent =
                `${data.weather.wind_speed} km/h`;
        } else {
            windElement.textContent = "--";
        }

    }


    // Location information
    if (data.location) {

        console.log(
            "Location:",
            data.location.name,
            data.location.country
        );

    }


    // Prediction
    const predictionElement =
        document.getElementById("prediction");

    if (predictionElement) {

        if (
            data.prediction &&
            data.prediction.forecast_30_60_min !== null
        ) {

            predictionElement.textContent =
                data.prediction.forecast_30_60_min;

        } else {

            predictionElement.textContent =
                "Coming soon";

        }

    }


    console.log("AIROCAST dashboard updated.");

}


// ------------------------------------------
// CURRENT LOCATION
// ------------------------------------------

currentLocationButton.addEventListener("click", () => {

    if (!navigator.geolocation) {

        alert(
            "Your browser does not support location services."
        );

        return;
    }


    currentLocationButton.disabled = true;
    currentLocationButton.textContent = "Getting location...";


    navigator.geolocation.getCurrentPosition(

        async (position) => {

            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;

            console.log(
                "Current coordinates:",
                latitude,
                longitude
            );


            try {

                // Reverse geocode coordinates
                const response = await fetch(
                    `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&count=1&language=en&format=json`
                );


                if (!response.ok) {
                    throw new Error(
                        "Could not determine location"
                    );
                }


                const data = await response.json();


                if (
                    data.results &&
                    data.results.length > 0
                ) {

                    const place = data.results[0];

                    locationInput.value =
                        place.name || "Current location";


                    // Automatically analyze
                    analyzeButton.click();

                } else {

                    alert(
                        "Could not determine your location name."
                    );

                }

            } catch (error) {

                console.error(
                    "Location error:",
                    error
                );

                alert(
                    "Could not determine your current location."
                );

            } finally {

                currentLocationButton.disabled = false;

                currentLocationButton.textContent =
                    "Use my current location";

            }

        },


        (error) => {

            console.error(
                "Geolocation error:",
                error
            );

            alert(
                "Unable to access your location.\n\n" +
                "Please allow location access in your browser."
            );


            currentLocationButton.disabled = false;

            currentLocationButton.textContent =
                "Use my current location";

        }

    );

});


// ------------------------------------------
// ENTER KEY SUPPORT
// ------------------------------------------

locationInput.addEventListener("keydown", (event) => {

    if (event.key === "Enter") {

        analyzeButton.click();

    }

});


// ------------------------------------------
// STARTUP MESSAGE
// ------------------------------------------

console.log(
    "🌍 AIROCAST frontend loaded successfully."
);

console.log(
    "🚀 Backend:",
    BACKEND_URL
);
