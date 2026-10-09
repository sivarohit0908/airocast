
"use strict";

const BACKEND_URL = "https://airocast.onrender.com";

const form = document.getElementById("searchForm");
const locationInput = document.getElementById("locationInput");
const analyzeBtn = document.getElementById("analyzeBtn");
const currentLocationBtn = document.getElementById("currentLocationBtn");
const statusMessage = document.getElementById("statusMessage");
const dashboard = document.getElementById("dashboard");

let forecastChart = null;
let requestController = null;

const $ = (id) => document.getElementById(id);

function setStatus(message, type = "") {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`.trim();
}

function setLoading(loading, message = "") {
  analyzeBtn.disabled = loading;
  currentLocationBtn.disabled = loading;
  locationInput.disabled = loading;
  analyzeBtn.querySelector("span:first-child").textContent =
    loading ? "Analyzing…" : "Analyze air";

  if (message) setStatus(message);
}

function number(value, digits = 1) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "—";
}

function displayText(value, fallback = "—") {
  return value === null || value === undefined || value === ""
    ? fallback
    : String(value);
}

function formatTimestamp(value, options = {}) {
  if (!value) return "Time unavailable";

  // API timestamps are local times without an offset. Parse them as a
  // display value rather than accidentally shifting them to another zone.
  const match = String(value).match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/
  );

  if (!match) return value;

  const [, year, month, day, hour, minute] = match;
  const date = new Date(
    Number(year), Number(month) - 1, Number(day),
    Number(hour), Number(minute)
  );

  if (options.full) {
    return date.toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  });
}

function setAqiStatus(status) {
  const badge = $("aqiBadge");
  const label = $("aqiLabel");
  const level = status?.level || "unknown";

  badge.dataset.level = level;
  label.textContent = status?.label || "AQI unavailable";
}

function weatherIconFor(code, iconCode) {
  if (iconCode) {
    const prefix = iconCode.slice(0, 2);
    const icons = {
      "01": "☀",
      "02": "🌤",
      "03": "☁",
      "04": "☁",
      "09": "🌧",
      "10": "🌦",
      "11": "⛈",
      "13": "❄",
      "50": "🌫"
    };
    if (icons[prefix]) return icons[prefix];
  }

  if (code === 800 || code === 0) return "☀";
  if (code >= 200 && code < 300) return "⛈";
  if (code >= 300 && code < 600) return "🌧";
  if (code >= 600 && code < 700) return "❄";
  if (code >= 700 && code < 800) return "🌫";
  if (code >= 801) return "☁";
  return "◌";
}

function renderChart(hourly) {
  const validRows = Array.isArray(hourly)
    ? hourly.filter((row) =>
        row &&
        row.time &&
        row.pm2_5 !== null &&
        row.pm2_5 !== undefined &&
        Number.isFinite(Number(row.pm2_5))
      )
    : [];

  const canvas = $("forecastChart");
  if (!canvas || typeof Chart === "undefined") {
    setStatus(
      "Data loaded, but the chart library could not load. Check your connection.",
      "error"
    );
    return;
  }

  if (forecastChart) {
    forecastChart.destroy();
    forecastChart = null;
  }

  const labels = validRows.map((row) => formatTimestamp(row.time));
  const values = validRows.map((row) => Number(row.pm2_5));

  if (values.length === 0) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 0, 260);
  gradient.addColorStop(0, "rgba(118, 232, 166, 0.27)");
  gradient.addColorStop(1, "rgba(118, 232, 166, 0.005)");

  forecastChart = new Chart(context, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "PM2.5",
        data: values,
        borderColor: "#8eeeb3",
        backgroundColor: gradient,
        fill: true,
        borderWidth: 2.5,
        tension: 0.36,
        pointRadius: values.length > 12 ? 0 : 3,
        pointHoverRadius: 5,
        pointBackgroundColor: "#a7f3c4",
        pointBorderColor: "#10251b",
        pointBorderWidth: 2
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
          titleColor: "#a7f3c4",
          bodyColor: "#edf5ee",
          borderColor: "rgba(167, 243, 196, 0.2)",
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            title(items) {
              const index = items[0]?.dataIndex;
              return index === undefined
                ? ""
                : formatTimestamp(validRows[index]?.time, { full: true });
            },
            label(item) {
              return ` PM2.5: ${number(item.raw)} μg/m³`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: "#849b8c",
            maxTicksLimit: 7,
            maxRotation: 0,
            autoSkip: true,
            font: { family: "DM Sans", size: 10 }
          }
        },
        y: {
          beginAtZero: true,
          border: { display: false, dash: [4, 4] },
          grid: { color: "rgba(171, 218, 187, 0.09)" },
          ticks: {
            color: "#849b8c",
            padding: 8,
            font: { family: "DM Sans", size: 10 }
          }
        }
      }
    }
  });
}

function renderDashboard(data) {
  const location = data.location || {};
  const pollution = data.pollution || {};
  const weather = data.weather || {};
  const forecast = data.forecast || {};

  $("locationName").textContent = [
    location.name,
    location.admin1,
    location.country
  ].filter(Boolean).join(", ");

  $("updatedAt").textContent = data.updated_at
    ? `Weather updated ${formatTimestamp(data.updated_at, { full: true })}`
    : "Latest available conditions";

  $("pm25").textContent = number(pollution.pm2_5);
  $("pm10").textContent = number(pollution.pm10, 1);
  $("aqi").textContent = number(pollution.us_aqi, 0);
  $("aqiFoot").textContent = pollution.aqi_status?.label || "Model estimate";
  setAqiStatus(pollution.aqi_status);

  $("temperature").textContent = number(weather.temperature);
  $("feelsLike").textContent =
    `Feels like ${number(weather.feels_like)}°C`;
  $("feelsLikeSide").textContent =
    `${number(weather.feels_like)}°C`;
  $("humidity").textContent = `${number(weather.humidity, 0)}%`;
  $("wind").textContent = `${number(weather.wind_speed, 1)} m/s`;

  const description = displayText(weather.description, "Weather unavailable");
  $("weatherDescription").textContent = description;
  $("weatherDescriptionLarge").textContent = description;
  $("weatherTempLarge").textContent = `${number(weather.temperature, 0)}°`;
  $("weatherIcon").textContent = weatherIconFor(
    weather.weather_code,
    weather.icon
  );

  $("guidance").textContent = displayText(
    data.guidance,
    "Guidance is currently unavailable."
  );

  $("dataNote").textContent = displayText(
    data.data_note,
    "Weather and air-quality estimates may use different update times."
  );

  renderChart(forecast.hourly || []);

  dashboard.hidden = false;
  dashboard.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function analyzeLocation(location) {
  const city = String(location || "").trim();

  if (city.length < 2) {
    setStatus("Please enter a city name with at least two characters.", "error");
    locationInput.focus();
    return;
  }

  if (requestController) requestController.abort();
  requestController = new AbortController();

  const controller = requestController;
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  setLoading(true, `Gathering weather and air-quality data for ${city}…`);

  try {
    const url = new URL("/api/analyze", BACKEND_URL);
    url.searchParams.set("location", city);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("The backend returned an invalid response.");
    }

    if (!response.ok) {
      throw new Error(
        data?.detail || `Analysis failed (HTTP ${response.status}).`
      );
    }

    if (!data.location || !data.pollution || !data.weather || !data.forecast) {
      throw new Error("The backend response is missing required dashboard data.");
    }

    locationInput.value = data.location.name || city;
    renderDashboard(data);
    setStatus(`Analysis complete for ${data.location.name || city}.`, "success");
  } catch (error) {
    if (error.name === "AbortError") {
      setStatus(
        "The request timed out or was cancelled. Please try again.",
        "error"
      );
    } else {
      setStatus(error.message || "Unable to load the analysis.", "error");
    }
  } finally {
    clearTimeout(timeoutId);
    if (requestController === controller) {
      requestController = null;
      setLoading(false);
    }
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  analyzeLocation(locationInput.value);
});

currentLocationBtn.addEventListener("click", () => {
  if (!("geolocation" in navigator)) {
    setStatus("Your browser does not support location access. Enter a city instead.", "error");
    return;
  }

  setLoading(true, "Getting your current location…");

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const { latitude, longitude } = position.coords;
        const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
        url.searchParams.set("latitude", latitude);
        url.searchParams.set("longitude", longitude);
        url.searchParams.set("localityLanguage", "en");

        const response = await fetch(url.toString());
        if (!response.ok) throw new Error("Could not identify your current city.");

        const result = await response.json();
        const city =
          result.city ||
          result.locality ||
          result.principalSubdivision ||
          "";

        if (!city) {
          throw new Error("Your city could not be identified. Please enter it manually.");
        }

        locationInput.value = city;
        setLoading(false);
        await analyzeLocation(city);
      } catch (error) {
        setLoading(false);
        setStatus(error.message || "Could not resolve your current location.", "error");
      }
    },
    (error) => {
      setLoading(false);
      const messages = {
        1: "Location permission was denied. You can enter your city manually.",
        2: "Your current location is unavailable. Please enter a city.",
        3: "Location lookup timed out. Please try again."
      };
      setStatus(messages[error.code] || "Could not get your location.", "error");
    },
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
  );
});

// Automatically load the default city on first visit.
window.addEventListener("DOMContentLoaded", () => {
  analyzeLocation(locationInput.value || "Hyderabad");
});
