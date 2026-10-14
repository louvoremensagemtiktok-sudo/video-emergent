import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from lib.auth import get_current_user
from lib.db import db
from lib.keys import assemblyai_key, shotstack_key
from models.schemas import MessageOut, Project, ProjectActionResult, ProjectCreate
from services import pipeline, providers

router = APIRouter(tags=["projects"])

MAX_UPLOAD_BYTES = 500 * 1024 * 1024
ALLOWED_EXT = {".mp4", ".mov", ".webm", ".mkv", ".m4v"}


async def _credits(user_id: str) -> int:
    doc = await db.profiles.find_one({"user_id": user_id}, {"_id": 0, "credits": 1})
    return doc["credits"] if doc else 0


async def _owned_project(project_id: str, user: dict) -> dict:
    proj = await db.projects.find_one({"id": project_id, "user_id": user["user_id"]}, {"_id": 0})
    if not proj:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    return proj


async def _to_model(proj: dict) -> Project:
    count = await db.clips.count_documents({"project_id": proj["id"]})
    return Project(**proj, clips_count=count)


async def _create_and_start(user: dict, video_url: str, source_type: str, title: str, duration_mode: str) -> ProjectActionResult:
    balance = await pipeline.charge(user["user_id"])
    if balance is None:
        raise HTTPException(status_code=402, detail=f"Créditos insuficientes — são necessários {pipeline.COST}")
    proj = {
        "id": str(uuid.uuid4()), "user_id": user["user_id"], "video_url": video_url,
        "source_type": source_type, "title": title, "status": "pending", "stage": "Na fila", "progress": 5,
        "duration_mode": duration_mode, "error": None, "simulated": not (assemblyai_key() and shotstack_key()),
        "charged": True, "refunded": False, "created_at": pipeline.now(),
    }
    await db.projects.insert_one(dict(proj))
    pipeline.start_pipeline(proj["id"])
    return ProjectActionResult(project=await _to_model(proj), credits=balance,
                               message=f"Processamento iniciado — {pipeline.COST} créditos consumidos")


@router.post("/projects", response_model=ProjectActionResult)
async def create_project(body: ProjectCreate, user: dict = Depends(get_current_user)):
    url = body.video_url.strip()
    if not providers.youtube_id(url):
        raise HTTPException(status_code=400, detail="URL do YouTube inválida")
    title = await providers.youtube_title(url)
    return await _create_and_start(user, url, "youtube", title, body.duration_mode)


@router.post("/projects/upload", response_model=ProjectActionResult)
async def upload_project(
    file: UploadFile = File(...), duration_mode: str = Form("auto"), user: dict = Depends(get_current_user)
):
    if duration_mode not in ("30", "60", "auto"):
        raise HTTPException(status_code=400, detail="Duração inválida")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Formato não suportado (use MP4, MOV, WEBM, MKV)")
    if await _credits(user["user_id"]) < pipeline.COST:
        raise HTTPException(status_code=402, detail=f"Créditos insuficientes — são necessários {pipeline.COST}")
    name = f"{uuid.uuid4()}{ext}"
    dest = pipeline.UPLOAD_DIR / name
    size = 0
    with dest.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="Arquivo maior que 500 MB")
            out.write(chunk)
    title = Path(file.filename or "Vídeo enviado").stem[:120]
    return await _create_and_start(user, f"/api/files/{name}", "upload", title, duration_mode)


@router.get("/projects", response_model=list[Project])
async def list_projects(user: dict = Depends(get_current_user)):
    docs = await db.projects.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [await _to_model(d) for d in docs]


@router.post("/projects/{project_id}/cancel", response_model=ProjectActionResult)
async def cancel_project(project_id: str, user: dict = Depends(get_current_user)):
    proj = await _owned_project(project_id, user)
    if proj["status"] not in ("pending", "processing"):
        raise HTTPException(status_code=400, detail="Este projeto não está em processamento")
    pipeline.cancel_pipeline(project_id)
    await pipeline.fail_project(project_id, "Cancelado pelo usuário — créditos estornados")
    proj = await _owned_project(project_id, user)
    return ProjectActionResult(project=await _to_model(proj), credits=await _credits(user["user_id"]),
                               message="Processamento cancelado e créditos estornados")


@router.post("/projects/{project_id}/retry", response_model=ProjectActionResult)
async def retry_project(project_id: str, user: dict = Depends(get_current_user)):
    proj = await _owned_project(project_id, user)
    if proj["status"] in ("pending", "processing"):
        raise HTTPException(status_code=400, detail="O projeto ainda está em processamento")
    balance = await pipeline.charge(user["user_id"])
    if balance is None:
        raise HTTPException(status_code=402, detail=f"Créditos insuficientes — são necessários {pipeline.COST}")
    await db.clips.delete_many({"project_id": project_id})
    await db.projects.update_one({"id": project_id}, {"$set": {
        "status": "pending", "stage": "Na fila", "progress": 5, "error": None, "error_code": None, "charged": True, "refunded": False,
        "simulated": not (assemblyai_key() and shotstack_key()),
    }})
    pipeline.start_pipeline(project_id)
    proj = await _owned_project(project_id, user)
    return ProjectActionResult(project=await _to_model(proj), credits=balance,
                               message=f"Reprocessando — {pipeline.COST} créditos consumidos")


@router.delete("/projects/{project_id}", response_model=MessageOut)
async def delete_project(project_id: str, user: dict = Depends(get_current_user)):
    proj = await _owned_project(project_id, user)
    if proj["status"] in ("pending", "processing"):
        pipeline.cancel_pipeline(project_id)
        await pipeline.refund(project_id)
    await db.clips.delete_many({"project_id": project_id})
    await db.projects.delete_one({"id": project_id})
    (pipeline.UPLOAD_DIR / pipeline.local_media_name(proj)).unlink(missing_ok=True)
    return MessageOut(message="Projeto excluído")


@router.get("/files/{name}")
async def get_file(name: str):
    path = (pipeline.UPLOAD_DIR / name).resolve()
    if path.parent != pipeline.UPLOAD_DIR.resolve() or not path.is_file():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    return FileResponse(path)
