const analyzeButton = document.getElementById("analyzeBtn");
const locationInput = document.getElementById("locationInput");
const currentLocationButton = document.getElementById("currentLocationBtn");

const dashboard = document.getElementById("dashboard");


// ==========================================
// ANALYZE LOCATION
// ==========================================

analyzeButton.addEventListener("click", async () => {

    const location = locationInput.value.trim();

    if (!location) {
        alert("Please enter a location.");
        return;
    }

    analyzeButton.disabled = true;
    analyzeButton.textContent = "Analyzing...";

    try {

        // Backend URL will be added after deployment.
        // For now, this is only a placeholder.
        const BACKEND_URL = "YOUR_BACKEND_URL";

        if (BACKEND_URL === "YOUR_BACKEND_URL") {
            alert(
                "Frontend is ready! Backend deployment is the next step."
            );
            return;
        }

        const response = await fetch(
            `${BACKEND_URL}/api/analyze?location=${encodeURIComponent(location)}`
        );

        if (!response.ok) {
            throw new Error("Backend request failed.");
        }

        const data = await response.json();

        displayResults(data);

    } catch (error) {

        console.error(error);

        alert(
            "Unable to connect to AIROCAST backend."
        );

    } finally {

        analyzeButton.disabled = false;
        analyzeButton.textContent = "Analyze";

    }
});


// ==========================================
// DISPLAY RESULTS
// ==========================================

function displayResults(data) {

    dashboard.style.display = "block";

    console.log("AIROCAST DATA:", data);

    // Current PM2.5
    const pm25Element = document.getElementById("pm25");

    if (pm25Element) {
        pm25Element.textContent =
            data.pollution?.pm25 ?? "--";
    }

    // Temperature
    const temperatureElement =
        document.getElementById("temperature");

    if (temperatureElement) {
        temperatureElement.textContent =
            data.weather?.temperature
            ? `${data.weather.temperature}°C`
            : "--";
    }

    // Humidity
    const humidityElement =
        document.getElementById("humidity");

    if (humidityElement) {
        humidityElement.textContent =
            data.weather?.humidity
            ? `${data.weather.humidity}%`
            : "--";
    }

    // Wind
    const windElement =
        document.getElementById("wind");

    if (windElement) {
        windElement.textContent =
            data.weather?.wind_speed
            ? `${data.weather.wind_speed} km/h`
            : "--";
    }
}


// ==========================================
// USE CURRENT LOCATION
// ==========================================

currentLocationButton.addEventListener(
    "click",
    () => {

        if (!navigator.geolocation) {

            alert(
                "Your browser does not support location services."
            );

            return;
        }

        currentLocationButton.textContent =
            "Getting location...";

        navigator.geolocation.getCurrentPosition(

            (position) => {

                const latitude =
                    position.coords.latitude;

                const longitude =
                    position.coords.longitude;

                console.log(
                    "User coordinates:",
                    latitude,
                    longitude
                );

                alert(
                    `Location detected!\n\nLatitude: ${latitude}\nLongitude: ${longitude}\n\nLocation API connection will be added next.`
                );

                currentLocationButton.textContent =
                    "Use my current location";
            },

            (error) => {

                console.error(error);

                alert(
                    "Unable to access your location."
                );

                currentLocationButton.textContent =
                    "Use my current location";
            }
        );
    }
);


// ==========================================
// PAGE LOAD
// ==========================================

console.log(
    "AIROCAST frontend loaded successfully."
);
