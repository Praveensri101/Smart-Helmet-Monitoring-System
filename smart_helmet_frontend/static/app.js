const POLL_MS = 5000;
const SENSOR_CONFIG = {
  gas: { label: "Gas", threshold: 50, compare: value => value >= 50, max: 100, unit: "" },
  temperature: { label: "Temperature", threshold: 45, compare: value => value > 45, max: 70, unit: " °C" },
  humidity: { label: "Humidity", threshold: 85, compare: value => value > 85, max: 100, unit: " %" },
  force: { label: "Force", threshold: 50, compare: value => value >= 50, max: 100, unit: "" }
};

let trendChart = null;
let riskChart = null;
let map = null;
let marker = null;
let lastHistory = [];

const $ = id => document.getElementById(id);
const isNumber = value => typeof value === "number" && Number.isFinite(value);
const fmt = (value, digits = 1) => isNumber(value) ? value.toFixed(digits) : "Unavailable";

function setConnection(status, message) {
  const dot = document.querySelector(".connection-dot");
  dot.classList.remove("connected", "disconnected");
  if (status === "connected") dot.classList.add("connected");
  if (status === "disconnected") dot.classList.add("disconnected");
  $("connection-label").textContent = status === "connected" ? "API connected" : status === "disconnected" ? "Connection issue" : "Connecting…";
  $("last-updated").textContent = message;
}

function showError(message) {
  const box = $("global-error");
  if (!message) {
    box.classList.add("d-none");
    box.textContent = "";
    return;
  }
  box.classList.remove("d-none");
  box.textContent = message;
}

function renderSensor(key, value) {
  const config = SENSOR_CONFIG[key];
  const valueNode = $(`${key}-value`);
  const statusNode = $(`${key}-status`);
  const meter = $(`${key}-meter`);
  const unit = key === "temperature" ? "°C" : key === "humidity" ? "%" : "units";
  valueNode.innerHTML = isNumber(value)
    ? `${fmt(value)} <small>${unit}</small>`
    : `— <small>unavailable</small>`;

  statusNode.className = "sensor-status";
  if (!isNumber(value)) {
    statusNode.textContent = "NO DATA";
    meter.style.width = "0%";
    return;
  }

  const breached = config.compare(value);
  statusNode.textContent = breached ? "THRESHOLD EXCEEDED" : "WITHIN THRESHOLD";
  statusNode.classList.add(breached ? "danger" : "good");
  meter.style.width = `${Math.max(0, Math.min(100, value / config.max * 100))}%`;
}

function getAlerts(current) {
  const alerts = [];
  if (!isNumber(current.gas)) alerts.push({ text: "Gas sensor reading unavailable.", danger: false });
  else if (current.gas >= 50) alerts.push({ text: "Gas threshold exceeded — check the work area.", danger: true });

  if (!isNumber(current.temperature)) alerts.push({ text: "Temperature reading unavailable.", danger: false });
  else if (current.temperature > 45) alerts.push({ text: "High temperature threshold exceeded.", danger: true });

  if (!isNumber(current.humidity)) alerts.push({ text: "Humidity reading unavailable.", danger: false });
  else if (current.humidity > 85) alerts.push({ text: "High humidity threshold exceeded.", danger: true });

  if (!isNumber(current.force)) alerts.push({ text: "Impact/force reading unavailable.", danger: false });
  else if (current.force >= 50) alerts.push({ text: "Impact/force threshold exceeded — verify worker status.", danger: true });

  if (isNumber(current.gas) && current.gas >= 50 && isNumber(current.force) && current.force >= 50) {
    alerts.push({ text: "Multiple high-risk readings detected.", danger: true });
  }
  return alerts;
}

function renderAlerts(current) {
  const alerts = getAlerts(current);
  $("alert-count").textContent = alerts.length ? `${alerts.length} condition(s) need attention` : "No configured thresholds exceeded";
  $("alert-badge").textContent = alerts.filter(item => item.danger).length;
  const list = $("alerts-list");
  list.replaceChildren();

  if (!alerts.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const icon = document.createElement("i");
    icon.className = "bi bi-check2-circle";
    const text = document.createElement("span");
    text.textContent = "No configured thresholds are currently exceeded.";
    empty.append(icon, text);
    list.append(empty);
    return;
  }

  alerts.forEach(item => {
    const row = document.createElement("div");
    row.className = `alert-item${item.danger ? " danger" : ""}`;
    const icon = document.createElement("i");
    icon.className = item.danger ? "bi bi-exclamation-triangle-fill" : "bi bi-info-circle";
    const text = document.createElement("span");
    text.textContent = item.text;
    row.append(icon, text);
    list.append(row);
  });
}

function renderRisk(level) {
  const display = $("risk-display");
  display.className = `risk-display risk-${String(level || "UNKNOWN").toLowerCase()}`;
  $("risk-level").textContent = level || "UNKNOWN";
}

function initCharts() {
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { labels: { color: "#aebbd0", usePointStyle: true, boxWidth: 7, font: { size: 10 } } }
    },
    scales: {
      x: { ticks: { color: "#8293ab", maxTicksLimit: 6 }, grid: { color: "rgba(148,163,184,.08)" } },
      y: { ticks: { color: "#8293ab" }, grid: { color: "rgba(148,163,184,.08)" } }
    }
  };

  trendChart = new Chart($("trend-chart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "Gas", data: [], borderColor: "#45b6ff", backgroundColor: "#45b6ff22", tension: .3, pointRadius: 0 },
        { label: "Temperature", data: [], borderColor: "#ff916b", backgroundColor: "#ff916b22", tension: .3, pointRadius: 0 },
        { label: "Humidity", data: [], borderColor: "#49d6c2", backgroundColor: "#49d6c222", tension: .3, pointRadius: 0 },
        { label: "Force", data: [], borderColor: "#b49aff", backgroundColor: "#b49aff22", tension: .3, pointRadius: 0 }
      ]
    },
    options: { ...commonOptions, interaction: { intersect: false, mode: "index" } }
  });

  riskChart = new Chart($("risk-chart"), {
    type: "doughnut",
    data: {
      labels: ["NORMAL", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"],
      datasets: [{
        data: [0, 0, 0, 0, 0],
        backgroundColor: ["#2dd4a7", "#ffbd4a", "#ff7d70", "#bd344d", "#63738a"],
        borderColor: "#111c2d",
        borderWidth: 4,
        hoverOffset: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: { legend: { position: "bottom", labels: { color: "#aebbd0", padding: 18, usePointStyle: true, boxWidth: 7, font: { size: 10 } } } }
    }
  });
}

function updateCharts(rows) {
  const chronological = [...rows].reverse().slice(-80);
  trendChart.data.labels = chronological.map(row => {
    const date = new Date(row.timestamp);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  });
  ["gas", "temperature", "humidity", "force"].forEach((key, index) => {
    trendChart.data.datasets[index].data = chronological.map(row => isNumber(row[key]) ? row[key] : null);
  });
  trendChart.update();

  const levels = ["NORMAL", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"];
  const counts = levels.map(level => rows.filter(row => (row.predicted_risk || "UNKNOWN").toUpperCase() === level).length);
  riskChart.data.datasets[0].data = counts;
  riskChart.update();
}

function initMap() {
  map = L.map("map", { zoomControl: true }).setView([20, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
}

function updateMap(current) {
  const coords = current.gps_coordinates;
  if (!coords || !isNumber(coords.latitude) || !isNumber(coords.longitude)) {
    $("gps-value").textContent = "Location unavailable";
    $("gps-note").textContent = "Check the Blynk V5 response format. No map marker is shown without valid coordinates.";
    return;
  }
  const point = [coords.latitude, coords.longitude];
  $("gps-value").textContent = `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
  $("gps-note").textContent = "Location based on the most recent coordinates returned by Blynk.";
  if (!marker) {
    marker = L.marker(point).addTo(map).bindPopup("Worker's reported location");
  } else {
    marker.setLatLng(point);
  }
  map.setView(point, 14);
}

function riskBadge(level) {
  const normalized = String(level || "UNKNOWN").toLowerCase();
  const span = document.createElement("span");
  span.className = `risk-badge badge-${normalized}`;
  span.textContent = String(level || "UNKNOWN").toUpperCase();
  return span;
}

function renderHistory(rows) {
  lastHistory = rows;
  const body = $("history-body");
  body.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.className = "text-center table-empty";
    td.textContent = "No history recorded yet.";
    tr.append(td);
    body.append(tr);
    $("table-count").textContent = "0 records displayed";
    return;
  }

  rows.forEach(row => {
    const tr = document.createElement("tr");
    const values = [
      row.timestamp ? new Date(row.timestamp).toLocaleString() : "—",
      fmt(row.gas), fmt(row.temperature), fmt(row.humidity), fmt(row.force)
    ];
    values.forEach(value => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    });
    const riskCell = document.createElement("td");
    riskCell.append(riskBadge(row.predicted_risk));
    tr.append(riskCell);
    body.append(tr);
  });
  $("table-count").textContent = `${rows.length} record(s) displayed`;
  $("history-subtitle").textContent = `Showing ${rows.length} most recent saved readings`;
}

async function loadHistory() {
  const limit = $("history-limit").value;
  const response = await fetch(`/api/history?limit=${encodeURIComponent(limit)}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || "Unable to load history.");
  renderHistory(payload.rows || []);
  updateCharts(payload.rows || []);
}

async function refreshDashboard() {
  $("refresh-btn").disabled = true;
  try {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Sensor API request failed.");
    }

    const current = payload.current;
    Object.keys(SENSOR_CONFIG).forEach(key => renderSensor(key, current[key]));
    renderRisk(current.predicted_risk);
    renderAlerts(current);
    updateMap(current);
    setConnection("connected", `Updated ${new Date().toLocaleTimeString()}`);
    showError("");

    await loadHistory();
  } catch (error) {
    setConnection("disconnected", "Unable to update sensor data");
    showError(error.message || "Could not connect to the Python API.");
  } finally {
    $("refresh-btn").disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initCharts();
  initMap();
  $("refresh-btn").addEventListener("click", refreshDashboard);
  $("history-limit").addEventListener("change", () => loadHistory().catch(error => showError(error.message)));
  refreshDashboard();
  window.setInterval(refreshDashboard, POLL_MS);
});
