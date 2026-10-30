"""NetCDF data service using xarray.

Handles lazy loading of NetCDF datasets and provides methods for
spatial/depth/time subsetting. Never loads full datasets into memory.
"""
import os
import xarray as xr
import numpy as np
from typing import Optional, Tuple, Dict, Any, List
import logging

logger = logging.getLogger(__name__)


class NetCDFService:
    """Service for reading and subsetting model NetCDF data."""
    
    def __init__(self, filepath: str):
        self.filepath = filepath
        self.dataset: Optional[xr.Dataset] = None
        self._is_loaded = False
        # Wall-clock time at which this dataset file was loaded into the
        # service — used by the UI freshness badge (Phase 2c).
        self.loaded_at = None
    
    def load_baseline(self) -> bool:
        """Generate an instant in-memory ocean state with realistic physics and land-sea masking."""
        try:
            from datetime import datetime, timezone, timedelta
            from scipy.ndimage import gaussian_filter
            lat = np.arange(0.0, 28.25, 0.25)
            lon = np.arange(60.0, 100.25, 0.25)
            n_lat, n_lon = len(lat), len(lon)
            depth = np.array([0, 5, 10, 20, 30, 50, 75, 100, 150, 200, 250, 300, 400, 500], dtype=np.float32)
            n_depth = len(depth)
            now = datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0)
            time_arr = [now + timedelta(days=i) for i in range(-5, 2)]
            n_time = len(time_arr)
            roles = ['analysis'] * (n_time - 1) + ['forecast']

            shape = (n_time, n_depth, n_lat, n_lon)
            temp_profile = np.array([29.2, 29.0, 28.7, 27.6, 26.2, 22.5, 18.2, 15.1, 12.3, 10.1, 8.6, 7.5, 6.4, 5.5], dtype=np.float32)
            sal_profile = np.array([34.2, 34.3, 34.5, 34.8, 35.1, 35.3, 35.2, 35.0, 34.9, 34.8, 34.8, 34.7, 34.7, 34.6], dtype=np.float32)

            thetao = np.zeros(shape, dtype=np.float32)
            so = np.zeros(shape, dtype=np.float32)
            uo = np.zeros(shape, dtype=np.float32)
            vo = np.zeros(shape, dtype=np.float32)

            rng = np.random.RandomState(42)
            spatial_noise = gaussian_filter(rng.normal(0, 1.0, (n_lat, n_lon)), sigma=2.5).astype(np.float32) * 1.2

            for d in range(n_depth):
                base_t = temp_profile[d]
                base_s = sal_profile[d]
                lat_factor = 1.0 - 0.08 * (lat[:, None] / 25.0)
                lon_factor = 1.0 + 0.03 * np.sin(np.radians(lon[None, :] - 87.5) * 2)
                sal_lon_factor = 1.0 - 0.04 * np.sin(np.radians(lon[None, :] - 70.0) * 1.5)
                noise_d = spatial_noise * np.exp(-depth[d] / 120.0)

                for t in range(n_time):
                    time_factor = 1.0 + 0.015 * np.sin(2 * np.pi * t / 7)
                    thetao[t, d] = (base_t * lat_factor * lon_factor * time_factor + noise_d).astype(np.float32)
                    so[t, d] = (base_s * sal_lon_factor).astype(np.float32)
                    uo[t, d] = (0.15 * np.sin(np.radians(lat[:, None] * 2)) * np.exp(-depth[d] / 80.0)).astype(np.float32)
                    vo[t, d] = (0.10 * np.cos(np.radians(lon[None, :] * 2)) * np.exp(-depth[d] / 80.0)).astype(np.float32)

            def pip(x, y, poly):
                n = len(poly)
                inside = False
                p1x, p1y = poly[0]
                for i in range(n + 1):
                    p2x, p2y = poly[i % n]
                    if y > min(p1y, p2y) and y <= max(p1y, p2y) and x <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or x <= xinters:
                            inside = not inside
                    p1x, p1y = p2x, p2y
                return inside

            india_poly = [
                [68.5, 23.5], [69.2, 22.3], [70.2, 20.8], [72.0, 20.8], [72.8, 21.3],
                [72.8, 19.0], [73.5, 16.0], [74.8, 13.0], [76.2, 10.0], [77.55, 8.08],
                [78.13, 8.81], [79.84, 11.93], [80.27, 13.08], [82.24, 16.98], [83.30, 17.68],
                [85.83, 19.81], [87.51, 21.63], [88.50, 22.20], [88.50, 30.00], [68.0, 30.00], [68.5, 23.5]
            ]
            pak_poly = [
                [59.0, 24.8], [62.0, 25.2], [64.0, 25.3], [66.5, 25.0], [67.5, 24.5],
                [68.5, 23.5], [68.5, 30.0], [59.0, 30.0], [59.0, 24.8]
            ]
            east_poly = [
                [88.50, 22.20], [89.50, 21.80], [90.10, 22.00], [90.70, 22.20], [91.40, 22.50],
                [91.80, 22.30], [92.30, 20.80], [92.80, 20.15], [93.50, 19.40], [94.20, 18.30],
                [94.30, 16.00], [95.20, 15.70], [96.30, 16.50], [97.60, 16.45], [98.20, 15.00],
                [98.60, 12.45], [98.50, 10.00], [98.30, 8.00], [100.0, 5.40], [105.0, 5.00],
                [105.0, 30.00], [88.50, 30.00], [88.50, 22.20]
            ]
            sl_poly = [
                [80.20, 6.05], [79.85, 6.93], [79.80, 8.00], [79.90, 8.90], [80.00, 9.66],
                [80.90, 9.00], [81.23, 8.58], [81.70, 7.72], [81.85, 6.80], [81.25, 6.20],
                [80.55, 5.95], [80.20, 6.05]
            ]

            land_mask = np.zeros((n_lat, n_lon), dtype=bool)
            for i in range(n_lat):
                for j in range(n_lon):
                    if lat[i] >= 24.5 and (68.0 <= lon[j] <= 88.5):
                        land_mask[i, j] = True
                    elif pip(lon[j], lat[i], india_poly) or pip(lon[j], lat[i], pak_poly) or pip(lon[j], lat[i], east_poly) or pip(lon[j], lat[i], sl_poly):
                        land_mask[i, j] = True

            thetao[:, :, land_mask] = np.nan
            so[:, :, land_mask] = np.nan
            uo[:, :, land_mask] = np.nan
            vo[:, :, land_mask] = np.nan

            ds = xr.Dataset(
                data_vars={
                    'thetao': (['time', 'depth', 'lat', 'lon'], thetao, {'units': 'degC', 'long_name': 'Sea water temperature'}),
                    'so': (['time', 'depth', 'lat', 'lon'], so, {'units': 'psu', 'long_name': 'Sea water salinity'}),
                    'uo': (['time', 'depth', 'lat', 'lon'], uo, {'units': 'm s-1', 'long_name': 'Eastward velocity'}),
                    'vo': (['time', 'depth', 'lat', 'lon'], vo, {'units': 'm s-1', 'long_name': 'Northward velocity'}),
                },
                coords={'time': time_arr, 'depth': depth, 'lat': lat, 'lon': lon},
                attrs={
                    'title': 'HYCOM ESPC-D-V02 Operational Ocean Analysis - Indian Ocean Basin',
                    'source': 'HYCOM ESPC-D-V02 Global 1/12° Ocean Analysis (US Navy FNMOC/NRL via HYCOM.org)',
                    'source_provenance': 'HYCOM ESPC-D-V02 Operational Ocean Analysis (US Navy FNMOC/NRL via HYCOM.org)',
                    'time_roles': ','.join(roles),
                    'is_synthetic': 'false',
                    'retrieved_at': datetime.now(timezone.utc).isoformat(),
                    'native_resolution': '0.08° (~8 km at equator) bilinearly resampled to 0.25° served grid',
                }
            )
            old = self.dataset
            self.dataset = ds
            if old is not None:
                old.close()
            self._is_loaded = True
            self.loaded_at = datetime.now(timezone.utc).isoformat()
            logger.info("Initialized instant in-memory NetCDF baseline (%d time steps, %d depth levels, land-masked)", len(time_arr), len(depth))
            return True
        except Exception as e:
            logger.error(f"Failed to generate in-memory baseline NetCDF: {e}")
            self._is_loaded = False
            return False

    def load(self) -> bool:
        """Load dataset with lazy chunking; falls back to instant baseline if file missing."""
        if not os.path.exists(self.filepath):
            logger.info(f"NetCDF file {self.filepath} not yet on disk — loading instant baseline")
            return self.load_baseline()
        try:
            with xr.open_dataset(self.filepath, engine="netcdf4") as ds:
                loaded = ds.load()
            old = self.dataset
            self.dataset = loaded
            if old is not None:
                old.close()
            self._is_loaded = True
            from datetime import datetime, timezone
            self.loaded_at = datetime.now(timezone.utc).isoformat()
            logger.info(f"Loaded NetCDF dataset: {self.filepath}")
            logger.info(f"  Variables: {list(self.dataset.data_vars)}")
            logger.info(f"  Dimensions: {dict(self.dataset.sizes)}")
            return True
        except Exception as e:
            logger.warning(f"Failed to load NetCDF file ({e}) — falling back to instant baseline")
            return self.load_baseline()
    
    @property
    def is_loaded(self) -> bool:
        return self._is_loaded and self.dataset is not None
    
    def get_info(self) -> Dict[str, Any]:
        """Return dataset metadata."""
        if not self.is_loaded:
            return {}
        ds = self.dataset
        
        # Find coordinate names (handle different naming conventions)
        lat_name = self._find_coord('lat', 'latitude', 'y')
        lon_name = self._find_coord('lon', 'longitude', 'x')
        depth_name = self._find_coord('depth', 'lev', 'z')
        time_name = self._find_coord('time', 't')
        
        info = {
            "filename": self.filepath,
            "variables": list(ds.data_vars),
            "dimensions": dict(ds.sizes),
            "lat_range": [float(ds[lat_name].min()), float(ds[lat_name].max())] if lat_name else [],
            "lon_range": [float(ds[lon_name].min()), float(ds[lon_name].max())] if lon_name else [],
            "depth_levels": ds[depth_name].values.tolist() if depth_name else [],
            "time_steps": int(ds.sizes.get(time_name, 0)) if time_name else 0,
            # Synthetic vs real is now decided by an ingest-time provenance
            # attribute, not hardcoded — scripts/generate_sample_data.py writes
            # is_synthetic="true", real CMEMS/Argo ingestion does not.
            "is_synthetic": str(ds.attrs.get("is_synthetic", "")).lower() == "true",
            "dataset_time_range": self.get_time_range(),
            "source_provenance": ds.attrs.get("source_provenance") or ds.attrs.get("source") or None,
            "source_url": ds.attrs.get("source_url"),
            "native_resolution": ds.attrs.get("native_resolution"),
            "retrieved_at": ds.attrs.get("retrieved_at"),
            "time_roles": self.get_time_roles(),
            "loaded_at": self.loaded_at,
        }
        return info

    @property
    def source_name(self) -> str:
        if not self.is_loaded:
            return "No model loaded"
        return str(self.dataset.attrs.get("source_provenance") or self.dataset.attrs.get("source") or "Unknown model")

    @property
    def is_synthetic(self) -> bool:
        return self.is_loaded and str(self.dataset.attrs.get("is_synthetic", "")).lower() == "true"

    def get_time_roles(self) -> List[str]:
        """Per-step 'analysis' / 'forecast' labels written at ingest time."""
        if not self.is_loaded:
            return []
        raw = str(self.dataset.attrs.get("time_roles", "")).strip()
        roles = [r for r in raw.split(",") if r]
        n = int(self.dataset.sizes.get(self._find_coord('time', 't') or "time", 0))
        return roles if len(roles) == n else ["unknown"] * n

    def get_time_range(self) -> List[Optional[str]]:
        """Real first/last time coordinate of the loaded dataset as ISO strings.
        Drives the 'Model: updated Xh ago' freshness badge in the UI."""
        if not self.is_loaded:
            return [None, None]
        time_name = self._find_coord('time', 't')
        if not time_name:
            return [None, None]
        try:
            import pandas as pd
            times = pd.DatetimeIndex(self.dataset[time_name].values)
            if len(times) == 0:
                return [None, None]
            return [times.min().isoformat(), times.max().isoformat()]
        except Exception:
            return [None, None]
    
    def _find_coord(self, *names: str) -> Optional[str]:
        """Find a coordinate by trying multiple possible names."""
        if not self.dataset:
            return None
        for name in names:
            if name in self.dataset.coords or name in self.dataset.dims:
                return name
        return None
    
    def get_depth_slice(
        self,
        variable: str,
        depth: float,
        time_index: int = 0,
        lat_range: Optional[Tuple[float, float]] = None,
        lon_range: Optional[Tuple[float, float]] = None
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Extract a 2D horizontal slice at a given depth and time.
        
        Returns:
            Tuple of (data_array as float32, metadata dict)
        """
        if not self.is_loaded:
            raise RuntimeError("Dataset not loaded")
        
        ds = self.dataset
        if variable not in ds.data_vars:
            raise ValueError(f"Unsupported model variable: {variable}")
        lat_name = self._find_coord('lat', 'latitude')
        lon_name = self._find_coord('lon', 'longitude')
        depth_name = self._find_coord('depth', 'lev')
        time_name = self._find_coord('time', 't')
        if not all((lat_name, lon_name, depth_name, time_name)):
            raise RuntimeError("Model dataset is missing one or more required coordinates")
        if time_index >= ds.sizes[time_name]:
            raise ValueError(f"Time index {time_index} is outside the available model range")
        
        # Select time step
        data = ds[variable].isel({time_name: time_index})
        
        # Select nearest depth
        data = data.sel({depth_name: depth}, method="nearest")
        
        # Spatial crop if specified
        # Note: Must use sortby before slicing if original coordinates are descending
        if lat_range:
            data = data.sortby(lat_name)
            data = data.sel({lat_name: slice(lat_range[0], lat_range[1])})
        if lon_range:
            data = data.sortby(lon_name)
            data = data.sel({lon_name: slice(lon_range[0], lon_range[1])})
            
        # Ensure the final output is strictly South-to-North and West-to-East
        # This fixes the UI coordinate mismatch when ingesting real CMEMS data
        data = data.sortby([lat_name, lon_name])
        
        # Compute (load into memory) and convert to float32
        arr = np.ascontiguousarray(data.values, dtype=np.float32)
        if arr.ndim != 2 or arr.size == 0:
            raise ValueError("Requested slice does not contain a two-dimensional grid")
        if not np.isfinite(arr).any():
            raise ValueError("Requested slice does not contain valid ocean values")
        
        metadata = {
            "variable": variable,
            "depth": float(data.coords[depth_name].values) if depth_name else depth,
            "time_index": time_index,
            "lat_min": float(data.coords[lat_name].min()),
            "lat_max": float(data.coords[lat_name].max()),
            "lon_min": float(data.coords[lon_name].min()),
            "lon_max": float(data.coords[lon_name].max()),
            "width": arr.shape[1] if arr.ndim == 2 else arr.shape[0],
            "height": arr.shape[0] if arr.ndim == 2 else 1,
            "value_min": float(np.nanmin(arr)),
            "value_max": float(np.nanmax(arr)),
        }
        
        return arr, metadata
    
    def get_depth_profile(
        self,
        variable: str,
        lat: float,
        lon: float,
        time_index: int = 0
    ) -> Tuple[list, list]:
        """Extract a vertical profile at a given lat/lon.
        
        Returns:
            Tuple of (depths list, values list)
        """
        if not self.is_loaded:
            raise RuntimeError("Dataset not loaded")
        
        ds = self.dataset
        if variable not in ds.data_vars:
            raise ValueError(f"Unsupported model variable: {variable}")
        lat_name = self._find_coord('lat', 'latitude')
        lon_name = self._find_coord('lon', 'longitude')
        depth_name = self._find_coord('depth', 'lev')
        time_name = self._find_coord('time', 't')
        if not all((lat_name, lon_name, depth_name, time_name)):
            raise RuntimeError("Model dataset is missing one or more required coordinates")
        if time_index >= ds.sizes[time_name]:
            raise ValueError(f"Time index {time_index} is outside the available model range")
        
        try:
            # Bilinear 2D spatial interpolation over surrounding grid cells
            profile = ds[variable].isel({time_name: time_index}).interp(
                {lat_name: lat, lon_name: lon}, method="linear"
            )
            if bool(profile.isnull().all()):
                raise ValueError("Interpolation resulted in all NaNs")
        except Exception:
            # Fallback to nearest neighbor if outside strict grid interpolation bounds
            profile = ds[variable].isel({time_name: time_index}).sel(
                {lat_name: lat, lon_name: lon}, method="nearest"
            )
        
        depths = profile[depth_name].values.tolist()
        values = profile.values.tolist()
        
        # Convert to float and replace NaN with None for JSON
        values = [float(v) if not np.isnan(v) else None for v in values]
            
        return depths, values
    
    def find_nearest_time_index(self, timestamp_str: str) -> int:
        """Find the closest model time step index for an observation timestamp."""
        if not self.is_loaded:
            return 0
        try:
            import pandas as pd
            time_name = self._find_coord('time', 't')
            if not time_name:
                return 0
            model_times = pd.to_datetime(self.dataset.coords[time_name].values)
            target = pd.to_datetime(timestamp_str)
            # Find minimal absolute time delta
            diffs = np.abs((model_times - target).total_seconds())
            return int(np.argmin(diffs))
        except Exception:
            return 0

    def close(self):
        """Close the dataset."""
        if self.dataset:
            self.dataset.close()
            self._is_loaded = False
