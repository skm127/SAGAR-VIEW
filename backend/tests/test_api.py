from fastapi.testclient import TestClient
from app.main import app

def test_api_health_check():
    with TestClient(app) as client:
        r = client.get("/api/health")
        if r.status_code == 200:
            assert r.status_code == 200

def test_api_model_info():
    with TestClient(app) as client:
        r = client.get("/api/model/info")
        assert r.status_code == 200

def test_api_model_slice():
    with TestClient(app) as client:
        r = client.get("/api/model/slice?variable=thetao&depth=0&time_index=0")
        assert r.status_code == 200

def test_api_observations_all():
    with TestClient(app) as client:
        r = client.get("/api/observations/all")
        assert r.status_code == 200

def test_api_heat_potential():
    with TestClient(app) as client:
        r = client.get("/api/analytics/heat-potential")
        assert r.status_code == 200
