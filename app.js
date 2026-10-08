// ==========================================
// AIROCAST
// ==========================================

// 🔴 PUT YOUR RENDER URL HERE
const BACKEND_URL = "YOUR-RENDER-URL-HERE";


// ==========================================
// ELEMENTS
// ==========================================

const analyzeButton = document.getElementById("analyzeBtn");
const locationInput = document.getElementById("locationInput");
const currentLocationButton =
    document.getElementById("currentLocationBtn");

const dashboard = document.getElementById("dashboard");


// ==========================================
// ANALYZE BUTTON
// ==========================================

analyzeButton.addEventListener("click", async function () {

    const location = locationInput.value.trim();

    if (!location) {
        alert("Please enter a city or location.");
        return;
    }

    analyzeButton.disabled = true;
    analyzeButton.textContent = "Analyzing...";


    try {

        const url =
            `${BACKEND_URL}/api/analyze?location=${encodeURIComponent(location)}`;

        console.log("Requesting:", url);


        const response = await fetch(url);


        if (!response.ok) {

            const errorText = await response.text();

            console.error("Backend error:", errorText);

            throw new Error(
                `Backend returned ${response.status}`
            );
        }


        const data = await response.json();

        console.log("AIROCAST DATA:", data);


        showDashboard(data);


    } catch (error) {

        console.error("AIROCAST ERROR:", error);

        alert(
            "AIROCAST could not connect to the backend.\n\n" +
            "Please check your Render URL in app.js."
        );

    } finally {

        analyzeButton.disabled = false;
        analyzeButton.textContent = "Analyze";

    }

});


// ==========================================
// DISPLAY RESULTS
// ==========================================

function showDashboard(data) {

    dashboard.style.display = "block";


    // PM2.5

    const pm25 = document.getElementById("pm25");

    if (
        data.pollution &&
        data.pollution.pm25 !== null &&
        data.pollution.pm25 !== undefined
    ) {

        pm25.textContent = data.pollution.pm25;

    } else {

        pm25.textContent = "--";

    }


    // Temperature

    const temperature =
        document.getElementById("temperature");

    if (
        data.weather &&
        data.weather.temperature !== null &&
        data.weather.temperature !== undefined
    ) {

        temperature.textContent =
            `${data.weather.temperature}°C`;

    } else {

        temperature.textContent = "--";

    }


    // Humidity

    const humidity =
        document.getElementById("humidity");

    if (
        data.weather &&
        data.weather.humidity !== null &&
        data.weather.humidity !== undefined
    ) {

        humidity.textContent =
            `${data.weather.humidity}%`;

    } else {

        humidity.textContent = "--";

    }


    // Wind

    const wind =
        document.getElementById("wind");

    if (
        data.weather &&
        data.weather.wind_speed !== null &&
        data.weather.wind_speed !== undefined
    ) {

        wind.textContent =
            `${data.weather.wind_speed} km/h`;

    } else {

        wind.textContent = "--";

    }


    // Prediction

    const prediction =
        document.getElementById("prediction");

    if (
        data.prediction &&
        data.prediction.forecast_30_60_min !== null &&
        data.prediction.forecast_30_60_min !== undefined
    ) {

        prediction.textContent =
            data.prediction.forecast_30_60_min;

    } else {

        prediction.textContent = "Coming soon";

    }


    // Scroll to dashboard

    dashboard.scrollIntoView({
        behavior: "smooth"
    });

}


// ==========================================
// CURRENT LOCATION BUTTON
// ==========================================

currentLocationButton.addEventListener(
    "click",
    function () {

        if (!navigator.geolocation) {

            alert(
                "Location services are not supported by your browser."
            );

            return;
        }


        currentLocationButton.disabled = true;
        currentLocationButton.textContent =
            "Getting location...";


        navigator.geolocation.getCurrentPosition(

            async function (position) {

                const latitude =
                    position.coords.latitude;

                const longitude =
                    position.coords.longitude;


                console.log(
                    "Coordinates:",
                    latitude,
                    longitude
                );


                try {

                    // Convert coordinates into a city name

                    const response = await fetch(
                        `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&count=1&language=en&format=json`
                    );


                    if (!response.ok) {

                        throw new Error(
                            "Reverse geocoding failed"
                        );

                    }


                    const data =
                        await response.json();


                    if (
                        data.results &&
                        data.results.length > 0
                    ) {

                        const place =
                            data.results[0];


                        locationInput.value =
                            place.name;


                        // Analyze automatically

                        analyzeButton.click();

                    } else {

                        alert(
                            "Could not determine your city."
                        );

                    }

                } catch (error) {

                    console.error(error);

                    alert(
                        "Could not determine your current location."
                    );

                } finally {

                    currentLocationButton.disabled =
                        false;

                    currentLocationButton.textContent =
                        "Use my current location";

                }

            },


            function (error) {

                console.error(
                    "Location error:",
                    error
                );


                alert(
                    "Location access was denied or unavailable."
                );


                currentLocationButton.disabled =
                    false;

                currentLocationButton.textContent =
                    "Use my current location";

            }

        );

    }
);


// ==========================================
// ENTER KEY
// ==========================================

locationInput.addEventListener(
    "keydown",
    function (event) {

        if (event.key === "Enter") {

            analyzeButton.click();

        }

    }
);


// ==========================================
// STARTUP
// ==========================================

console.log(
    "🌍 AIROCAST frontend loaded."
);

console.log(
    "Backend:",
    BACKEND_URL
);
