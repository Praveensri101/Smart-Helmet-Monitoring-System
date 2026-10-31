# Smart Helmet Monitoring Dashboard

A dark industrial-style frontend built with HTML, CSS, JavaScript, Bootstrap 5, Chart.js and Leaflet. A small Flask Python API fetches sensor data from Blynk, evaluates rule-based risk levels and stores history in a local CSV file.

## Features

- Live gas, temperature, humidity and force cards
- Rule-based risk assessment and condition alerts
- GPS map (when Blynk V5 returns supported coordinates)
- Sensor trend and risk-distribution charts
- Sensor history table and CSV export
- Blynk token kept on the Python server, never sent to browser JavaScript
- Missing sensor readings display as unavailable / UNKNOWN rather than silently becoming zero

## Requirements

Python 3.10 or newer is recommended.

## Setup on Windows / VS Code

1. Extract this folder and open it in VS Code.
2. Open Terminal > New Terminal.
3. Create and activate a virtual environment:

   ```powershell
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```

4. Install dependencies:

   ```powershell
   python -m pip install -r requirements.txt
   ```

5. Copy `.env.example` to `.env` and enter your newly generated Blynk token in `.env`.

   The backend loads `.env` automatically with `python-dotenv`. Do not put the token in frontend files.

6. Start the server:

   ```powershell
   python app.py
   ```

7. Open http://127.0.0.1:5000

## Blynk datastream mapping

- V0: gas
- V1: temperature
- V2: humidity
- V5: GPS
- V6: force / impact

Check these pin assignments and thresholds against the actual hardware and Blynk configuration.

## Security

- Do not put your Blynk token in `static/app.js`, HTML, screenshots, GitHub, or a public deployment.
- If a token has been shared publicly, revoke/regenerate it in Blynk.
- The included Flask server binds to `127.0.0.1` for local development. For public deployment, use HTTPS, a production WSGI server, authentication/authorization, rate limiting, and managed secret environment variables.
- The dashboard is a prototype. It is not a certified safety system, and its thresholds need calibration against the actual sensors.

## Notes

- The UI loads Bootstrap, Bootstrap Icons, Chart.js, and Leaflet from CDNs, and map tiles from OpenStreetMap. Internet access is needed for these assets.
- `helmet_data.csv` is created beside `app.py` on the first successful dashboard data request.
- Each dashboard poll stores one sample. Refresh is every five seconds by default.
- GPS parser supports strings containing `latitude,longitude`, optionally prefixed with `dir/`. Adjust it if your Blynk GPS datastream uses another format.
