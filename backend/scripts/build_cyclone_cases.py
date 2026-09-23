"""Build the cyclone case-study resources from real data.

1. Downloads the IBTrACS v04r01 North Indian best-track CSV (NOAA NCEI).
2. Writes every North Indian storm since 2015 to
   app/resources/cyclones/ibtracs_ni_tracks.json (tracks + RI detection).
3. Runs the Argo-only RI backtest (app/services/backtest_engine.py) for the
   case-study storms and writes app/resources/cyclones/backtest_<name>_<year>.json.

Results are committed so the demo does not depend on venue Wi-Fi; re-run this
script to reproduce them from scratch:

    python scripts/build_cyclone_cases.py              # tracks + all case studies
    python scripts/build_cyclone_cases.py --only MOCHA # one storm
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import logging
import os
import sys
from datetime import datetime, timezone

import httpx

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from app.services.backtest_engine import run_backtest, detect_ri  # noqa: E402

IBTRACS_URL = ("https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/"
               "v04r01/access/csv/ibtracs.NI.list.v04r01.csv")
OUT_DIR = os.path.join(ROOT, "app", "resources", "cyclones")
CASE_STUDIES = [("MOCHA", 2023), ("BIPARJOY", 2023), ("AMPHAN", 2020), ("TAUKTAE", 2021), ("FANI", 2019)]

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("build_cyclone_cases")


def _f(x):
    x = (x or "").strip()
    try:
        return float(x) if x else None
    except ValueError:
        return None


def load_ibtracs(path: str | None) -> list[dict]:
    if path and os.path.exists(path):
        text = open(path, encoding="utf-8", errors="replace").read()
    else:
        log.info("Downloading IBTrACS North Indian CSV …")
        r = httpx.get(IBTRACS_URL, timeout=300, follow_redirects=True)
        r.raise_for_status()
        text = r.text
    rows = list(csv.reader(io.StringIO(text)))
    header, data = rows[0], rows[2:]  # row 1 = units
    ix = {h: i for i, h in enumerate(header)}
    storms: dict[str, dict] = {}
    for row in data:
        season = int(row[ix["SEASON"]])
        if season < 2015:
            continue
        sid = row[ix["SID"]]
        s = storms.setdefault(sid, {
            "sid": sid, "name": row[ix["NAME"]].strip(), "season": season,
            "basin": row[ix["BASIN"]].strip(), "subbasin": row[ix["SUBBASIN"]].strip(), "track": [],
        })
        usa = _f(row[ix["USA_WIND"]])
        wmo = _f(row[ix["WMO_WIND"]])
        t = row[ix["ISO_TIME"]].strip().replace(" ", "T") + "Z"
        s["track"].append({
            "time": t, "lat": _f(row[ix["LAT"]]), "lon": _f(row[ix["LON"]]),
            "wind_kt": usa if usa is not None else wmo,
            "wind_source": "JTWC 1-min" if usa is not None else ("IMD (WMO)" if wmo is not None else None),
            "imd_wind_kt": wmo,
            "pres_hpa": _f(row[ix["WMO_PRES"]]) or _f(row[ix["USA_PRES"]]),
            "nature": row[ix["NATURE"]].strip(),
            "dist2land_km": _f(row[ix["DIST2LAND"]]),
        })
    out = []
    for s in storms.values():
        s["track"] = [p for p in s["track"] if p["lat"] is not None and p["lon"] is not None]
        winds = [p["wind_kt"] for p in s["track"] if p["wind_kt"] is not None]
        s["peak_wind_kt"] = max(winds) if winds else None
        s["ri"] = detect_ri(s["track"])
        out.append(s)
    out.sort(key=lambda s: s["track"][0]["time"] if s["track"] else "")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ibtracs-csv", help="Use a local IBTrACS NI CSV instead of downloading")
    ap.add_argument("--only", help="Only run the backtest for this storm name")
    ap.add_argument("--skip-backtests", action="store_true")
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    storms = load_ibtracs(args.ibtracs_csv)
    tracks_path = os.path.join(OUT_DIR, "ibtracs_ni_tracks.json")
    with open(tracks_path, "w", encoding="utf-8") as f:
        json.dump({
            "source": "IBTrACS v04r01 (NOAA NCEI), North Indian basin",
            "source_url": IBTRACS_URL,
            "built_at": datetime.now(timezone.utc).isoformat(),
            "wind_note": "wind_kt = JTWC 1-min sustained (USA_WIND) where available, else WMO/IMD",
            "storms": storms,
        }, f, separators=(",", ":"))
    log.info("Wrote %d storms (%d with RI) -> %s", len(storms), sum(1 for s in storms if s["ri"]), tracks_path)

    if args.skip_backtests:
        return
    for name, season in CASE_STUDIES:
        if args.only and name != args.only.upper():
            continue
        storm = next((s for s in storms if s["name"] == name and s["season"] == season), None)
        if storm is None:
            log.warning("%s %d not found in IBTrACS", name, season)
            continue
        log.info("Backtesting %s %d …", name, season)
        res = run_backtest(storm)
        path = os.path.join(OUT_DIR, f"backtest_{name.lower()}_{season}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(res, f, separators=(",", ":"), default=str)
        log.info("  status=%s counts=%s verdict=%s", res.get("status"), res.get("counts", {}).get(
            "storm_year_profiles_pre_storm_in_corridor"), res.get("verdict", {}).get("summary"))


if __name__ == "__main__":
    main()
