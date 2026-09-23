FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install system dependencies for NetCDF/GDAL
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgdal-dev \
    libhdf5-dev \
    libnetcdf-dev \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app

RUN addgroup --system oceanx && adduser --system --ingroup oceanx oceanx
USER oceanx

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
