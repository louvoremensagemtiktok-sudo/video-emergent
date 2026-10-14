"""process-video pipeline: credits → transcription → viral analysis → render → clips. Refunds on failure."""

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from lib.db import db
from lib.keys import assemblyai_key, public_base_url, shotstack_key
from services import providers
from services.providers import ProviderError

logger = logging.getLogger(__name__)

COST = 3
UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# In-memory task registry so cancel can stop a running job.
_project_tasks: dict[str, asyncio.Task] = {}
_clip_tasks: dict[str, asyncio.Task] = {}


def now() -> datetime:
    return datetime.now(timezone.utc)


async def charge(user_id: str) -> int | None:
    """Atomically take COST credits; None when the balance is insufficient."""
    doc = await db.profiles.find_one_and_update(
        {"user_id": user_id, "credits": {"$gte": COST}}, {"$inc": {"credits": -COST}},
        return_document=True, projection={"_id": 0, "credits": 1},
    )
    return doc["credits"] if doc else None


async def refund(project_id: str) -> bool:
    """Idempotent: only refunds if the project is still marked as charged."""
    proj = await db.projects.find_one_and_update(
        {"id": project_id, "charged": True}, {"$set": {"charged": False, "refunded": True}}
    )
    if not proj:
        return False
    await db.profiles.update_one({"user_id": proj["user_id"]}, {"$inc": {"credits": COST}})
    return True


async def _set(project_id: str, **fields) -> None:
    await db.projects.update_one({"id": project_id}, {"$set": fields})


async def fail_project(project_id: str, reason: str, code: str | None = None) -> None:
    await _set(project_id, status="failed", stage="Falhou", error=reason, error_code=code)
    await db.clips.update_many(
        {"project_id": project_id, "status": "processing"}, {"$set": {"status": "error", "error": reason}}
    )
    await refund(project_id)


def local_media_name(project: dict) -> str:
    if project["source_type"] == "upload":
        return project["video_url"].rsplit("/", 1)[-1]
    return f"yt-{project['id']}.mp4"


async def ensure_local_media(project: dict) -> Path:
    path = UPLOAD_DIR / local_media_name(project)
    if project["source_type"] == "youtube" and not path.is_file():
        await _set(project["id"], stage="Baixando vídeo do YouTube", progress=10)
        await providers.ytdlp_download(project["video_url"], path)
    return path


async def _render_source(project: dict) -> str:
    await ensure_local_media(project)
    return f"{public_base_url()}/api/files/{local_media_name(project)}"


def clip_media_names(clip_id: str) -> tuple[str, str]:
    return f"clip-{clip_id}.mp4", f"thumb-{clip_id}.jpg"


async def localize_clip_media(clip: dict, remote_url: str | None, thumb_source: str | None = None) -> dict:
    """Copy the (24h-temporary) Shotstack render into our storage and build a 9:16 cover image.

    Returns the fields to $set. Failures degrade gracefully (keep the remote URL / no cover)."""
    mp4_name, thumb_name = clip_media_names(clip["id"])
    fields: dict = {}
    local_src: str | None = thumb_source
    if remote_url:
        try:
            await providers.download_file(remote_url, UPLOAD_DIR / mp4_name)
            fields["download_url"] = fields["preview_url"] = f"/api/files/{mp4_name}"
            local_src = str(UPLOAD_DIR / mp4_name)
        except Exception as exc:  # noqa: BLE001 — keep the remote link if the copy fails
            logger.warning("copy render %s failed: %s", clip["id"], exc)
            local_src = local_src or remote_url
    if local_src:
        # Rendered clips start at 0; raw sources need the clip offset. ~1.5s in so captions are on screen.
        at = 1.5 if remote_url else clip["start_time"] + 1.5
        try:
            await providers.make_thumbnail(local_src, UPLOAD_DIR / thumb_name, at)
            fields["thumbnail_url"] = f"/api/files/{thumb_name}"
        except Exception as exc:  # noqa: BLE001
            logger.warning("thumbnail %s failed: %s", clip["id"], exc)
    return fields


async def render_clip(clip: dict, project: dict, src_url: str | None = None) -> None:
    """Render one clip; real Shotstack when a key exists, otherwise simulation."""
    try:
        style = project.get("caption_style") or "hormozi"
        if shotstack_key():
            src = src_url or await _render_source(project)
            url = await providers.shotstack_render(src, clip["start_time"], clip["end_time"], style)
            fields = {"status": "ready", "download_url": url, "preview_url": url, "error": None, "simulated": False,
                      "thumbnail_url": None}
            fields.update(await localize_clip_media(clip, url))
        elif project["source_type"] == "upload":
            base = project["video_url"]
            fields = {"status": "ready", "download_url": base,
                      "preview_url": f"{base}#t={clip['start_time']},{clip['end_time']}", "error": None, "simulated": True,
                      "thumbnail_url": None}
            fields.update(await localize_clip_media(clip, None, str(UPLOAD_DIR / local_media_name(project))))
        else:
            fields = {"status": "ready", "download_url": None, "preview_url": None, "error": None, "simulated": True}
        await db.clips.update_one({"id": clip["id"]}, {"$set": fields})
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.warning("render clip %s failed: %s", clip["id"], exc)
        await db.clips.update_one({"id": clip["id"]}, {"$set": {"status": "error", "error": str(exc)[:300]}})


def delete_clip_media(clip_id: str) -> None:
    for name in clip_media_names(clip_id):
        (UPLOAD_DIR / name).unlink(missing_ok=True)


async def backfill_clip_media() -> None:
    """One-off on boot: copy still-valid Shotstack renders locally and create missing covers."""
    query = {"status": "ready", "$or": [{"thumbnail_url": {"$in": [None, ""]}}, {"thumbnail_url": {"$exists": False}},
                                        {"download_url": {"$regex": "^https?://"}}]}
    async for clip in db.clips.find(query, {"_id": 0}):
        remote = clip.get("download_url") if str(clip.get("download_url") or "").startswith("http") else None
        thumb_src = None
        if not remote and clip.get("source_type") == "upload" and clip.get("download_url"):
            thumb_src = str(UPLOAD_DIR / clip["download_url"].rsplit("/", 1)[-1])
        fields = await localize_clip_media(clip, remote, thumb_src)
        if fields:
            await db.clips.update_one({"id": clip["id"]}, {"$set": fields})
            logger.info("backfilled clip %s: %s", clip["id"], sorted(fields))


async def _pipeline(project_id: str) -> None:
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        return
    try:
        await _set(project_id, status="processing", stage="Preparando mídia", progress=8, error=None, error_code=None)
        timed_text = None
        if assemblyai_key():
            media = await ensure_local_media(project)
            await _set(project_id, stage="Transcrevendo áudio", progress=20)
            data = await providers.assembly_transcribe(file_path=media)
            timed_text = providers.transcript_to_timed_text(data)
            total = (data.get("audio_duration") or 0) or None
        else:
            await asyncio.sleep(1.5)
            total = None

        await _set(project_id, stage="Analisando viralidade com IA", progress=45)
        moments = await providers.analyze_viral_moments(project["title"], timed_text, project["duration_mode"], total)

        await _set(project_id, stage="Renderizando cortes 9:16", progress=70)
        clips = []
        for m in moments:
            clip = {
                "id": str(uuid.uuid4()), "project_id": project_id, "user_id": project["user_id"],
                **m, "download_url": None, "preview_url": None,
                "source_url": project["video_url"], "source_type": project["source_type"],
                "status": "processing", "error": None, "simulated": project["simulated"], "created_at": now(),
            }
            clips.append(clip)
        if clips:
            await db.clips.insert_many([dict(c) for c in clips])

        src = await _render_source(project) if shotstack_key() else None
        await asyncio.gather(*(render_clip(c, project, src) for c in clips))

        ready = await db.clips.count_documents({"project_id": project_id, "status": "ready"})
        if ready == 0:
            await fail_project(project_id, "Renderização falhou para todos os cortes — créditos estornados")
            return
        await _set(project_id, status="completed", stage="Concluído", progress=100)
    except asyncio.CancelledError:
        logger.info("project %s cancelled", project_id)
        raise
    except ProviderError as exc:
        await fail_project(project_id, f"{exc} — créditos estornados", exc.code)
    except Exception as exc:
        logger.exception("pipeline crash %s", project_id)
        await fail_project(project_id, f"Erro inesperado: {str(exc)[:200]} — créditos estornados")
    finally:
        _project_tasks.pop(project_id, None)


def start_pipeline(project_id: str) -> None:
    _project_tasks[project_id] = asyncio.create_task(_pipeline(project_id))


def cancel_pipeline(project_id: str) -> None:
    task = _project_tasks.pop(project_id, None)
    if task:
        task.cancel()


async def _clip_job(clip: dict, project: dict) -> None:
    try:
        await render_clip(clip, project)
    finally:
        _clip_tasks.pop(clip["id"], None)


def start_clip_render(clip: dict, project: dict) -> None:
    _clip_tasks[clip["id"]] = asyncio.create_task(_clip_job(clip, project))


def cancel_clip_render(clip_id: str) -> None:
    task = _clip_tasks.pop(clip_id, None)
    if task:
        task.cancel()


async def recover_stale_jobs() -> None:
    """After a restart, in-flight jobs are gone: fail them and refund."""
    async for p in db.projects.find({"status": {"$in": ["pending", "processing"]}}, {"_id": 0, "id": 1}):
        await fail_project(p["id"], "Processamento interrompido pelo servidor — créditos estornados")
    await db.clips.update_many({"status": "processing"}, {"$set": {"status": "error", "error": "Renderização interrompida"}})
