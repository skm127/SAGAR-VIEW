"""Tests for the ocean physics, RI detection, backtest resources, WMS and
model-trust endpoints."""
import math

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.ocean_physics import upper_ocean_metrics, pressure_to_depth, TCHP_FACTOR
from app.services.backtest_engine import detect_ri


# ── Physics ────────────────────────────────────────────────────────────────
def test_tchp_matches_analytic_linear_profile():
    # T(z) = 30 - 0.1 z  →  D26 = 40 m,  ∫0^40 (4 - 0.1 z) dz = 80 °C·m
    depths = np.arange(0, 201, 5.0)
    temps = 30.0 - 0.1 * depths
    m = upper_ocean_metrics(depths.tolist(), temps.tolist())
    assert m["d26"] == pytest.approx(40.0, abs=0.1)
    assert m["tchp"] == pytest.approx(80.0 * TCHP_FACTOR, rel=1e-3)
    assert m["sst"] == pytest.approx(30.0)
    assert m["t100"] == pytest.approx(20.0)


def test_tchp_undefined_when_profile_too_shallow():
    # Still warmer than 26 °C at the deepest sample → D26 unknown → TCHP must be None
    m = upper_ocean_metrics([0, 10, 20, 30], [29.5, 29.4, 29.2, 28.9])
    assert m["tchp"] is None and m["d26"] is None


def test_tchp_zero_for_cold_surface():
    m = upper_ocean_metrics([0, 50, 100, 200], [24.0, 22.0, 18.0, 12.0])
    assert m["tchp"] == 0.0 and m["d26"] == 0.0


def test_saunders_pressure_to_depth():
    z = pressure_to_depth([1000.0], 15.0)[0]
    c1 = (5.92 + 5.25 * math.sin(math.radians(15)) ** 2) * 1e-3
    assert z == pytest.approx((1 - c1) * 1000 - 2.21, abs=1e-6)
    assert 990 < z < 993


# ── Rapid intensification ──────────────────────────────────────────────────
def _track(winds):
    return [{"time": f"2023-05-{10 + i // 4:02d}T{(i % 4) * 6:02d}:00:00Z", "lat": 10 + i * 0.2, "lon": 88.0,
             "wind_kt": w} for i, w in enumerate(winds)]


def test_detect_ri_finds_first_30kt_in_24h():
    ri = detect_ri(_track([25, 30, 35, 40, 50, 65, 80, 90]))
    assert ri is not None
    assert ri["delta_kt_24h"] >= 30
    assert ri["onset_time"] == "2023-05-10T06:00:00Z"  # 30 → 65 kt by 11 May 06Z


def test_detect_ri_none_for_slow_storm():
    assert detect_ri(_track([30, 35, 40, 45, 50, 55, 60, 65])) is None


# ── API (uses the data on disk; skips if no live data has been ingested) ───
@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_backtests_are_real_and_honest(client):
    r = client.get("/api/cyclones/backtests")
    assert r.status_code == 200
    body = r.json()
    assert body["scorecard"]["storms_evaluated"] >= 1
    for b in body["backtests"]:
        assert b["n_climatology_profiles"] > 0
        # A significant signal must come with p < 0.05
        if b["significant_lead_time_hours"]:
            assert b["p_value"] is not None and b["p_value"] < 0.05


def test_history_has_ri_storms(client):
    r = client.get("/api/cyclones/history?since=2019")
    assert r.status_code == 200
    storms = r.json()["storms"]
    names = {(s["name"], s["season"]) for s in storms}
    assert ("MOCHA", 2023) in names and ("BIPARJOY", 2023) in names


def test_wms_capabilities_and_getmap(client):
    if not app.state.nc_service.is_loaded:
        pytest.skip("no model data ingested")
    cap = client.get("/ogc/wms?SERVICE=WMS&REQUEST=GetCapabilities")
    assert cap.status_code == 200 and "<WMS_Capabilities" in cap.text and "<Name>tchp</Name>" in cap.text
    png = client.get("/ogc/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=thetao&CRS=EPSG:4326"
                     "&BBOX=0,60,28,100&WIDTH=64&HEIGHT=48&FORMAT=image/png")
    assert png.status_code == 200 and png.content[:8] == b"\x89PNG\r\n\x1a\n"
    fi = client.get("/ogc/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=thetao&QUERY_LAYERS=thetao"
                    "&CRS=EPSG:4326&BBOX=0,60,28,100&WIDTH=40&HEIGHT=28&I=20&J=14&INFO_FORMAT=application/json")
    assert fi.status_code == 200 and fi.json()["features"][0]["properties"]["layer"] == "thetao"


def test_model_is_not_synthetic_and_skill_is_computed(client):
    if not (app.state.nc_service.is_loaded and app.state.argo_service.is_loaded):
        pytest.skip("no live data ingested")
    assert app.state.nc_service.is_synthetic is False
    r = client.get("/api/skill/depth-bands")
    assert r.status_code == 200
    s = r.json()
    assert s["n_profiles_colocated"] > 0
    assert all(b["rmse"] is None or b["rmse"] >= 0 for b in s["bands"])


def test_data_status_reports_no_fake_platforms(client):
    r = client.get("/api/data/status")
    assert r.status_code == 200
    assert r.json()["argo"]["n_moored_buoys"] == 0
    obs = client.get("/api/observations/all")
    assert obs.status_code == 200
    assert obs.json()["moored_buoys"] == [] and obs.json()["gliders"] == []
