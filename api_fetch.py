import requests
import json
import os

WEKEO_USERNAME = os.getenv("WEKEO_USERNAME")
WEKEO_PASSWORD = os.getenv("WEKEO_PASSWORD")

# ✅ Nouveau endpoint Copernicus WEkEO (depuis 2024)
TOKEN_URL = "https://identity.wekeo.eu/auth/realms/wekeo/protocol/openid-connect/token"
BROKER_URL = "https://wekeo-broker.apps.wekeo.eu/databroker"

def get_token():
    print("🔑 Obtention du token…")
    data = {
        "client_id": "wekeo",
        "username": "enzo.rubagotti@outlook.com",
        "password": "Rub@gotti2004",
        "grant_type": "password",
    }
    r = requests.post(TOKEN_URL, data=data)
    if r.status_code != 200:
        raise RuntimeError(f"Token error {r.status_code}: {r.text}")
    token = r.json()["access_token"]
    print("✅ Token obtenu.")
    return token


def get_datasets(token):
    print("📦 Récupération de la liste des datasets…")
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BROKER_URL}/datasets", headers=headers)
    if r.status_code != 200:
        raise RuntimeError(f"Dataset error {r.status_code}: {r.text}")
    return r.json()


if __name__ == "__main__":
    token = get_token()
    datasets = get_datasets(token)

    with open("wekeo_datasets.json", "w") as f:
        json.dump(datasets, f, indent=2)

    print("🌍 Données sauvegardées dans wekeo_datasets.json")
