"""SAGAR VIEW live data refresh CLI.

Pulls real data only:
  * ocean model — CMEMS (if COPERNICUS_USERNAME/PASSWORD are set) else HYCOM ESPC-D-V02 (no login)
  * Argo GDAC profiles via Ifremer ERDDAP, with Argo QC filtering

Usage:
    python scripts/refresh_model_data.py              # model + Argo
    python scripts/refresh_model_data.py --source argo
    python scripts/refresh_model_data.py --source model
"""
import argparse
import json
import logging
import os
import sys

from dotenv import load_dotenv

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT_DIR)
os.chdir(ROOT_DIR)
load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


def main():
    parser = argparse.ArgumentParser(description="SAGAR VIEW live data refresh")
    parser.add_argument("--source", choices=["all", "model", "argo"], default="all")
    args = parser.parse_args()

    from app.config import get_settings
    from app.ingestion.pipeline import run_refresh

    settings = get_settings()
    result = run_refresh(settings, None, model=args.source in ("all", "model"), argo=args.source in ("all", "argo"))
    print(json.dumps(result, indent=2, default=str))
    sys.exit(0 if result.get("status") == "ok" else 1)


if __name__ == "__main__":
    main()
