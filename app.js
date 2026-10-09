
"use strict";

const API = "https://airocast.onrender.com";
const $ = (id) => document.getElementById(id);
let chart = null;

function showStatus(message, type = "") {
  const el = $("statusMessage");
  if (el) {
    el.textContent = message;
    el.className = `status-message ${type}`.trim();
  }
}

function fmt(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "—";
  }
  return Number(value).toFixed(digits);
}

function trendText(current, future) {
  if (!Number.isFinite(current) || !Number.isFinite(future)) {
    return "Forecast unavailable";
  }

  const difference = future - current;
  const threshold = Math.max(1, Math.abs(current) * 0.05);

  if (difference > threshold) return "↑ Pollution may worsen";
  if (difference < -threshold) return "↓ Pollution may improve";
  return "→ Expected to remain stable";
}

function setOutlook(valueId, trendId, changeId, value, current) {
  const valueEl = $(valueId);
  const trendEl = $(trendId);
  const changeEl = $(changeId);

  if (valueEl) valueEl.textContent = fmt(value);
  if (trendEl) trendEl.textContent = trendText(current, value);

  if (changeEl) {
    if (Number.isFinite(current) && Number.isFinite(value)) {
      const delta = value - current;
      changeEl.textContent =
        `${delta > 0 ? "+" : ""}${fmt(delta)} μg/m³ from current PM2.5`;
    } else {
      changeEl.textContent = "";
    }
  }
}

function renderOutlook(data) {
  const current = Number(data?.pollution?.pm2_5);
  const rows = data?.forecast?.hourly;

  if (!Number.isFinite(current) || !Array.isArray(rows) || rows.length === 0) {
    setOutlook("pm25Thirty", "trendThirty", "changeThirty", NaN, current);
    setOutlook("pm25Sixty", "trendSixty", "changeSixty", NaN, current);
    return;
  }

  const valid = rows
    .filter((row) => row.time && Number.isFinite(Number(row.pm2_5)))
    .map((row) => ({
      time: new Date(row.time).getTime(),
      value: Number(row.pm2_5)
    }))
    .filter((row) => Number.isFinite(row.time))
    .sort((a, b) => a.time - b.time);

  if (!valid.length) return;

  // The hourly forecast is used to estimate values between forecast points.
  // This is interpolation, not a dedicated 30-minute forecast.
  const firstTime = valid[0].time;
  const target30 = firstTime + 30 * 60 * 1000;
  const target60 = firstTime + 60 * 60 * 1000;

  function estimate(target) {
    if (target <= valid[0].time) return valid[0].value;

    for (let i = 1; i < valid.length; i++) {
      const left = valid[i - 1];
      const right = valid[i];

      if (target <= right.time) {
        const span = right.time - left.time;
        if (!span) return right.value;
        const fraction = (target - left.time) / span;
        return left.value + fraction * (right.value - left.value);
      }
    }

    return valid[valid.length - 1].value;
  }

  setOutlook(
    "pm25Thirty", "trendThirty", "changeThirty",
    estimate(target30), current
  );

  setOutlook(
    "pm25Sixty", "trendSixty", "changeSixty",
    estimate(target60), current
  );
}

function renderChart(rows) {
  const canvas = $("forecastChart");
  if (!canvas || typeof Chart === "undefined") return;

  const valid = (rows || []).filter(
    (row) => row.time && Number.isFinite(Number(row.pm2_5))
  );

  if (chart) chart.destroy();

  chart = new Chart(canvas, {
    type: "line",
    data: {
      labels: valid.map((row) => row.time.slice(11, 16)),
      datasets: [{
        label: "PM2.5 forecast",
        data: valid.map((row) => Number(row.pm2_5)),
        borderColor: "#a7f3c4",
        backgroundColor: "rgba(167,243,196,0.12)",
        fill: true,
        tension: 0.35,
        pointRadius: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#91a79a", maxTicksLimit: 8 }
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(171,218,187,0.1)" },
          ticks: { color: "#91a79a" }
        }
      }
    }
  });
}

function renderDashboard(data) {
  const loc = data.location || {};
  const p = data.pollution || {};
  const w = data.weather || {};
  const hourly = data.forecast?.hourly || [];

  $("locationName").textContent =
    [loc.name, loc.admin1, loc.country].filter(Boolean).join(", ");
  $("updatedAt").textContent = data.updated_at
    ? `Updated ${data.updated_at.replace("T", " ").slice(0, 16)}`
    : "Latest available data";

  $("pm25").textContent = fmt(p.pm2_5);
  $("pm10").textContent = fmt(p.pm10);
  $("aqi").textContent = fmt(p.us_aqi, 0);
  $("aqiFoot").textContent = p.aqi_status?.label || "AQI estimate";
  $("aqiLabel").textContent = p.aqi_status?.label || "AQI unavailable";
  $("aqiBadge").dataset.level = p.aqi_status?.level || "unknown";

  $("temperature").textContent = fmt(w.temperature);
  $("feelsLike").textContent = `Feels like ${fmt(w.feels_like)}°C`;
  $("feelsLikeSide").textContent = `${fmt(w.feels_like)}°C`;
  $("weatherTempLarge").textContent = `${fmt(w.temperature, 0)}°`;
  $("weatherDescription").textContent = w.description || "Weather unavailable";
  $("weatherDescriptionLarge").textContent = w.description || "Weather unavailable";
  $("humidity").textContent = `${fmt(w.humidity, 0)}%`;
  $("wind").textContent = `${fmt(w.wind_speed)} m/s`;

  const icons = {
    "01": "☀", "02": "🌤", "03": "☁", "04": "☁",
    "09": "🌧", "10": "🌦", "11": "⛈", "13": "❄", "50": "🌫"
  };
  $("weatherIcon").textContent = icons[(w.icon || "").slice(0, 2)] || "☁";

  $("guidance").textContent = data.guidance || "Guidance unavailable.";
  $("dataNote").textContent = data.data_note || "Weather and air-quality sources may update at different times.";

  renderChart(hourly);
  renderOutlook(data);
  $("dashboard").hidden = false;
}

async function analyze(city) {
  city = String(city || "").trim();
  if (city.length < 2) {
    showStatus("Enter a city name first.", "error");
    return;
  }

  const button = $("analyzeBtn");
  button.disabled = true;
  button.querySelector("span:first-child").textContent = "Analyzing…";
  showStatus(`Loading real data for ${city}…`);

  try {
    const url = new URL("/api/analyze", API);
    url.searchParams.set("location", city);

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || `Request failed (${response.status}).`);
    }

    renderDashboard(data);
    $("locationInput").value = data.location?.name || city;
    showStatus(`Analysis complete for ${data.location?.name || city}.`, "success");
  } catch (error) {
    showStatus(error.message || "Could not load data. Please try again.", "error");
  } finally {
    button.disabled = false;
    button.querySelector("span:first-child").textContent = "Analyze air";
  }
}

$("searchForm").addEventListener("submit", (event) => {
  event.preventDefault();
  analyze($("locationInput").value);
});

$("currentLocationBtn").addEventListener("click", () => {
  if (!navigator.geolocation) {
    showStatus("Location access is unavailable. Enter a city instead.", "error");
    return;
  }

  showStatus("Finding your city…");

  navigator.geolocation.getCurrentPosition(async (position) => {
    try {
      const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
      url.searchParams.set("latitude", position.coords.latitude);
      url.searchParams.set("longitude", position.coords.longitude);
      url.searchParams.set("localityLanguage", "en");

      const response = await fetch(url);
      if (!response.ok) throw new Error("Could not identify your city.");

      const result = await response.json();
      const city = result.city || result.locality || result.principalSubdivision;

      if (!city) throw new Error("City not found. Please enter it manually.");

      $("locationInput").value = city;
      await analyze(city);
    } catch (error) {
      showStatus(error.message || "Location lookup failed.", "error");
    }
  }, () => {
    showStatus("Location permission denied or unavailable. Enter a city instead.", "error");
  }, { timeout: 12000, maximumAge: 300000 });
});

window.addEventListener("DOMContentLoaded", () => {
  analyze($("locationInput").value || "Hyderabad");
});
