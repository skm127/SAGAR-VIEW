"""
OCEAN-X Sample Data Generator

Generates synthetic but realistic NetCDF data files for development:
1. Bay of Bengal ocean model data (temperature, salinity, currents)
2. Argo float profiles in the region

The data is synthetic but follows CF conventions and has realistic
value ranges and gradients. Flagged clearly as synthetic.

Usage:
    python generate_sample_data.py
"""
import numpy as np
from scipy.ndimage import gaussian_filter
import xarray as xr
import os
from datetime import datetime, timedelta

# Output directory
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend', 'data')
MODEL_DIR = os.path.join(DATA_DIR, 'model')
ARGO_DIR = os.path.join(DATA_DIR, 'argo')


def generate_model_data():
    """
    Generate a synthetic Bay of Bengal ocean model NetCDF file.
    
    Mimics structure of Copernicus GLOBAL_MULTIYEAR_PHY_001_030:
    - 0.25° grid (simplified from real 0.083°)
    - 15 depth levels (simplified from real 50)
    - 7 daily time steps
    - Variables: thetao, so, uo, vo
    """
    print("Generating synthetic model data...")
    
    # Grid definition — All Oceans around India (Arabian Sea, Bay of Bengal, Equatorial IO)
    lat = np.arange(0.0, 28.25, 0.25)    # 0-28°N, 113 points
    lon = np.arange(60.0, 100.25, 0.25)  # 60-100°E, 161 points
    depth = np.array([0, 5, 10, 20, 30, 50, 75, 100, 150, 200, 250, 300, 400, 500], dtype=np.float64)
    
    # Time: 7 daily steps starting from today (to look live in the UI)
    base_time = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    time = [base_time + timedelta(days=i) for i in range(7)]
    
    n_time = len(time)
    n_depth = len(depth)
    n_lat = len(lat)
    n_lon = len(lon)
    
    print(f"  Grid: {n_lat} lat × {n_lon} lon × {n_depth} depth × {n_time} time")
    
    # ---- Temperature (thetao) ----
    # Realistic Bay of Bengal temperature profile:
    # Surface: ~28-30°C, decreasing with depth
    # Latitude gradient: warmer near equator
    # Slight east-west variation
    
    # Base temperature profile with depth
    temp_profile = np.array([
        29.0, 28.8, 28.5, 27.5, 26.0, 22.0, 18.0, 15.0, 
        12.0, 10.0, 8.5, 7.5, 6.5, 5.5
    ])
    
    thetao = np.zeros((n_time, n_depth, n_lat, n_lon), dtype=np.float32)
    for t in range(n_time):
        # Generate smooth spatial noise representing mesoscale eddies and thermal fronts
        spatial_noise_t = gaussian_filter(np.random.normal(0, 1.0, (n_lat, n_lon)), sigma=2.5) * 1.5
        
        for d in range(n_depth):
            base_temp = temp_profile[d]
            # Add latitude gradient (warmer near equator)
            lat_factor = 1.0 - 0.08 * (lat[:, None] / 25.0)
            # Add longitude variation
            lon_factor = 1.0 + 0.03 * np.sin(np.radians(lon[None, :] - 87.5) * 2)
            # Add time variation (slight warming/cooling)
            time_factor = 1.0 + 0.02 * np.sin(2 * np.pi * t / 7)
            # Blend the smooth spatial noise, decaying with depth
            noise_d = spatial_noise_t * np.exp(-depth[d] / 100)
            thetao[t, d] = base_temp * lat_factor * lon_factor * time_factor + noise_d
    
    # ---- Salinity (so) ----
    # Bay of Bengal: relatively fresh at surface due to river input
    # Surface: 32-34 PSU, increasing with depth to ~35 PSU
    sal_profile = np.array([
        33.0, 33.2, 33.5, 33.8, 34.0, 34.3, 34.5, 34.7,
        34.8, 34.9, 35.0, 35.0, 35.0, 35.0
    ])
    
    so = np.zeros((n_time, n_depth, n_lat, n_lon), dtype=np.float32)
    for t in range(n_time):
        # Different spatial noise for salinity fronts
        spatial_noise_s = gaussian_filter(np.random.normal(0, 1.0, (n_lat, n_lon)), sigma=3.0) * 0.4
        
        for d in range(n_depth):
            base_sal = sal_profile[d]
            # Fresher near coast (river discharge)
            coast_factor = 1.0 - 0.02 * np.exp(-((lon[None, :] - 80) ** 2) / 50)
            # Latitude effect (fresher in north due to Ganges)
            lat_effect = 1.0 - 0.015 * (lat[:, None] / 25.0)
            noise_s = spatial_noise_s * np.exp(-depth[d] / 50)
            so[t, d] = base_sal * coast_factor * lat_effect + noise_s
    
    # ---- Currents (uo, vo) ----
    # Simplified Bay of Bengal circulation
    uo = np.zeros((n_time, n_depth, n_lat, n_lon), dtype=np.float32)
    vo = np.zeros((n_time, n_depth, n_lat, n_lon), dtype=np.float32)
    
    for t in range(n_time):
        for d in range(n_depth):
            # Current speed decreases with depth
            depth_decay = np.exp(-depth[d] / 200)
            
            # Eastward current pattern
            uo[t, d] = 0.15 * depth_decay * np.sin(
                np.radians(lat[:, None] * 3)
            ) * np.cos(np.radians(lon[None, :] - 87.5))
            
            # Northward current pattern
            vo[t, d] = 0.1 * depth_decay * np.cos(
                np.radians(lat[:, None] * 2)
            ) * np.sin(np.radians(lon[None, :] - 85))

            # Add beautiful swirling eddies (like the reference windy.com visualization)
            eddies = [
                {'lat': 16.0, 'lon': 86.0, 'radius': 2.5, 'strength': 0.8, 'dir': 1},   # Bay of Bengal cyclone
                {'lat': 10.0, 'lon': 88.0, 'radius': 3.5, 'strength': 0.6, 'dir': -1},  # BoB anti-cyclone
                {'lat': 8.0,  'lon': 83.0, 'radius': 2.0, 'strength': 0.7, 'dir': 1},   # Sri Lanka east swirl
                {'lat': 18.0, 'lon': 66.0, 'radius': 3.0, 'strength': 0.8, 'dir': 1},   # Arabian Sea swirl
                {'lat': 12.0, 'lon': 69.0, 'radius': 2.5, 'strength': 0.6, 'dir': -1},  # Arabian Sea anti-cyclone
                {'lat': 2.0,  'lon': 75.0, 'radius': 4.0, 'strength': 0.9, 'dir': 1},   # Equatorial swirl
                {'lat': -1.0, 'lon': 90.0, 'radius': 3.0, 'strength': 0.7, 'dir': -1},  # Deep equatorial swirl
                {'lat': 20.0, 'lon': 89.0, 'radius': 1.8, 'strength': 0.6, 'dir': 1},   # North BoB small eddy
            ]
            
            for eddy in eddies:
                # Calculate distance from eddy center
                d_lat = lat[:, None] - eddy['lat']
                d_lon = lon[None, :] - eddy['lon']
                r_sq = d_lat**2 + d_lon**2
                
                # Vortex velocity (cross product of position vector)
                # u = -y * exp(-r^2/R^2), v = x * exp(-r^2/R^2)
                swirl = np.exp(-r_sq / (eddy['radius']**2)) * eddy['strength'] * depth_decay * eddy['dir']
                
                uo[t, d] += -d_lat * swirl
                vo[t, d] += d_lon * swirl
            
            # Add noise
            uo[t, d] += np.random.normal(0, 0.02, (n_lat, n_lon)).astype(np.float32)
            vo[t, d] += np.random.normal(0, 0.02, (n_lat, n_lon)).astype(np.float32)

    # ---- Realistic Land-Sea Masking ----
    # Mask out Peninsular India, Sri Lanka, Bangladesh, and Myanmar
    def point_in_polygon(x, y, poly):
        n = len(poly)
        inside = False
        p1x, p1y = poly[0]
        for i in range(n + 1):
            p2x, p2y = poly[i % n]
            if y > min(p1y, p2y):
                if y <= max(p1y, p2y):
                    if x <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or x <= xinters:
                            inside = not inside
            p1x, p1y = p2x, p2y
        return inside

    india_poly = [
        [68.5, 23.5], [69.2, 22.3], [70.2, 20.8], [72.0, 20.8], [72.8, 21.3],
        [72.8, 19.0], [73.5, 16.0], [74.8, 13.0], [76.2, 10.0], [77.55, 8.08],
        [78.13, 8.81], [79.84, 11.93], [80.27, 13.08], [82.24, 16.98],
        [83.30, 17.68], [85.83, 19.81], [87.51, 21.63], [88.50, 22.20],
        [88.50, 30.00], [68.0, 30.00], [68.5, 23.5]
    ]

    pakistan_iran_poly = [
        [59.0, 24.8], [62.0, 25.2], [64.0, 25.3], [66.5, 25.0], [67.5, 24.5],
        [68.5, 23.5], [68.5, 30.0], [59.0, 30.0], [59.0, 24.8]
    ]

    east_land_poly = [
        [88.50, 22.20], [89.50, 21.80], [90.10, 22.00], [90.70, 22.20], [91.40, 22.50],
        [91.80, 22.30], [92.30, 20.80], [92.80, 20.15], [93.50, 19.40], [94.20, 18.30],
        [94.30, 16.00], [95.20, 15.70], [96.30, 16.50], [97.60, 16.45], [98.20, 15.00],
        [98.60, 12.45], [98.50, 10.00], [98.30, 8.00], [100.0, 5.40], [105.0, 5.00],
        [105.0, 30.00], [88.50, 30.00], [88.50, 22.20]
    ]

    sri_lanka_poly = [
        [80.20, 6.05], [79.85, 6.93], [79.80, 8.00], [79.90, 8.90], [80.00, 9.66],
        [80.90, 9.00], [81.23, 8.58], [81.70, 7.72], [81.85, 6.80], [81.25, 6.20],
        [80.55, 5.95], [80.20, 6.05]
    ]

    print("  Applying realistic ocean land-sea mask across Indian Ocean domain...")
    land_mask = np.zeros((n_lat, n_lon), dtype=bool)
    for i in range(n_lat):
        cur_lat = lat[i]
        for j in range(n_lon):
            cur_lon = lon[j]
            if cur_lat >= 25.0 and (68.0 <= cur_lon <= 88.5):
                land_mask[i, j] = True
            elif point_in_polygon(cur_lon, cur_lat, india_poly):
                land_mask[i, j] = True
            elif point_in_polygon(cur_lon, cur_lat, pakistan_iran_poly):
                land_mask[i, j] = True
            elif point_in_polygon(cur_lon, cur_lat, east_land_poly):
                land_mask[i, j] = True
            elif point_in_polygon(cur_lon, cur_lat, sri_lanka_poly):
                land_mask[i, j] = True

    # Set land grid cells to NaN / fill values across all variables
    thetao[:, :, land_mask] = np.nan
    so[:, :, land_mask] = np.nan
    uo[:, :, land_mask] = np.nan
    vo[:, :, land_mask] = np.nan
    print(f"  Masked {np.sum(land_mask)} land grid cells ({np.sum(land_mask)/(n_lat*n_lon)*100:.1f}% of domain)")
    ds = xr.Dataset(
        {
            'thetao': (['time', 'depth', 'lat', 'lon'], thetao, {
                'standard_name': 'sea_water_potential_temperature',
                'long_name': 'Sea Water Potential Temperature',
                'units': 'degrees_C',
                '_FillValue': np.float32(-9999.0),
            }),
            'so': (['time', 'depth', 'lat', 'lon'], so, {
                'standard_name': 'sea_water_salinity',
                'long_name': 'Sea Water Practical Salinity',
                'units': '1e-3',  # PSU
                '_FillValue': np.float32(-9999.0),
            }),
            'uo': (['time', 'depth', 'lat', 'lon'], uo, {
                'standard_name': 'eastward_sea_water_velocity',
                'long_name': 'Eastward Sea Water Velocity',
                'units': 'm s-1',
                '_FillValue': np.float32(-9999.0),
            }),
            'vo': (['time', 'depth', 'lat', 'lon'], vo, {
                'standard_name': 'northward_sea_water_velocity',
                'long_name': 'Northward Sea Water Velocity',
                'units': 'm s-1',
                '_FillValue': np.float32(-9999.0),
            }),
        },
        coords={
            'time': ('time', time, {
                'standard_name': 'time',
                'long_name': 'Time',
            }),
            'depth': ('depth', depth, {
                'standard_name': 'depth',
                'long_name': 'Depth',
                'units': 'm',
                'positive': 'down',
            }),
            'lat': ('lat', lat, {
                'standard_name': 'latitude',
                'long_name': 'Latitude',
                'units': 'degrees_north',
            }),
            'lon': ('lon', lon, {
                'standard_name': 'longitude',
                'long_name': 'Longitude',
                'units': 'degrees_east',
            }),
        },
        attrs={
            'Conventions': 'CF-1.6',
            'title': 'OCEAN-X Synthetic Bay of Bengal Model Data',
            'institution': 'OCEAN-X Development',
            'source': 'Synthetic data for development and testing',
            'history': f'Generated on {datetime.now().isoformat()}',
            'references': 'Structure mimics Copernicus GLOBAL_MULTIYEAR_PHY_001_030',
            'comment': 'WARNING: This is SYNTHETIC data, not real ocean observations.',
            'region': 'Bay of Bengal (0-25N, 75-100E)',
            # Provenance flags consumed by NetCDFService.get_info() so the UI
            # can honestly distinguish synthetic fixtures from real ingested data.
            'is_synthetic': 'true',
            'source_provenance': 'SYNTHETIC fixture generated by scripts/generate_sample_data.py',
        }
    )
    
    # Save
    os.makedirs(MODEL_DIR, exist_ok=True)
    filepath = os.path.join(MODEL_DIR, 'sample_bob_model.nc')
    ds.to_netcdf(filepath, format='NETCDF4')
    
    # Verify
    verify_ds = xr.open_dataset(filepath)
    print(f"  [OK] Saved to {filepath}")
    print(f"  [OK] Variables: {list(verify_ds.data_vars)}")
    print(f"  [OK] Dimensions: {dict(verify_ds.dims)}")
    print(f"  [OK] Temperature range: {float(verify_ds['thetao'].min()):.1f}°C to {float(verify_ds['thetao'].max()):.1f}°C")
    print(f"  [OK] File size: {os.path.getsize(filepath) / 1024 / 1024:.1f} MB")
    verify_ds.close()
    
    return filepath


def generate_argo_data():
    """
    Generate synthetic Argo float profiles for the Bay of Bengal.
    
    Creates 5 profiles at different locations with realistic
    depth-vs-temperature and depth-vs-salinity profiles.
    """
    print("\nGenerating synthetic Argo profiles...")
    
    # Define 8 float locations across all oceans around India (Arabian Sea, Bay of Bengal, Indian Ocean)
    float_positions = [
        {'platform_id': '2902345', 'lat': 14.50, 'lon': 84.80, 'juld_offset': 0}, # Bay of Bengal (Warm Anomaly)
        {'platform_id': '2903001', 'lat': 18.80, 'lon': 88.50, 'juld_offset': 1}, # North BoB / Odisha
        {'platform_id': '2903456', 'lat': 11.50, 'lon': 93.20, 'juld_offset': 2}, # Andaman Sea
        {'platform_id': '2903123', 'lat': 8.20,  'lon': 83.50, 'juld_offset': 3}, # South BoB / Sri Lanka East
        {'platform_id': '2904001', 'lat': 17.80, 'lon': 68.50, 'juld_offset': 0}, # Arabian Sea Central (Mumbai offshore)
        {'platform_id': '2904002', 'lat': 19.50, 'lon': 64.20, 'juld_offset': 1}, # Arabian Sea West (Oman basin)
        {'platform_id': '2904003', 'lat': 11.20, 'lon': 71.80, 'juld_offset': 2}, # Arabian Sea South (Lakshadweep)
        {'platform_id': '2904004', 'lat': 3.80,  'lon': 76.50, 'juld_offset': 3}, # Equatorial Indian Ocean (Maldives South)
    ]
    
    n_prof = len(float_positions)
    
    # Standard Argo depth levels (pressure in dbar ≈ depth in meters)
    n_levels = 70
    pres_levels = np.concatenate([
        np.arange(0, 100, 5),     # Every 5m in upper 100m
        np.arange(100, 500, 10),  # Every 10m from 100-500m
        np.arange(500, 2050, 50), # Every 50m from 500-2000m
    ])[:n_levels]
    
    # Arrays
    latitude = np.array([f['lat'] for f in float_positions], dtype=np.float64)
    longitude = np.array([f['lon'] for f in float_positions], dtype=np.float64)
    
    # Julian day reference: 1950-01-01
    ref_date = datetime(1950, 1, 1)
    base_date = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    juld = np.array([
        (base_date + timedelta(days=f['juld_offset']) - ref_date).days 
        for f in float_positions
    ], dtype=np.float64)
    
    # Platform numbers as character arrays
    platform_numbers = np.array([
        list(f['platform_id'].ljust(8)) for f in float_positions
    ])
    
    # Generate profiles
    pres = np.zeros((n_prof, n_levels), dtype=np.float32)
    temp = np.zeros((n_prof, n_levels), dtype=np.float32)
    psal = np.zeros((n_prof, n_levels), dtype=np.float32)
    
    # Load model dataset to anchor realistic observations
    model_path = os.path.join(MODEL_DIR, 'sample_bob_model.nc')
    model_ds = xr.open_dataset(model_path, engine='netcdf4')
    m_depths = model_ds['depth'].values

    for i in range(n_prof):
        pres[i] = pres_levels
        f_lat = float_positions[i]['lat']
        f_lon = float_positions[i]['lon']

        # Extract model profiles at float position
        m_temp = model_ds['thetao'].isel(time=0).sel(lat=f_lat, lon=f_lon, method='nearest').values
        m_sal = model_ds['so'].isel(time=0).sel(lat=f_lat, lon=f_lon, method='nearest').values

        # If selected cell is land (NaN), fallback to nearest valid ocean cell
        if np.isnan(m_temp[0]):
            valid_mask = ~np.isnan(model_ds['thetao'].isel(time=0, depth=0).values)
            grid_lat, grid_lon = np.meshgrid(model_ds['lat'].values, model_ds['lon'].values, indexing='ij')
            dists = (grid_lat - f_lat)**2 + (grid_lon - f_lon)**2
            dists[~valid_mask] = 1e9
            best_i, best_j = np.unravel_index(np.argmin(dists), dists.shape)
            m_temp = model_ds['thetao'].isel(time=0, lat=best_i, lon=best_j).values
            m_sal = model_ds['so'].isel(time=0, lat=best_i, lon=best_j).values

        # Interpolate baseline onto observation depths
        base_temp = np.interp(pres_levels, m_depths, m_temp)
        base_sal = np.interp(pres_levels, m_depths, m_sal)

        # Baseline in-situ measurement with realistic instrumentation jitter
        temp[i] = base_temp + np.random.normal(0, 0.12, n_levels).astype(np.float32)
        psal[i] = base_sal + np.random.normal(0, 0.04, n_levels).astype(np.float32)

        # 1. Float 2902345 (Bay of Bengal): Hero Critical Anomaly (Subsurface Marine Heatwave at 80-220m)
        if float_positions[i]['platform_id'] == '2902345':
            mask_anom = (pres_levels >= 80) & (pres_levels <= 220)
            heat_blob = 3.2 * np.exp(-((pres_levels[mask_anom] - 120) ** 2) / (2 * 35**2))
            temp[i][mask_anom] += heat_blob.astype(np.float32)
            psal[i][mask_anom] -= 0.6

        # 2. Float 2904001 (Arabian Sea): Warning Divergence (moderate thermocline offset at 60-130m)
        elif float_positions[i]['platform_id'] == '2904001':
            mask_warn = (pres_levels >= 60) & (pres_levels <= 130)
            warm_shift = 1.5 * np.exp(-((pres_levels[mask_warn] - 90) ** 2) / (2 * 25**2))
            temp[i][mask_warn] += warm_shift.astype(np.float32)

    model_ds.close()

    
    # Create Dataset
    ds = xr.Dataset(
        {
            'LATITUDE': (['N_PROF'], latitude, {
                'standard_name': 'latitude',
                'units': 'degree_north',
            }),
            'LONGITUDE': (['N_PROF'], longitude, {
                'standard_name': 'longitude',
                'units': 'degree_east',
            }),
            'JULD': (['N_PROF'], juld, {
                'standard_name': 'time',
                'units': 'days since 1950-01-01 00:00:00',
                'long_name': 'Julian day',
            }),
            'PLATFORM_NUMBER': (['N_PROF', 'STRING8'], platform_numbers, {
                'long_name': 'Float unique identifier',
            }),
            'PRES': (['N_PROF', 'N_LEVELS'], pres, {
                'standard_name': 'sea_water_pressure',
                'units': 'decibar',
                'long_name': 'Sea water pressure',
                '_FillValue': np.float32(99999.0),
            }),
            'TEMP': (['N_PROF', 'N_LEVELS'], temp, {
                'standard_name': 'sea_water_temperature',
                'units': 'degree_Celsius',
                'long_name': 'Sea water temperature in-situ ITS-90 scale',
                '_FillValue': np.float32(99999.0),
            }),
            'PSAL': (['N_PROF', 'N_LEVELS'], psal, {
                'standard_name': 'sea_water_practical_salinity',
                'units': 'psu',
                'long_name': 'Practical salinity',
                '_FillValue': np.float32(99999.0),
            }),
        },
        attrs={
            'title': 'OCEAN-X Synthetic Argo Profiles',
            'institution': 'OCEAN-X Development',
            'source': 'Synthetic data mimicking Argo GDAC profiles',
            'history': f'Generated on {datetime.now().isoformat()}',
            'comment': 'WARNING: SYNTHETIC DATA. Float 2902345 has an intentional +1.5°C warm anomaly at 80-220m for anomaly detection demo.',
            'references': 'Structure follows Argo Users Manual v3.1',
            'Conventions': 'Argo-3.1 CF-1.6',
            'is_synthetic': 'true',
        }
    )
    
    # Save
    os.makedirs(ARGO_DIR, exist_ok=True)
    filepath = os.path.join(ARGO_DIR, 'sample_argo_profiles.nc')
    ds.to_netcdf(filepath, format='NETCDF4')
    
    # Verify
    verify_ds = xr.open_dataset(filepath)
    print(f"  [OK] Saved to {filepath}")
    print(f"  [OK] Profiles: {verify_ds.dims['N_PROF']}")
    print(f"  [OK] Depth levels per profile: {verify_ds.dims['N_LEVELS']}")
    print(f"  [OK] Lat range: {float(verify_ds['LATITUDE'].min()):.2f} to {float(verify_ds['LATITUDE'].max()):.2f}")
    print(f"  [OK] Lon range: {float(verify_ds['LONGITUDE'].min()):.2f} to {float(verify_ds['LONGITUDE'].max()):.2f}")
    print(f"  [OK] Temp range: {float(verify_ds['TEMP'].min()):.1f}°C to {float(verify_ds['TEMP'].max()):.1f}°C")
    print(f"  [OK] File size: {os.path.getsize(filepath) / 1024:.1f} KB")
    print(f"  ℹ️  Float 2902345 has intentional +1.5°C anomaly at 80-220m depth")
    verify_ds.close()
    
    return filepath


def main():
    print("=" * 60)
    print("OCEAN-X Sample Data Generator")
    print("=" * 60)
    print()
    print("This generates SYNTHETIC data for development.")
    print("    Real data will be swapped in during later phases.")
    print()
    
    model_path = generate_model_data()
    argo_path = generate_argo_data()
    
    print()
    print("=" * 60)
    print("[OK] All sample data generated successfully!")
    print(f"   Model: {model_path}")
    print(f"   Argo:  {argo_path}")
    print("=" * 60)


if __name__ == '__main__':
    main()

