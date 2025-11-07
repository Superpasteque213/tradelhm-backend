import os, base64, requests

TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"

CLIENT_ID = os.getenv("CDSE_CLIENT_ID", "TON_CLIENT_ID")
CLIENT_SECRET = os.getenv("CDSE_CLIENT_SECRET", "TON_CLIENT_SECRET")

def get_token():
    # 1) client_secret_post
    data = {
        "grant_type": "client_credentials",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }
    r = requests.post(TOKEN_URL, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
    if r.ok:
        return r.json()["access_token"]

    # 2) client_secret_basic (Authorization: Basic base64(client_id:client_secret))
    basic = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    r2 = requests.post(
        TOKEN_URL,
        data={"grant_type": "client_credentials"},
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded"
        },
    )
    if r2.ok:
        return r2.json()["access_token"]

    # Logs d'erreur utiles
    try:
        err1 = r.json()
    except Exception:
        err1 = r.text
    try:
        err2 = r2.json()
    except Exception:
        err2 = r2.text
    raise RuntimeError(f"Token error. POST body auth -> {r.status_code}: {err1} | Basic auth -> {r2.status_code}: {err2}")

if __name__ == "__main__":
    print("🔑 Obtention du token…")
    token = get_token()
    print("✅ Token OK (longueur):", len(token))
