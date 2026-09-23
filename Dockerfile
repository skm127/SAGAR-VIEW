

FROM node:20-alpine AS frontend-build

WORKDIR /build

COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ .
RUN npm run build



FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DATA_DIR=/app/data

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
    && python scripts/generate_sample_data.py

# Copy built frontend into a static directory
COPY --from=frontend-build /build/dist /app/static

# Non-root user
RUN addgroup --system oceanx && adduser --system --ingroup oceanx oceanx \
    && chown -R oceanx:oceanx /app/data /app/static
USER oceanx

EXPOSE 8000

# One async Uvicorn worker: each worker would otherwise run its own startup
# ingestion and 6-hourly scheduler and hold its own copy of the model in memory.
CMD ["gunicorn", "app.main:app", "-w", "1", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000", "--timeout", "180"]
