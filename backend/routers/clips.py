from fastapi import APIRouter, Depends, HTTPException

from lib.auth import get_current_user
from lib.db import db
from models.schemas import Clip, MessageOut
from services import pipeline

router = APIRouter(prefix="/clips", tags=["clips"])


async def _owned_clip(clip_id: str, user: dict) -> dict:
    clip = await db.clips.find_one({"id": clip_id, "user_id": user["user_id"]}, {"_id": 0})
    if not clip:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    return clip


@router.get("", response_model=list[Clip])
async def list_clips(project_id: str | None = None, user: dict = Depends(get_current_user)):
    query: dict = {"user_id": user["user_id"]}
    if project_id:
        query["project_id"] = project_id
    docs = await db.clips.find(query, {"_id": 0}).sort([("created_at", -1), ("viral_score", -1)]).to_list(500)
    return [Clip(**d) for d in docs]


@router.delete("/{clip_id}", response_model=MessageOut)
async def delete_clip(clip_id: str, user: dict = Depends(get_current_user)):
    await _owned_clip(clip_id, user)
    pipeline.cancel_clip_render(clip_id)
    await db.clips.delete_one({"id": clip_id})
    pipeline.delete_clip_media(clip_id)
    return MessageOut(message="Corte excluído")


@router.post("/{clip_id}/retry", response_model=Clip)
async def retry_clip(clip_id: str, user: dict = Depends(get_current_user)):
    """Re-render a single clip (free — the project was already charged)."""
    clip = await _owned_clip(clip_id, user)
    if clip["status"] == "processing":
        raise HTTPException(status_code=400, detail="O corte já está em processamento")
    project = await db.projects.find_one({"id": clip["project_id"]}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Projeto de origem não encontrado")
    if project["status"] in ("pending", "processing"):
        raise HTTPException(status_code=400, detail="O projeto ainda está em processamento")
    await db.clips.update_one({"id": clip_id}, {"$set": {"status": "processing", "error": None}})
    clip["status"] = "processing"
    pipeline.start_clip_render(clip, project)
    return Clip(**{**clip, "error": None})


@router.post("/{clip_id}/cancel", response_model=Clip)
async def cancel_clip(clip_id: str, user: dict = Depends(get_current_user)):
    clip = await _owned_clip(clip_id, user)
    if clip["status"] != "processing":
        raise HTTPException(status_code=400, detail="Este corte não está em processamento")
    pipeline.cancel_clip_render(clip_id)
    await db.clips.update_one({"id": clip_id}, {"$set": {"status": "error", "error": "Cancelado pelo usuário"}})
    return Clip(**{**clip, "status": "error", "error": "Cancelado pelo usuário"})
