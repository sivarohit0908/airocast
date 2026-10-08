console.log("AIROCAST frontend loaded successfully.");

const analyzeButton =
    document.getElementById("analyzeBtn");

const locationInput =
    document.getElementById("location");

const currentLocationButton =
    document.getElementById("useLocationBtn");


analyzeButton.addEventListener("click", function () {

    const location =
        locationInput.value.trim();


    if (location === "") {

        alert("Please enter a location.");

        return;
    }


    alert(
        "AIROCAST received your location: "
        + location
        + "\n\nBackend connection will be added in Step 2."
    );

});


currentLocationButton.addEventListener(
    "click",
    function () {

        if (!navigator.geolocation) {

            alert(
                "Geolocation is not supported by your browser."
            );

            return;
        }


        navigator.geolocation.getCurrentPosition(

            function (position) {

                const latitude =
                    position.coords.latitude;

                const longitude =
                    position.coords.longitude;


                alert(
                    "Location detected!\n\n" +
                    "Latitude: " +
                    latitude +
                    "\nLongitude: " +
                    longitude +
                    "\n\nBackend connection will be added in Step 2."
                );

            },


            function () {

                alert(
                    "Location permission was denied."
                );

            }

        );

    }
);
