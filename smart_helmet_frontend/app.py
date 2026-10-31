import csv
import os
import re
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, send_file

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
CSV_FILE = BASE_DIR / "helmet_data.csv"
BLYNK_TOKEN = os.getenv("BLYNK_TOKEN", "").strip()
BLYNK_BASE_URL = "https://blynk.cloud/external/api/get"
REFRESH_SECONDS = 5

PINS = {
    "gas": "V0",
    "temperature": "V1",
    "humidity": "V2",
    "gps": "V5",
    "force": "V6",
}
CSV_COLUMNS = [
    "timestamp", "gas", "temperature", "humidity",
    "force", "gps", "predicted_risk"
]

app = Flask(__name__, static_folder="static", template_folder="templates")


def number_or_none(value):
    try:
        number = float(value)
        if number != number or number in (float("inf"), float("-inf")):
            return None
        return number
    except (TypeError, ValueError):
        return None



def fetch_blynk_data():
    if not BLYNK_TOKEN:
        raise RuntimeError(
            "BLYNK_TOKEN is not configured. Set your Blynk token."
        )

    result = {}

    for key, pin in PINS.items():
        try:
            url = f"{BLYNK_BASE_URL}?token={BLYNK_TOKEN}&{pin}"

            response = requests.get(url, timeout=10)
            response.raise_for_status()

            value = response.text.strip()

            result[key] = value if value and value.lower() not in {
                "nan", "none", "null", "error"
            } else None

        except requests.RequestException as error:
            app.logger.error("Blynk read failed for %s: %s", pin, error)
            result[key] = None

    return result



def predict_risk(gas, temperature, humidity, force):
    values = [gas, temperature, humidity, force]
    if any(value is None for value in values):
        return "UNKNOWN"

    score = 0
    if force >= 50:
        score += 3
    if gas >= 50:
        score += 3
    if temperature > 45:
        score += 2
    if humidity > 85:
        score += 1

    if score >= 6:
        return "CRITICAL"
    if score >= 4:
        return "HIGH"
    if score >= 2:
        return "MEDIUM"
    return "NORMAL"


def parse_gps(value):
    if not value:
        return None
    text = str(value).strip()
    if "dir/" in text:
        text = text.split("dir/", 1)[1]
    match = re.search(
        r"(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)", text
    )
    if not match:
        return None
    lat, lon = float(match.group(1)), float(match.group(2))
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    if lat == 0 and lon == 0:
        return None
    return {"latitude": lat, "longitude": lon}


def read_history(limit=500):
    if not CSV_FILE.exists():
        return []
    rows = []
    try:
        with CSV_FILE.open("r", newline="", encoding="utf-8") as file:
            reader = csv.DictReader(file)
            for row in reader:
                for field in ("gas", "temperature", "humidity", "force"):
                    row[field] = number_or_none(row.get(field))
                rows.append(row)
    except (OSError, csv.Error):
        return []
    return rows[-limit:]


def save_row(row):
    write_header = not CSV_FILE.exists() or CSV_FILE.stat().st_size == 0
    with CSV_FILE.open("a", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=CSV_COLUMNS)
        if write_header:
            writer.writeheader()
        writer.writerow({key: row.get(key) for key in CSV_COLUMNS})


def build_current_record():
    raw = fetch_blynk_data()
    record = {
        "timestamp": datetime.now().astimezone().isoformat(timespec="seconds"),
        "gas": number_or_none(raw.get("gas")),
        "temperature": number_or_none(raw.get("temperature")),
        "humidity": number_or_none(raw.get("humidity")),
        "force": number_or_none(raw.get("force")),
        "gps": raw.get("gps"),
    }
    record["predicted_risk"] = predict_risk(
        record["gas"], record["temperature"],
        record["humidity"], record["force"]
    )
    record["gps_coordinates"] = parse_gps(record["gps"])
    save_row(record)
    return record


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/dashboard")
def dashboard():
    try:
        current = build_current_record()
        return jsonify({
            "ok": True,
            "current": current,
            "refresh_seconds": REFRESH_SECONDS,
        })
    except RuntimeError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 503
    except Exception:
        app.logger.exception("Dashboard data request failed")
        return jsonify({
            "ok": False,
            "error": "Unable to retrieve sensor data. Check server logs and Blynk connectivity."
        }), 502


@app.get("/api/history")
def history():
    limit = request_limit()
    return jsonify({"ok": True, "rows": list(reversed(read_history(limit)))})


def request_limit():
    try:
        return max(1, min(int(request.args.get("limit", 200)), 2000))
    except ValueError:
        return 200


@app.get("/api/export.csv")
def export_csv():
    if not CSV_FILE.exists():
        with CSV_FILE.open("w", newline="", encoding="utf-8") as file:
            csv.DictWriter(file, fieldnames=CSV_COLUMNS).writeheader()
    return send_file(
        CSV_FILE,
        mimetype="text/csv",
        as_attachment=True,
        download_name="smart_helmet_history.csv",
    )


@app.after_request
def security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Cache-Control"] = "no-store"
    return response


if __name__ == "__main__":
    # Local development only. Use a production WSGI server for deployment.
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")), debug=False)
