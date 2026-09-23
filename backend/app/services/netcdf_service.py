"""NetCDF data service using xarray.

Handles lazy loading of NetCDF datasets and provides methods for
spatial/depth/time subsetting. Never loads full datasets into memory.
"""
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
    
    def load(self) -> bool:
        """Load dataset with lazy chunking (data not read until accessed)."""
        try:
            # The regional subset is small (~60 MB as float32), so load it fully
            # into memory and release the file handle. This lets the scheduled
            # refresh atomically replace the file (required on Windows) and
            # makes hot-reload a simple pointer swap.
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
            logger.error(f"Failed to load NetCDF: {e}")
            self._is_loaded = False
            return False
    
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
