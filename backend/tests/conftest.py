import os

# Tests must never trigger a live network refresh during app startup.
os.environ.setdefault("STARTUP_REFRESH_MAX_AGE_HOURS", "0")
