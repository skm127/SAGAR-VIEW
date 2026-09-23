import pytest
from app.services.anomaly_service import AnomalyService
import numpy as np

def test_anomaly_service_initialization():
    service = AnomalyService()
    service._ensure_model_trained()
    assert service._model is not None

def test_anomaly_scoring_normal_profile():
    service = AnomalyService()
    depths = np.linspace(0, 500, 10).tolist()
    # Identical observed and model temperatures
    temps = np.linspace(28, 10, 10).tolist()
    
    result = service.analyze_profile(
        profile_id="test_1",
        depths=depths,
        obs_vals=temps,
        model_vals=temps,
        variable="thetao"
    )
    
    assert result["profile_id"] == "test_1"
    assert result["status"] in ["NOMINAL", "WARNING"] # Depending on Isolation Forest random seed
    assert result["anomalous_layer_count"] == 0

def test_anomaly_scoring_critical_profile():
    service = AnomalyService()
    depths = np.linspace(0, 500, 10).tolist()
    # Model expects 20C, but observed is 29C across the board
    model_temps = np.linspace(20, 5, 10).tolist()
    obs_temps = np.linspace(29, 15, 10).tolist()
    
    result = service.analyze_profile(
        profile_id="test_2",
        depths=depths,
        obs_vals=obs_temps,
        model_vals=model_temps,
        variable="thetao"
    )
    
    assert result["status"] == "CRITICAL_ANOMALY"
    assert result["severity"] == "HIGH"
    assert result["anomalous_layer_count"] >= 7
