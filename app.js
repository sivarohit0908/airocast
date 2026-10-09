
(() => {
  "use strict";

  const API_BASE = "https://airocast.onrender.com";

  const $ = (id) => document.getElementById(id);
  let forecastChart = null;

  function setStatus(message, isError = false) {
    const el = $("statusMessage");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("error", isError);
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value ?? "—";
  }

  function number(value, digits = 1) {
    const n = Number(value);
    return Number.isFinite(n)
      ? n.toFixed(digits).replace(/\.0$/, "")
      : "—";
  }

  function aqiDescription(value, supplied) {
    if (supplied?.label) return supplied.label;

    const n = Number(value);
    if (!Number.isFinite(n)) return "Air quality unavailable";
    if (n <= 50) return "Good";
    if (n <= 100) return "Moderate";
    if (n <= 150) return "Unhealthy for sensitive groups";
    if (n <= 200) return "Unhealthy";
    if (n <= 300) return "Very unhealthy";
    return "Hazardous";
  }

  function aqiLevel(value, supplied) {
    if (supplied?.level) return supplied.level;

    const n = Number(value);
    if (!Number.isFinite(n)) return "unknown";
    if (n <= 50) return "good";
    if (n <= 100) return "moderate";
    if (n <= 150) return "sensitive";
    if (n <= 200) return "unhealthy";
    if (n <= 300) return "very-unhealthy";
    return "hazardous";
  }

  function weatherSymbol(code, description) {
    const d = String(description || "").toLowerCase();

    if (d.includes("thunder")) return "ϟ";
    if (d.includes("snow")) return "❄";
    if (d.includes("rain") || d.includes("drizzle")) return "☂";
    if (d.includes("cloud")) return "☁";
    if (d.includes("mist") || d.includes("fog") || d.includes("haze")) return "≋";
    if (Number(code) === 800 || d.includes("clear")) return "☀";

    return "◌";
  }

  function renderChart(hourly) {
    const canvas = $("forecastChart");
    if (!canvas || typeof Chart === "undefined") return;

    const rows = Array.isArray(hourly) ? hourly.slice(0, 24) : [];

    if (!rows.length) {
      if (forecastChart) {
        forecastChart.destroy();
        forecastChart = null;
      }
      return;
    }

    const labels = rows.map((row) => {
      const raw = row.time || row.datetime || "";
      const date = new Date(raw);

      return Number.isNaN(date.getTime())
        ? String(raw).slice(-5)
        : date.toLocaleTimeString([], { hour: "numeric" });
    });

    const values = rows.map((row) => {
      const value = Number(row.pm2_5);
      return Number.isFinite(value) ? value : null;
    });

    if (forecastChart) forecastChart.destroy();

    forecastChart = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "PM2.5",
          data: values,
          borderColor: "#9bf2c0",
          backgroundColor: "rgba(155,242,192,0.10)",
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointBackgroundColor: "#9bf2c0",
          fill: true,
          tension: 0.36,
          spanGaps: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: "index"
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#10251b",
            titleColor: "#effaf2",
            bodyColor: "#b8d6c2",
            borderColor: "rgba(155,242,192,0.2)",
            borderWidth: 1,
            padding: 11
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: "#789382",
              maxTicksLimit: 6,
              maxRotation: 0,
              autoSkip: true,
              font: { size: 10 }
            },
            border: { display: false }
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(177,220,195,0.08)" },
            ticks: {
              color: "#789382",
              font: { size: 10 },
              maxTicksLimit: 5
            },
            border: { display: false }
          }
        }
      }
    });
  }

  function renderOutlook(value, current, trendId, changeId, minutes) {
    const target = Number(value);
    const base = Number(current);
    const valueId = minutes === 30 ? "pm25Thirty" : "pm25Sixty";
    const trendEl = $(trendId);
    const changeEl = $(changeId);

    if (!Number.isFinite(target)) {
      setText(valueId, "—");

      if (trendEl) {
        trendEl.textContent = "Forecast unavailable";
        trendEl.className = "trend neutral";
      }

      if (changeEl) {
        changeEl.textContent = "No short-term forecast data returned";
      }
      return;
    }

    setText(valueId, number(target));

    const delta = Number.isFinite(base) ? target - base : 0;
    const threshold = Math.max(0.5, Math.abs(base || 0) * 0.03);

    let label;
    let className;

    if (!Number.isFinite(base) || Math.abs(delta) < threshold) {
      label = "→ Staying about the same";
      className = "neutral";
    } else if (delta < 0) {
      label = "↓ Pollution may improve";
      className = "good";
    } else {
      label = "↑ Pollution may worsen";
      className = "bad";
    }

    if (trendEl) {
      trendEl.textContent = label;
      trendEl.className = `trend ${className}`;
    }

    if (changeEl) {
      if (!Number.isFinite(base)) {
        changeEl.textContent = "Compared with current level";
      } else {
        const sign = delta > 0 ? "+" : "";
        changeEl.textContent =
          `${sign}${number(delta)} μg/m³ vs now`;
      }
    }
  }

  function getOutlook(data) {
    const rows = Array.isArray(data?.forecast?.hourly)
      ? data.forecast.hourly
      : [];

    const current = Number(data?.pollution?.pm2_5);

    const validRows = rows
      .map((row) => ({
        ...row,
        pm2_5: Number(row.pm2_5)
      }))
      .filter((row) => Number.isFinite(row.pm2_5));

    const firstHour = validRows.length
      ? validRows[0].pm2_5
      : NaN;

    // Estimate 30 minutes by interpolating between the current
    // value and the first hourly forecast.
    const thirtyMinutes =
      Number.isFinite(current) && Number.isFinite(firstHour)
        ? current + (firstHour - current) * 0.5
        : NaN;

    // Use the first hourly forecast for the one-hour outlook.
    const sixtyMinutes = firstHour;

    return {
      current,
      thirtyMinutes,
      sixtyMinutes,
      rows
    };
  }

  function renderData(data) {
    if (!data?.location || !data?.pollution || !data?.weather) {
      throw new Error(
        "The API response is missing expected weather or air-quality data."
      );
    }

    const location = data.location;
    const pollution = data.pollution;
    const weather = data.weather;

    const aqi = pollution.us_aqi;
    const status = aqiDescription(aqi, pollution.aqi_status);

    setText(
      "locationName",
      [location.name, location.admin1, location.country]
        .filter(Boolean)
        .join(", ")
    );

    setText(
      "updatedAt",
      data.updated_at
        ? `Updated ${new Date(data.updated_at).toLocaleString([], {
            dateStyle: "medium",
            timeStyle: "short"
          })}`
        : "Latest available data"
    );

    setText("pm25", number(pollution.pm2_5));
    setText("pm10", number(pollution.pm10));
    setText("aqi", number(aqi, 0));
    setText("aqiLabel", status);
    setText("aqiFoot", status);

    const badge = $("aqiBadge");
    if (badge) badge.dataset.level = aqiLevel(aqi, pollution.aqi_status);

    setText("temperature", number(weather.temperature));
    setText("feelsLike", `Feels like ${number(weather.feels_like)}°C`);
    setText("feelsLikeSide", `${number(weather.feels_like)}°C`);
    setText("humidity", `${number(weather.humidity, 0)}%`);
    setText("wind", `${number(weather.wind_speed)} m/s`);

    setText(
      "weatherDescription",
      weather.description || "Conditions unavailable"
    );

    setText(
      "weatherDescriptionLarge",
      weather.description || "Conditions unavailable"
    );

    setText("weatherTempLarge", `${number(weather.temperature, 0)}°`);

    setText(
      "weatherIcon",
      weatherSymbol(weather.weather_code, weather.description)
    );

    setText(
      "guidance",
      data.guidance ||
        "Use the current air-quality estimate to guide outdoor activity."
    );

    setText(
      "dataNote",
      data.data_note ||
        "Weather from OpenWeather; air quality and forecast from Open-Meteo."
    );

    renderChart(data.forecast?.hourly);

    const outlook = getOutlook(data);

    renderOutlook(
      outlook.thirtyMinutes,
      outlook.current,
      "trendThirty",
      "changeThirty",
      30
    );

    renderOutlook(
      outlook.sixtyMinutes,
      outlook.current,
      "trendSixty",
      "changeSixty",
      60
    );

    $("dashboard").hidden = false;
    $("dashboard").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  async function analyze(location) {
    const button = $("analyzeBtn");

    if (!button) {
      setStatus("The Analyze button could not be found.", true);
      return;
    }

    button.disabled = true;
    button.textContent = "Analyzing…";

    setStatus(`Getting current conditions for ${location}…`);

    try {
      const url =
        `${API_BASE}/api/analyze?location=${encodeURIComponent(location)}`;

      const response = await fetch(url, {
        headers: { Accept: "application/json" }
      });

      let payload;

      try {
        payload = await response.json();
      } catch {
        throw new Error(
          "The server returned an unreadable response. Please try again."
        );
      }

      if (!response.ok) {
        throw new Error(
          payload.detail ||
          payload.error ||
          `Request failed (${response.status}).`
        );
      }

      renderData(payload);
      setStatus(`Showing weather and air-quality data for ${location}.`);
    } catch (error) {
      console.error("AIROCAST analysis error:", error);

      setStatus(
        `${error.message || "Could not load data."} Check that the Render backend is awake and try again.`,
        true
      );
    } finally {
      button.disabled = false;
      button.innerHTML = 'Analyze air <span aria-hidden="true">↗</span>';
    }
  }

  const form = $("searchForm");

  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const location = $("locationInput")?.value.trim();

      if (!location) {
        setStatus("Enter a city name first.", true);
        return;
      }

      analyze(location);
    });
  }

  const currentLocationButton = $("currentLocationBtn");

  if (currentLocationButton) {
    currentLocationButton.addEventListener("click", () => {
      if (!navigator.geolocation) {
        setStatus(
          "Location is not supported by this browser. Enter a city instead.",
          true
        );
        return;
      }

      setStatus("Finding your location…");

      navigator.geolocation.getCurrentPosition(
        (position) => {
          setStatus(
            `Coordinates found (${position.coords.latitude.toFixed(2)}, ${position.coords.longitude.toFixed(2)}), but this API needs a city name. Please enter your city above.`,
            true
          );
        },
        () => {
          setStatus(
            "Location permission was unavailable. Enter a city name instead.",
            true
          );
        },
        {
          enableHighAccuracy: false,
          timeout: 8000,
          maximumAge: 300000
        }
      );
    });
  }

  // Load Hyderabad by default when the page opens.
  function startApp() {
    const input = $("locationInput");
    if (input) analyze(input.value.trim() || "Hyderabad");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startApp, { once: true });
  } else {
    startApp();
  }
})();

