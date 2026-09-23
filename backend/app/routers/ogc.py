"""Minimal OGC Web Map Service (WMS 1.3.0 / 1.1.1) for GIS interoperability.

Supports GetCapabilities, GetMap (PNG), GetFeatureInfo (JSON) and
GetLegendGraphic for the live layers: temperature, salinity, current speed,
TCHP and model confidence. Tested with QGIS "Add WMS Layer" using the URL
``http://<host>/ogc/wms``.
"""
from __future__ import annotations

import struct
import zlib
from typing import Dict, Tuple, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import Response, JSONResponse

router = APIRouter(prefix="/ogc", tags=["OGC WMS"])

LAYERS = {
    "thetao": {"title": "Sea water temperature", "unit": "degC", "range": (18.0, 31.0), "cmap": "thermal", "depth": True},
    "so": {"title": "Sea water salinity", "unit": "psu", "range": (30.0, 37.0), "cmap": "haline", "depth": True},
    "speed": {"title": "Current speed", "unit": "m/s", "range": (0.0, 1.2), "cmap": "speed", "depth": True},
    "tchp": {"title": "Tropical Cyclone Heat Potential", "unit": "kJ/cm2", "range": (0.0, 150.0), "cmap": "heat", "depth": False},
    "confidence": {"title": "Model confidence vs Argo", "unit": "0-1", "range": (0.0, 1.0), "cmap": "trust", "depth": False},
}
CMAPS = {
    "thermal": [(0, (4, 35, 51)), (0.25, (35, 90, 160)), (0.5, (60, 160, 160)), (0.75, (240, 190, 60)), (1, (200, 30, 30))],
    "haline": [(0, (42, 24, 108)), (0.35, (18, 95, 142)), (0.7, (56, 166, 139)), (1, (253, 238, 153))],
    "speed": [(0, (255, 253, 205)), (0.5, (95, 180, 110)), (1, (22, 60, 50))],
    "heat": [(0, (40, 40, 90)), (0.33, (90, 160, 200)), (0.5, (250, 220, 90)), (0.75, (240, 110, 40)), (1, (150, 10, 30))],
    "trust": [(0, (200, 50, 50)), (0.35, (235, 170, 60)), (0.6, (230, 230, 120)), (1, (40, 160, 90))],
}


def _png(rgba: np.ndarray) -> bytes:
    h, w, _ = rgba.shape
    raw = b"".join(b"\x00" + rgba[r].tobytes() for r in range(h))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


def _colorize(v: np.ndarray, vmin: float, vmax: float, cmap: str) -> np.ndarray:
    stops = CMAPS[cmap]
    xs = np.array([s[0] for s in stops])
    cols = np.array([s[1] for s in stops], dtype=float)
    t = np.clip((v - vmin) / max(vmax - vmin, 1e-9), 0, 1)
    rgba = np.zeros(v.shape + (4,), dtype=np.uint8)
    for k in range(3):
        rgba[..., k] = np.interp(np.nan_to_num(t), xs, cols[:, k]).astype(np.uint8)
    rgba[..., 3] = np.where(np.isfinite(v), 215, 0).astype(np.uint8)
    return rgba


def _params(request: Request) -> Dict[str, str]:
    return {k.upper(): v for k, v in request.query_params.items()}


def _time_index(nc, value: Optional[str]) -> int:
    if not value:
        roles = nc.get_time_roles()
        analysis = [i for i, r in enumerate(roles) if r == "analysis"]
        return analysis[-1] if analysis else 0
    return nc.find_nearest_time_index(value.split("/")[0])


def _grid(request: Request, layer: str, p: Dict[str, str]) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    nc = request.app.state.nc_service
    if not nc.is_loaded:
        raise HTTPException(503, "Model data not loaded")
    ti = _time_index(nc, p.get("TIME"))
    depth = float(p.get("ELEVATION", "0") or 0)
    ds = nc.dataset
    lat_n, lon_n = nc._find_coord("lat", "latitude"), nc._find_coord("lon", "longitude")
    if layer in ("thetao", "so", "speed"):
        if layer == "speed":
            u, meta = nc.get_depth_slice("uo", depth, ti)
            v, _ = nc.get_depth_slice("vo", depth, ti)
            arr = np.sqrt(u.astype(float) ** 2 + v.astype(float) ** 2)
        else:
            arr, meta = nc.get_depth_slice(layer, depth, ti)
        lats = np.linspace(meta["lat_min"], meta["lat_max"], arr.shape[0])
        lons = np.linspace(meta["lon_min"], meta["lon_max"], arr.shape[1])
        return arr.astype(float), lats, lons
    if layer == "tchp":
        from app.services.advisory_service import tchp_grid
        arr, lats, lons = tchp_grid(nc, ti)
        return arr, np.asarray(lats, float), np.asarray(lons, float)
    if layer == "confidence":
        cache = request.app.state.cache_service
        conf = cache.get("confidence_field")
        if conf is None:
            from app.services.model_skill_service import confidence_field
            conf = confidence_field(request.app.state.argo_service, nc)
            cache.set("confidence_field", conf, ttl_seconds=1800)
        m = conf["metadata"]
        arr = np.array([[np.nan if x is None else x for x in row] for row in conf["confidence"]], dtype=float)
        return arr, np.linspace(m["lat_min"], m["lat_max"], m["height"]), np.linspace(m["lon_min"], m["lon_max"], m["width"])
    raise HTTPException(400, f"Unknown layer {layer}")


def _bbox(p: Dict[str, str]) -> Tuple[float, float, float, float]:
    """Return (lat_min, lat_max, lon_min, lon_max) honouring WMS 1.3.0 EPSG:4326 axis order."""
    b = [float(x) for x in p["BBOX"].split(",")]
    version = p.get("VERSION", "1.3.0")
    crs = (p.get("CRS") or p.get("SRS") or "EPSG:4326").upper()
    if version.startswith("1.3") and crs == "EPSG:4326":
        return b[0], b[2], b[1], b[3]
    return b[1], b[3], b[0], b[2]


def _sample(arr, lats, lons, lat_q, lon_q):
    li = np.round((lat_q - lats[0]) / (lats[-1] - lats[0]) * (len(lats) - 1)).astype(int)
    lj = np.round((lon_q - lons[0]) / (lons[-1] - lons[0]) * (len(lons) - 1)).astype(int)
    inside = (li >= 0) & (li < len(lats)) & (lj >= 0) & (lj < len(lons))
    out = np.full(li.shape, np.nan)
    out[inside] = arr[li[inside], lj[inside]]
    return out


@router.get("/wms")
def wms(request: Request):
    p = _params(request)
    req = p.get("REQUEST", "GetCapabilities").lower()
    if req == "getcapabilities":
        return _capabilities(request)
    if req == "getlegendgraphic":
        layer = p.get("LAYER") or p.get("LAYERS", "thetao")
        cfg = LAYERS.get(layer) or LAYERS["thetao"]
        ramp = np.linspace(cfg["range"][1], cfg["range"][0], 200)[:, None].repeat(24, axis=1)
        return Response(_png(_colorize(ramp, *cfg["range"], cfg["cmap"])), media_type="image/png")

    layer = (p.get("LAYERS") or p.get("QUERY_LAYERS") or "thetao").split(",")[0]
    if layer not in LAYERS:
        raise HTTPException(400, f"LayerNotDefined: {layer}")
    width, height = int(p.get("WIDTH", 512)), int(p.get("HEIGHT", 512))
    if not (1 <= width <= 4096 and 1 <= height <= 4096):
        raise HTTPException(400, "WIDTH/HEIGHT out of range")
    lat_min, lat_max, lon_min, lon_max = _bbox(p)
    arr, lats, lons = _grid(request, layer, p)

    if req == "getmap":
        lat_q = np.linspace(lat_max, lat_min, height)[:, None].repeat(width, axis=1)
        lon_q = np.linspace(lon_min, lon_max, width)[None, :].repeat(height, axis=0)
        vals = _sample(arr, lats, lons, lat_q, lon_q)
        cfg = LAYERS[layer]
        return Response(_png(_colorize(vals, *cfg["range"], cfg["cmap"])), media_type="image/png",
                        headers={"Cache-Control": "public, max-age=600"})
    if req == "getfeatureinfo":
        i = int(p.get("I", p.get("X", 0)))
        j = int(p.get("J", p.get("Y", 0)))
        lat = lat_max - (j + 0.5) / height * (lat_max - lat_min)
        lon = lon_min + (i + 0.5) / width * (lon_max - lon_min)
        v = float(_sample(arr, lats, lons, np.array([lat]), np.array([lon]))[0])
        return JSONResponse({"type": "FeatureCollection", "features": [{
            "type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 4), round(lat, 4)]},
            "properties": {"layer": layer, "value": None if not np.isfinite(v) else round(v, 4), "unit": LAYERS[layer]["unit"]}}]})
    raise HTTPException(400, f"OperationNotSupported: {p.get('REQUEST')}")


def _capabilities(request: Request) -> Response:
    nc = request.app.state.nc_service
    base = str(request.base_url).rstrip("/") + "/ogc/wms"
    times, depths = "", ""
    if nc.is_loaded:
        tn = nc._find_coord("time", "t")
        times = ",".join(pd.Timestamp(t).strftime("%Y-%m-%dT%H:%M:%SZ") for t in nc.dataset[tn].values)
        depths = ",".join(f"{float(d):g}" for d in nc.dataset[nc._find_coord('depth', 'lev')].values)
    info = nc.get_info() if nc.is_loaded else {}
    lat_r, lon_r = info.get("lat_range", [0, 28]), info.get("lon_range", [60, 100])
    layers_xml = ""
    for name, cfg in LAYERS.items():
        dims = f'<Dimension name="time" units="ISO8601">{times}</Dimension>'
        if cfg["depth"]:
            dims += f'<Dimension name="elevation" units="m" default="0">{depths}</Dimension>'
        layers_xml += f"""
      <Layer queryable="1" opaque="0"><Name>{name}</Name><Title>{cfg['title']} ({cfg['unit']})</Title>
        <CRS>EPSG:4326</CRS><CRS>CRS:84</CRS>
        <EX_GeographicBoundingBox><westBoundLongitude>{lon_r[0]}</westBoundLongitude><eastBoundLongitude>{lon_r[1]}</eastBoundLongitude><southBoundLatitude>{lat_r[0]}</southBoundLatitude><northBoundLatitude>{lat_r[1]}</northBoundLatitude></EX_GeographicBoundingBox>
        <BoundingBox CRS="EPSG:4326" minx="{lat_r[0]}" miny="{lon_r[0]}" maxx="{lat_r[1]}" maxy="{lon_r[1]}"/>
        {dims}
        <Style><Name>default</Name><Title>default</Title><LegendURL width="24" height="200"><Format>image/png</Format><OnlineResource xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="{base}?REQUEST=GetLegendGraphic&amp;LAYER={name}"/></LegendURL></Style>
      </Layer>"""
    src = (info.get("source_provenance") or "ocean model").replace("&", "&amp;")
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms" xmlns:xlink="http://www.w3.org/1999/xlink">
  <Service><Name>WMS</Name><Title>SAGAR VIEW Ocean WMS</Title>
    <Abstract>Live North Indian Ocean layers from {src} with Argo-verified confidence.</Abstract>
    <OnlineResource xlink:href="{base}"/></Service>
  <Capability>
    <Request>
      <GetCapabilities><Format>text/xml</Format><DCPType><HTTP><Get><OnlineResource xlink:href="{base}?"/></Get></HTTP></DCPType></GetCapabilities>
      <GetMap><Format>image/png</Format><DCPType><HTTP><Get><OnlineResource xlink:href="{base}?"/></Get></HTTP></DCPType></GetMap>
      <GetFeatureInfo><Format>application/json</Format><DCPType><HTTP><Get><OnlineResource xlink:href="{base}?"/></Get></HTTP></DCPType></GetFeatureInfo>
    </Request>
    <Exception><Format>XML</Format></Exception>
    <Layer><Title>SAGAR VIEW</Title><CRS>EPSG:4326</CRS><CRS>CRS:84</CRS>{layers_xml}
    </Layer>
  </Capability>
</WMS_Capabilities>"""
    return Response(xml, media_type="text/xml")
