"""
guide.py — AI Guide chatbot API router.
Provides /api/guide/chat endpoint for the OceanGuideAgent frontend.
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Optional, List
from app.limiter import limiter

router = APIRouter(prefix="/api/guide", tags=["AI Guide"])


class ChatMessageInput(BaseModel):
    sender: str  # 'user' or 'ai'
    text: str


class GuideChatRequest(BaseModel):
    message: str
    context: Optional[dict] = None
    history: Optional[List[ChatMessageInput]] = None


class GuideChatResponse(BaseModel):
    reply: str
    source: str  # 'gemini' or 'fallback'


@router.post("/chat", response_model=GuideChatResponse)
@limiter.limit("5/minute")
async def guide_chat(req: GuideChatRequest, request: Request):
    """Handle a user chat message and return an AI-generated response."""
    guide_service = request.app.state.guide_service

    history_dicts = None
    if req.history:
        history_dicts = [{"sender": m.sender, "text": m.text} for m in req.history]

    reply = await guide_service.chat(
        user_message=req.message,
        context=req.context,
        conversation_history=history_dicts,
    )

    source = "gemini" if guide_service.model else "fallback"
    return GuideChatResponse(reply=reply, source=source)
