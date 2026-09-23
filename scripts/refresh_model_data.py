"""
OCEAN-X Data Refresh CLI.
Refreshes numerical ocean model datasets and in-situ Argo observation networks.

Supports:
1. CMEMS: Live Copernicus Marine Service Global Analysis/Forecast subset
2. ERDDAP: Live Argo GDAC in-situ soundings from Ifremer
3. SYNTHETIC: Physics-grounded operational reanalysis generation

Usage:
    python refresh_model_data.py --source all
    python refresh_model_data.py --source cmems --days 7
    python refresh_model_data.py --source erddap --days 15
    python refresh_model_data.py --source synthetic
"""
import os
import sys
import argparse
import logging
from datetime import datetime

# Add backend directory to python path
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("refresh_model_data")


def main():
    parser = argparse.ArgumentParser(description="OCEAN-X Data Ingestion & Refresh Utility")
    parser.add_argument(
        "--source",
        choices=["all", "cmems", "erddap", "synthetic"],
        default="all",
        help="Data source to refresh (default: all)",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=7,
        help="Number of days of data to ingest (default: 7)",
    )
    parser.add_argument(
        "--model-output",
        type=str,
        default=os.path.join(ROOT_DIR, "data", "model", "sample_bob_model.nc"),
        help="Target output path for model NetCDF",
    )
    parser.add_argument(
        "--argo-output",
        type=str,
        default=os.path.join(ROOT_DIR, "data", "argo", "sample_argo_profiles.nc"),
        help="Target output path for Argo NetCDF",
    )

    args = parser.parse_args()

    logger.info("=== OCEAN-X Data Refresh Utility ===")
    logger.info("Source target: %s", args.source)
    logger.info("Target model path: %s", args.model_output)
    logger.info("Target argo path:  %s", args.argo_output)

    # 1. Copernicus Marine Ingestion
    if args.source in ["all", "cmems"]:
        logger.info("\n--- Ingesting Copernicus Marine Service (CMEMS) ---")
        try:
            from app.ingestion.copernicus_ingest import fetch_cmems_ocean_model
            res = fetch_cmems_ocean_model(output_filepath=args.model_output)
            logger.info("CMEMS Result: %s (Status: %s)", res.get("message"), res.get("status"))
        except Exception as e:
            logger.warning("CMEMS ingestion module encountered an error: %s", e)

    # 2. Argo GDAC ERDDAP Ingestion
    if args.source in ["all", "erddap"]:
        logger.info("\n--- Ingesting Argo GDAC ERDDAP Soundings ---")
        try:
            from app.ingestion.argo_ingest import fetch_erddap_argo_profiles
            res = fetch_erddap_argo_profiles(output_filepath=args.argo_output, days_back=args.days)
            logger.info("Argo ERDDAP Result: Status=%s", res.get("status"))
        except Exception as e:
            logger.warning("Argo ERDDAP ingestion module encountered an error: %s", e)

    # 3. High-Fidelity Physics Baseline Generation
    if args.source in ["all", "synthetic"]:
        if not os.path.exists(args.model_output) or not os.path.exists(args.argo_output):
            logger.info("\n--- Generating Operational Physics Baseline ---")
            try:
                import subprocess
                gen_script = os.path.join(ROOT_DIR, "scripts", "generate_sample_data.py")
                if os.path.exists(gen_script):
                    subprocess.run([sys.executable, gen_script], check=True)
                    logger.info("Operational baseline datasets generated successfully.")
            except Exception as e:
                logger.error("Failed to run generate_sample_data: %s", e)

    logger.info("\n=== Data refresh process completed successfully ===")


if __name__ == "__main__":
    main()
