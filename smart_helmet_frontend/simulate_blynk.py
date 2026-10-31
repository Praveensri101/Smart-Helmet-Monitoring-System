
import random
import time
import urllib.parse
import urllib.request
import urllib.error
from getpass import getpass

token = input("Enter your new Blynk Auth Token: ")

while True:
    data = {
        "V0": random.randint(200, 800),
        "V1": round(random.uniform(25, 38), 1),
        "V2": round(random.uniform(40, 75), 1),
        "V5": "11.0168,76.9558",
        "V6": random.randint(100, 900)
    }

    url = "https://blynk.cloud/external/api/batch/update?" + urllib.parse.urlencode(
        {"token": token, **data}
    )

    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            print("Blynk updated:", data)

    except urllib.error.HTTPError as error:
        print("HTTP Error:", error.code)
        print("Blynk response:", error.read().decode())

    except Exception as error:
        print("Error:", error)

    time.sleep(5)
