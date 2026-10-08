const BACKEND_URL = "https://airocast.onrender.com";

const analyzeButton = document.getElementById("analyzeBtn");
const locationInput = document.getElementById("locationInput");
const currentLocationButton = document.getElementById("currentLocationBtn");
const dashboard = document.getElementById("dashboard");


// ANALYZE
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

        console.log("AIROCAST:", data);

        dashboard.style.display = "block";

        // PM2.5
        document.getElementById("pm25").textContent =
            data.pollution?.pm25 ?? "--";

        // Temperature
        document.getElementById("temperature").textContent =
            data.weather?.temperature != null
                ? `${data.weather.temperature}°C`
                : "--";

        // Humidity
        document.getElementById("humidity").textContent =
            data.weather?.humidity != null
                ? `${data.weather.humidity}%`
                : "--";

        // Wind
        document.getElementById("wind").textContent =
            data.weather?.wind_speed != null
                ? `${data.weather.wind_speed} km/h`
                : "--";

        // Prediction
        document.getElementById("prediction").textContent =
            data.prediction?.forecast_30_60_min ?? "Coming soon";

        dashboard.scrollIntoView({
            behavior: "smooth"
        });

    } catch (error) {

        console.error(error);

        alert(
            "Could not connect to AIROCAST.\n\n" +
            "Please try again in a few seconds."
        );

    } finally {

        analyzeButton.disabled = false;
        analyzeButton.textContent = "Analyze";

    }

});


// CURRENT LOCATION
currentLocationButton.addEventListener("click", () => {

    if (!navigator.geolocation) {
        alert("Your browser does not support location services.");
        return;
    }

    currentLocationButton.disabled = true;
    currentLocationButton.textContent = "Getting location...";

    navigator.geolocation.getCurrentPosition(

        async (position) => {

            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;

            try {

                const response = await fetch(
                    `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&count=1&language=en&format=json`
                );

                const data = await response.json();

                if (data.results && data.results.length > 0) {

                    locationInput.value =
                        data.results[0].name;

                    analyzeButton.click();

                } else {

                    alert("Could not determine your location.");

                }

            } catch (error) {

                console.error(error);

                alert("Could not determine your location.");

            }

            currentLocationButton.disabled = false;
            currentLocationButton.textContent =
                "Use my current location";

        },

        () => {

            alert(
                "Location access was denied. " +
                "Please allow location access in your browser."
            );

            currentLocationButton.disabled = false;
            currentLocationButton.textContent =
                "Use my current location";

        }

    );

});


// ENTER KEY
locationInput.addEventListener("keydown", (event) => {

    if (event.key === "Enter") {
        analyzeButton.click();
    }

});


console.log("AIROCAST loaded.");
console.log("Backend:", BACKEND_URL);
