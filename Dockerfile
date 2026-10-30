

FROM node:20-alpine AS frontend-build

WORKDIR /build

COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ .
RUN npm run build



FROM python:3.11-slim

# ── Production environment defaults ──────────────────────────────
# These ensure the app works out-of-the-box on any cloud platform
# without needing to manually set env vars.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DATA_DIR=/app/data \
    CORS_ORIGINS=* \
    ALLOW_SYNTHETIC_DATA=true \
    DEBUG=false \
    ARGO_ERDDAP_URL=https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats \
    ARGO_DAYS_BACK=21 \
    MODEL_DAYS_BACK=1 \
    MODEL_DAYS_FORWARD=1 \
    DATA_REFRESH_INTERVAL_HOURS=6 \
    STARTUP_REFRESH_MAX_AGE_HOURS=12

# ── Unset vars that cloud platforms may auto-inject ──────────────
# Antideploy/Fly.io sometimes injects DATABASE_URL pointing to
# PostgreSQL, but we only need SQLite. Unsetting prevents crashes.
ENV DATABASE_URL="" \
    REDIS_URL="" \
    COPERNICUS_USERNAME="" \
    COPERNICUS_PASSWORD="" \
    MODEL_PROVIDER="HYCOM" 

WORKDIR /app

# System deps for NetCDF / HDF5
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgdal-dev libhdf5-dev libnetcdf-dev gcc g++ \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend source
COPY backend/app ./app
COPY scripts ./scripts

# Generate sample data at build time (baked into image)
RUN mkdir -p /app/data/model /app/data/argo \
    && python scripts/generate_sample_data.py \
    && (cp -rf /app/backend/data/* /app/data/ 2>/dev/null || true)

# Copy built frontend into a static directory
COPY --from=frontend-build /build/dist /app/static

# Non-root user with a writable home for gunicorn temp files
RUN addgroup --system oceanx && adduser --system --ingroup oceanx --home /home/oceanx oceanx \
    && chown -R oceanx:oceanx /app/data /app/static /home/oceanx
ENV HOME=/home/oceanx
USER oceanx

EXPOSE 8000

# Bind to PORT if provided by the platform (e.g. Fly.io/Antideploy), defaulting to 8000.
# Guard against privileged ports (<1024) which non-root users cannot bind to.
CMD ["sh", "-c", "P=${PORT:-8000}; [ \"$P\" -lt 1024 ] 2>/dev/null && P=8000; exec gunicorn app.main:app -w 1 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$P --timeout 180"]
