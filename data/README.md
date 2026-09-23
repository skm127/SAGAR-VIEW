# OCEAN-X Data Directory

## ⚠️ Synthetic Data Notice

The data files in this directory are **synthetically generated** for development and testing.
They mimic the structure of real ocean data but contain simulated values.

## Model Data (`model/`)
- `sample_bob_model.nc` — Synthetic Bay of Bengal ocean model
  - Variables: thetao (temperature), so (salinity), uo (eastward current), vo (northward current)
  - Region: 0-25°N, 75-100°E
  - Depth: 15 levels, 0-500m
  - Time: 7 daily steps
  - Resolution: 0.25° (coarser than real 0.083° for dev speed)
  - Format: NetCDF-4, CF-1.6 compliant

## Argo Data (`argo/`)
- `sample_argo_profiles.nc` — Synthetic Argo float profiles
  - 5 float profiles in Bay of Bengal
  - Variables: PRES, TEMP, PSAL
  - Depth range: 0-2000m

## Real Data Sources (for later phases)
- **Model**: Copernicus Marine `GLOBAL_MULTIYEAR_PHY_001_030` (requires free registration)
- **Argo**: GDAC via `https://data-argo.ifremer.fr/` (no credentials needed)
- **INCOIS**: `https://las.incois.gov.in/`

## Generating Sample Data
```bash
cd scripts
pip install xarray netCDF4 numpy
python generate_sample_data.py
```
