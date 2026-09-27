from fastapi import APIRouter
from pydantic import BaseModel
from typing import List

router = APIRouter(prefix="/api/mobile", tags=["Mobile"])

class DeviceRegistration(BaseModel):
    push_token: str
    device_id: str

class RegionSubscription(BaseModel):
    region: str
    minSeverity: str

@router.post("/register-device")
async def register_device(registration: DeviceRegistration):
    # In a real app, store in DB
    return {"status": "registered", "device_id": registration.device_id}

@router.get("/subscriptions")
async def get_subscriptions():
    return [{"region": "bay_of_bengal", "minSeverity": "CRITICAL_ANOMALY"}]

@router.put("/subscriptions")
async def update_subscriptions(subscriptions: List[RegionSubscription]):
    return {"status": "updated", "subscriptions": subscriptions}
