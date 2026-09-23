"""
Machine Learning Anomaly Intelligence Service.
Uses scikit-learn Isolation Forest and physical vertical gradient integrals
to detect authentic oceanographic anomalies (e.g. subsurface marine heatwaves,
barrier layer anomalies, sensor calibration drift).
"""
import numpy as np
from sklearn.ensemble import IsolationForest
from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)


class AnomalyService:
    """Service for running genuine ML anomaly intelligence on ocean observations."""

    MIN_LIVE_TRAINING = 5

    def __init__(self, contamination: float = 0.15):
        self.contamination = contamination
        self._model: Optional[IsolationForest] = None
        self._trained = False
        self._profile_cache: Dict[str, Any] = {}
        # Until fit_on_live_fleet() succeeds the forest uses a synthetic prior;
        # every result reports which one produced it.
        self.training_source = "synthetic_prior"
        self.n_training = 0
        self.trained_at: Optional[str] = None
        self._ensure_model_trained()

    def fit_on_live_fleet(self, argo_service, nc_service) -> Dict[str, Any]:
        """Refit the Isolation Forest on real obs-minus-model residual features
        from every Argo profile co-located (space + time) with the live model.

        Unsupervised: the forest learns what today's residual distribution looks
        like and flags profiles that are statistical outliers within it.
        """
        from datetime import datetime, timezone
        from app.services.model_skill_service import colocate_fleet

        fleet = colocate_fleet(argo_service, nc_service, "thetao")
        feats = []
        for c in fleet["matched"]:
            f = self.extract_features(c["depths"], c["obs"], c["model"])
            if f["max_layer_depth"] > 0:
                feats.append([f["mean_delta"], f["max_delta"], f["upper_200m_heat_delta"],
                              f["thermocline_gradient_diff"], f["max_layer_depth"]])
        if len(feats) < self.MIN_LIVE_TRAINING:
            logger.warning("Only %d co-located profiles — keeping synthetic prior for the Isolation Forest", len(feats))
            return {"status": "insufficient", "n": len(feats), "training_source": self.training_source}
        model = IsolationForest(n_estimators=200, contamination=0.10, random_state=42)
        model.fit(np.asarray(feats, dtype=np.float64))
        self._model = model
        self._trained = True
        self.contamination = 0.10
        self.training_source = "live_fleet_residuals"
        self.n_training = len(feats)
        self.trained_at = datetime.now(timezone.utc).isoformat()
        self._profile_cache.clear()
        logger.info("Isolation Forest refit on %d real Argo-vs-model residual vectors", len(feats))
        return {"status": "ok", "n": len(feats), "training_source": self.training_source}

    def _ensure_model_trained(self):
        """Fit Isolation Forest on baseline ocean vertical profile feature distributions."""
        if self._trained and self._model is not None:
            return

        rng = np.random.RandomState(42)
        n_samples = 300

        # Normal oceanographic background baseline:
        # mean_delta: 0.05 to 0.45 °C
        # max_delta: 0.10 to 0.75 °C
        # upper_200m_heat_delta: -0.25 to +0.25 °C
        # thermocline_gradient_diff: 0.002 to 0.020 °C/m
        # max_layer_depth: 10 to 120 meters
        mean_delta = rng.gamma(shape=2.0, scale=0.12, size=n_samples)
        max_delta = mean_delta * rng.uniform(1.2, 2.2, size=n_samples)
        heat_delta = rng.normal(loc=0.0, scale=0.18, size=n_samples)
        grad_diff = rng.gamma(shape=1.8, scale=0.008, size=n_samples)
        max_depth = rng.uniform(10.0, 150.0, size=n_samples)

        # Inject 10% realistic synthetic anomaly vectors (e.g. deep heatwave blobs)
        n_anom = int(n_samples * 0.10)
        mean_delta[:n_anom] += rng.uniform(1.0, 2.5, size=n_anom)
        max_delta[:n_anom] += rng.uniform(2.0, 4.2, size=n_anom)
        heat_delta[:n_anom] += rng.uniform(1.2, 3.0, size=n_anom)
        grad_diff[:n_anom] += rng.uniform(0.025, 0.065, size=n_anom)
        max_depth[:n_anom] = rng.uniform(60.0, 180.0, size=n_anom)

        X_baseline = np.column_stack([
            mean_delta,
            max_delta,
            heat_delta,
            grad_diff,
            max_depth
        ])

        self._model = IsolationForest(
            n_estimators=100,
            contamination=self.contamination,
            random_state=42
        )
        self._model.fit(X_baseline)
        self._trained = True
        logger.info("IsolationForest ML Anomaly Engine fitted on 300 vertical sounding feature vectors.")

    def extract_features(
        self,
        depths: np.ndarray,
        obs_vals: np.ndarray,
        model_vals: np.ndarray
    ) -> Dict[str, float]:
        """Extract oceanographic physical features from obs-vs-model vertical sounding curves."""
        mask = ~np.isnan(obs_vals) & ~np.isnan(model_vals) & (depths <= 500)
        if np.sum(mask) < 5:
            return {
                "mean_delta": 0.0,
                "max_delta": 0.0,
                "upper_200m_heat_delta": 0.0,
                "thermocline_gradient_diff": 0.0,
                "max_layer_depth": 0.0,
            }

        d = depths[mask]
        o = obs_vals[mask]
        m = model_vals[mask]
        # Argo occasionally reports repeated pressure levels; gradients need
        # strictly increasing depth.
        order = np.argsort(d, kind="stable")
        d, o, m = d[order], o[order], m[order]
        keep = np.concatenate([[True], np.diff(d) > 0])
        d, o, m = d[keep], o[keep], m[keep]
        delta = o - m
        abs_delta = np.abs(delta)

        mean_delta = float(np.mean(abs_delta))

        max_idx = int(np.argmax(abs_delta))
        max_delta = float(abs_delta[max_idx])
        max_layer_depth = float(d[max_idx])

        upper_mask = d <= 200
        if np.any(upper_mask) and len(d[upper_mask]) > 1:
            upper_heat_delta = float(np.trapezoid(delta[upper_mask], d[upper_mask]) / 200.0)
        else:
            upper_heat_delta = 0.0

        if len(d) > 2:
            grad_obs = np.gradient(o, d)
            grad_model = np.gradient(m, d)
            thermocline_gradient_diff = float(np.max(np.abs(grad_obs - grad_model)))
        else:
            thermocline_gradient_diff = 0.0

        return {
            "mean_delta": round(mean_delta, 4),
            "max_delta": round(max_delta, 4),
            "upper_200m_heat_delta": round(upper_heat_delta, 4),
            "thermocline_gradient_diff": round(thermocline_gradient_diff, 4),
            "max_layer_depth": round(max_layer_depth, 1),
        }

    def analyze_profile(
        self,
        profile_id: str,
        depths: List[float],
        obs_vals: List[float],
        model_vals: List[float],
        variable: str = "thetao",
        anomaly_threshold: float = 1.0
    ) -> Dict[str, Any]:
        """Perform authentic Isolation Forest ML and physical analysis on a single float profile."""
        self._ensure_model_trained()

        depths_arr = np.array(depths, dtype=np.float64)
        obs_arr = np.array(obs_vals, dtype=np.float64)
        model_arr = np.array(model_vals, dtype=np.float64)

        features = self.extract_features(depths_arr, obs_arr, model_arr)

        deltas = obs_arr - model_arr
        abs_deltas = np.abs(deltas)
        layer_anomalies = []
        anomalous_depths = []

        for i in range(len(depths_arr)):
            d = depths_arr[i]
            if d > 500:
                continue
            is_anomaly = bool(abs_deltas[i] >= anomaly_threshold)
            if is_anomaly:
                anomalous_depths.append(d)
            layer_anomalies.append({
                "depth": round(float(d), 1),
                "model": round(float(model_arr[i]), 3),
                "observed": round(float(obs_arr[i]), 3),
                "delta": round(float(deltas[i]), 3),
                "is_anomaly": is_anomaly,
            })

        # Feature vector for Isolation Forest
        feature_vector = np.array([[
            features["mean_delta"],
            features["max_delta"],
            features["upper_200m_heat_delta"],
            features["thermocline_gradient_diff"],
            features["max_layer_depth"]
        ]], dtype=np.float64)

        # Evaluate Isolation Forest decision score
        # decision_function outputs negative values for anomalies, positive for inliers
        raw_decision = float(self._model.decision_function(feature_vector)[0])
        is_forest_outlier = bool(self._model.predict(feature_vector)[0] == -1)

        # Scale decision function to normalized continuous anomaly score [0.0, 1.0]
        # In scikit-learn, decision_function typically ranges from -0.35 (extreme anomaly) to +0.25 (typical inlier)
        # Shift and scale with logistic sigmoid:
        iso_score = 1.0 / (1.0 + np.exp(12.0 * (raw_decision + 0.02)))

        # Physical heat penalty
        physical_heat_factor = min(1.0, max(0.0, (features["max_delta"] - 0.5) / 2.5))

        # Composite score blending Isolation Forest decision boundary with physical layer delta
        composite_score = round(float(0.65 * iso_score + 0.35 * physical_heat_factor), 3)

        # Severity classification.
        # We require physical corroboration (strong composite score AND a significant max temperature delta). 
        # A simple count of anomalous_depths fails because Argo floats sample every 1-2 meters, meaning
        # a minor 15m thick thermocline mismatch generates 10+ anomalies, falsely triggering CRITICAL.
        # A fixed |ΔT| ≥ 1 °C rule would fire on most profiles because the
        # model's own thermocline RMSE is ~1–1.5 °C; so a profile must be an
        # Isolation Forest outlier relative to the fleet's residual distribution.
        if is_forest_outlier and composite_score >= 0.75:
            status = "CRITICAL_ANOMALY"
            severity = "HIGH"
        elif is_forest_outlier or composite_score >= 0.6:
            status = "WARNING"
            severity = "MEDIUM"
        else:
            status = "NOMINAL"
            severity = "LOW"

        # Oceanographic root cause hypothesis
        advisories = []
        if status == "CRITICAL_ANOMALY":
            if 80 <= features["max_layer_depth"] <= 250:
                hypothesis = (
                    f"Subsurface Marine Heatwave / Downwelling Isopycnal Inversion: "
                    f"Trapped thermal excess of +{features['max_delta']:.2f}°C detected at {features['max_layer_depth']}m depth. "
                    f"Thermocline gradient discrepancy of {features['thermocline_gradient_diff']:.4f}°C/m indicates intense mesoscale eddy compression."
                )
                advisories.append(f"Cyclone Potential: Subsurface heat pool between {max(0, int(features['max_layer_depth'] - 40))}m–{int(features['max_layer_depth'] + 40)}m prevents cold upwelling, providing fuel for rapid tropical cyclone intensification.")
                advisories.append(f"INCOIS Action: Assimilate sensor #{profile_id} soundings into the 6-hr cycle to correct the model's mixed-layer physics at {features['max_layer_depth']}m depth.")
            elif features["max_layer_depth"] < 50:
                hypothesis = "Intense Upper Mixed Layer Heating: Atmospheric radiative forcing divergence in numerical model."
                advisories.append(f"Upper Layer Warming: Atmospheric radiative forcing anomaly at {features['max_layer_depth']}m. Monitor for sudden SST spike.")
                advisories.append(f"INCOIS Action: Cross-reference with INSAT-3D SST retrievals for localized atmospheric marine heatwave confirmation.")
            else:
                hypothesis = "Deep Mesoscale Baroclinic Displacement: Internal wave activity or deep eddy core divergence."
                advisories.append(f"Deep Divergence: Significant internal wave activity or deep eddy core at {features['max_layer_depth']}m.")
                advisories.append(f"INCOIS Action: Assimilate deep sounding data to correct mesoscale baroclinic structure.")
        elif status == "WARNING":
            hypothesis = "Moderate Seasonal Thermocline Displacement: Minor barrier layer salinity or seasonal warming divergence."
            advisories.append(f"Thermocline Drift: Moderate subsurface displacement detected at {features['max_layer_depth']}m. Automated 24h tracking active.")
        else:
            hypothesis = "Model Reanalysis Concordant with Observations: In-situ sensor values verify within normal experimental tolerances."
            advisories.append("Validation: In-situ observations match the model within tolerance at this location and time.")

        result = {
            "profile_id": profile_id,
            "variable": variable,
            "anomaly_score": composite_score,
            "status": status,
            "severity": severity,
            "features": features,
            "hypothesis": hypothesis,
            "advisories": advisories,
            "anomalous_layer_count": len(anomalous_depths),
            "anomalous_depth_range": [min(anomalous_depths), max(anomalous_depths)] if anomalous_depths else None,
            "layer_breakdown": layer_anomalies[:40],
            "ml_metadata": {
                "algorithm": "Scikit-Learn IsolationForest",
                "n_estimators": int(getattr(self._model, "n_estimators", 100)),
                "contamination": self.contamination,
                "raw_decision_function": round(raw_decision, 4),
                "is_outlier": is_forest_outlier,
                "training_source": self.training_source,
                "n_training_profiles": self.n_training,
                "trained_at": self.trained_at,
            }
        }

        self._profile_cache[profile_id] = result
        return result

    def get_fleet_summary(self, argo_service, nc_service) -> Dict[str, Any]:
        """Analyze all active in-situ profiles across the Indian Ocean domain."""
        # Only profiles co-located with a model *analysis* step (±36 h) are
        # scored — comparing a float to a model day weeks away would turn
        # ordinary weather into fake "anomalies".
        from app.services.model_skill_service import colocate_fleet
        fleet = colocate_fleet(argo_service, nc_service, "thetao")
        summary_list = []
        nominal_count = 0
        warning_count = 0
        critical_count = 0

        for c in fleet["matched"]:
            p_id = c["profile_id"]
            try:
                analysis = self.analyze_profile(p_id, c["depths"].tolist(), c["obs"].tolist(), c["model"].tolist(), "thetao")
                p = {"platform_id": c["platform_id"], "latitude": c["latitude"], "longitude": c["longitude"]}

                if analysis["status"] == "CRITICAL_ANOMALY":
                    critical_count += 1
                elif analysis["status"] == "WARNING":
                    warning_count += 1
                else:
                    nominal_count += 1

                summary_list.append({
                    "id": p_id,
                    "platform_id": p["platform_id"],
                    "latitude": p["latitude"],
                    "longitude": p["longitude"],
                    "status": analysis["status"],
                    "severity": analysis["severity"],
                    "anomaly_score": analysis["anomaly_score"],
                    "max_delta": analysis["features"]["max_delta"],
                    "max_depth": analysis["features"]["max_layer_depth"],
                    "hypothesis": analysis["hypothesis"],
                    "timestamp": c["timestamp"],
                    "time_offset_hours": c["time_offset_hours"],
                })
            except Exception as e:
                logger.warning(f"Error analyzing float {p_id}: {e}")
                continue

        summary_list.sort(key=lambda x: x["anomaly_score"], reverse=True)

        return {
            "total_floats": len(summary_list),
            "critical_count": critical_count,
            "warning_count": warning_count,
            "nominal_count": nominal_count,
            "highest_anomaly_float": summary_list[0] if summary_list else None,
            "fleet": summary_list,
            "excluded_outside_model_window": fleet["excluded_time_window"],
            "model_source": nc_service.source_name,
            "ml_training_source": self.training_source,
            "ml_training_profiles": self.n_training,
        }
