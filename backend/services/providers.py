"""External providers: yt-dlp, AssemblyAI, OpenAI (via emergentintegrations), Shotstack."""

import asyncio
import json
import logging
import os
import re
import sys
import uuid
from pathlib import Path

import httpx
from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage

from lib.keys import assemblyai_key, llm_key, shotstack_env, shotstack_key

logger = logging.getLogger(__name__)

ASSEMBLY_BASE = "https://api.assemblyai.com/v2"
LLM_MODEL = "gpt-5.2"


class ProviderError(Exception):
    """Raised when an external step fails — triggers the credit refund. `code` lets the UI react (e.g. youtube_blocked)."""

    def __init__(self, message: str, code: str | None = None):
        super().__init__(message)
        self.code = code


# ---------- YouTube helpers ----------

YT_RE = re.compile(r"(youtube\.com/(watch\?v=|shorts/|embed/|live/)|youtu\.be/)([\w-]{11})")


def youtube_id(url: str) -> str | None:
    m = YT_RE.search(url)
    return m.group(3) if m else None


async def youtube_title(url: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get("https://www.youtube.com/oembed", params={"url": url, "format": "json"})
            if r.status_code == 200:
                return r.json().get("title") or "Vídeo do YouTube"
    except httpx.HTTPError:
        pass
    return "Vídeo do YouTube"


# YouTube often serves only split video/audio streams (no muxed mp4), so we merge with a pip-bundled ffmpeg.
# Try muxed mp4 first (no PO token needed), then split DASH video+audio merged with ffmpeg.
# yt-dlp does not fall back to the next format when a download 403s, so we loop ourselves.
YT_FORMATS = (
    "b[ext=mp4][height<=720]/b[ext=mp4]",
    "bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=720]+ba",
)


def _ffmpeg_exe() -> str:
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def _ytdlp_auth_args() -> list[str]:
    """Optional anti-bot workarounds: YOUTUBE_COOKIES_FILE (Netscape cookies.txt) and YTDLP_PROXY."""
    args: list[str] = []
    cookies = os.environ.get("YOUTUBE_COOKIES_FILE", "").strip()
    if cookies and Path(cookies).is_file():
        args += ["--cookies", cookies]
    proxy = os.environ.get("YTDLP_PROXY", "").strip()
    if proxy:
        args += ["--proxy", proxy]
    return args


YT_BLOCKED_MSG = (
    "O YouTube bloqueou o download deste vídeo a partir do servidor (proteção anti-bot). "
    "Envie o arquivo MP4 pela aba Upload ou tente outro link."
)


def _ytdlp_error(err: bytes) -> ProviderError:
    text = err.decode(errors="ignore")
    if re.search(r"HTTP Error 403|not a bot|Sign in to confirm|ffmpeg exited", text):
        return ProviderError(YT_BLOCKED_MSG, code="youtube_blocked")
    if "Requested format is not available" in text:
        return ProviderError("Nenhum formato de vídeo disponível para este link do YouTube.")
    if re.search(r"Private video|Video unavailable|members-only|age", text, re.I):
        return ProviderError("Este vídeo do YouTube é privado, restrito ou indisponível.")
    lines = text.strip().splitlines()
    return ProviderError(f"Não foi possível baixar o vídeo do YouTube: {(lines[-1] if lines else 'erro desconhecido')[:200]}")


async def ytdlp_download(url: str, dest: Path) -> Path:
    """Download the video locally (googlevideo URLs are IP-bound, so providers can't fetch them)."""
    err = b""
    for fmt in YT_FORMATS:
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "yt_dlp", "--js-runtimes", "node", "--no-playlist", *_ytdlp_auth_args(),
            "-f", fmt, "--merge-output-format", "mp4", "--ffmpeg-location", _ffmpeg_exe(),
            "--max-filesize", "2G", "--abort-on-unavailable-fragments", "-o", str(dest), url,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        _, err = await asyncio.wait_for(proc.communicate(), timeout=1800)
        if proc.returncode == 0 and dest.is_file():
            return dest
        logger.warning("yt-dlp format %s failed: %s", fmt, err.decode(errors="ignore")[-300:])
        for leftover in dest.parent.glob(f"{dest.stem}*"):
            leftover.unlink(missing_ok=True)
    raise _ytdlp_error(err)


async def ytdlp_direct_url(url: str, fmt: str) -> str:
    proc = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "yt_dlp", "--js-runtimes", "node", "-g", "-f", fmt, "--no-playlist", url,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    out, err = await asyncio.wait_for(proc.communicate(), timeout=90)
    if proc.returncode != 0 or not out.strip():
        raise ProviderError(f"Não foi possível obter a mídia do YouTube: {err.decode()[-200:]}")
    return out.decode().strip().splitlines()[0]


# ---------- AssemblyAI ----------

async def assembly_transcribe(audio_url: str | None = None, file_path: Path | None = None) -> dict:
    headers = {"authorization": assemblyai_key()}
    async with httpx.AsyncClient(timeout=120) as client:
        if file_path is not None:
            async def chunks():
                with file_path.open("rb") as fh:
                    while chunk := fh.read(5 * 1024 * 1024):
                        yield chunk

            up = await client.post(f"{ASSEMBLY_BASE}/upload", headers=headers, content=chunks(),
                                   timeout=httpx.Timeout(120, write=1800))
            if up.status_code != 200:
                raise ProviderError(f"AssemblyAI upload falhou ({up.status_code})")
            audio_url = up.json()["upload_url"]
        r = await client.post(f"{ASSEMBLY_BASE}/transcript", headers=headers,
                              json={"audio_url": audio_url, "language_detection": True})
        if r.status_code != 200:
            raise ProviderError(f"AssemblyAI recusou a transcrição ({r.status_code}): {r.text[:200]}")
        tid = r.json()["id"]
        for _ in range(240):  # up to ~20 min
            await asyncio.sleep(5)
            p = await client.get(f"{ASSEMBLY_BASE}/transcript/{tid}", headers=headers)
            data = p.json()
            if data.get("status") == "completed":
                return data
            if data.get("status") == "error":
                raise ProviderError(f"AssemblyAI erro: {data.get('error')}")
    raise ProviderError("AssemblyAI: tempo de transcrição excedido")


def transcript_to_timed_text(data: dict, max_chars: int = 150000) -> str:
    """Group words into ~10s lines '[start-end] text' for the LLM."""
    words = data.get("words") or []
    lines, buf, start = [], [], None
    for w in words:
        start = w["start"] if start is None else start
        buf.append(w["text"])
        if w["end"] - start >= 10000:
            lines.append(f"[{start / 1000:.1f}-{w['end'] / 1000:.1f}] {' '.join(buf)}")
            buf, start = [], None
    if buf and words:
        lines.append(f"[{start / 1000:.1f}-{words[-1]['end'] / 1000:.1f}] {' '.join(buf)}")
    return "\n".join(lines)[:max_chars] or (data.get("text") or "")[:max_chars]


# ---------- OpenAI (viral analysis) ----------

SYSTEM_PROMPT = (
    "Você é um estrategista de conteúdo viral para TikTok, Reels e Shorts. "
    "Responda SOMENTE com JSON válido, sem markdown."
)


def _duration_rule(mode: str) -> str:
    if mode == "30":
        return "Cada corte deve durar cerca de 30 segundos (entre 28 e 35s)."
    if mode == "60":
        return "Cada corte deve durar cerca de 60 segundos (entre 50 e 60s)."
    return "Cada corte deve durar entre 30 e 60 segundos."


async def analyze_viral_moments(title: str, timed_text: str | None, duration_mode: str, total_seconds: float | None) -> list[dict]:
    if timed_text:
        context = f"Transcrição com marcações de tempo (segundos):\n{timed_text}"
    else:
        context = (
            "Não há transcrição disponível (modo simulação). Com base apenas no título, proponha "
            f"momentos plausíveis distribuídos nos primeiros {int(total_seconds or 600)} segundos do vídeo."
        )
    prompt = (
        f"Título do vídeo: {title}\n{context}\n\n"
        f"Identifique de 3 a 5 melhores momentos para cortes virais. {_duration_rule(duration_mode)}\n"
        'Formato: {"clips":[{"start":number,"end":number,"title":"título magnético em pt-BR",'
        '"description":"descrição curta","hook":"frase de gancho para os 3 primeiros segundos",'
        '"viral_score":0-100,"hashtags":["#tag",...5 a 8]}]}'
    )
    key = llm_key()
    if not key:
        raise ProviderError("Nenhuma chave de LLM configurada")
    chat = LlmChat(api_key=key, session_id=f"viral-{uuid.uuid4()}", system_message=SYSTEM_PROMPT).with_model("openai", LLM_MODEL)
    text = ""
    try:
        async for ev in chat.stream_message(UserMessage(text=prompt)):
            if isinstance(ev, TextDelta):
                text += ev.content
            elif isinstance(ev, StreamDone):
                break
    except Exception as exc:  # provider SDK raises heterogeneous errors
        raise ProviderError(f"OpenAI falhou: {exc}") from exc
    return _parse_clips(text, duration_mode)


def _parse_clips(text: str, duration_mode: str) -> list[dict]:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ProviderError("OpenAI retornou resposta inválida")
    try:
        raw = json.loads(m.group(0)).get("clips", [])
    except json.JSONDecodeError as exc:
        raise ProviderError("OpenAI retornou JSON inválido") from exc
    max_len = 35 if duration_mode == "30" else 60
    clips = []
    for c in raw[:5]:
        try:
            start = max(0.0, float(c["start"]))
            end = float(c["end"])
        except (KeyError, TypeError, ValueError):
            continue
        if end - start < 15:
            end = start + (30 if duration_mode != "60" else 55)
        end = min(end, start + max_len)
        tags = [t if str(t).startswith("#") else f"#{t}" for t in (c.get("hashtags") or [])][:8]
        clips.append({
            "start_time": round(start, 1), "end_time": round(end, 1),
            "title": str(c.get("title") or "Corte viral")[:140],
            "description": str(c.get("description") or "")[:400],
            "hook": str(c.get("hook") or "")[:200],
            "viral_score": max(0, min(100, int(c.get("viral_score") or 50))),
            "hashtags": [str(t) for t in tags],
        })
    if len(clips) < 1:
        raise ProviderError("OpenAI não encontrou momentos virais")
    return clips


# ---------- Shotstack ----------

def _shotstack_base() -> str:
    return f"https://api.shotstack.io/edit/{shotstack_env()}"


# Caption presets (Shotstack rich-caption, built-in Montserrat). Output is 720x1280 (9:16 "hd").
CAPTION_STYLES: dict[str, dict] = {
    # Hormozi: big uppercase, heavy stroke, the spoken word pops in yellow.
    "hormozi": {
        "asset": {
            "font": {"family": "Montserrat", "size": 62, "weight": 900, "color": "#FFFFFF"},
            "style": {"textTransform": "uppercase", "lineHeight": 1.1},
            "stroke": {"width": 6, "color": "#000000", "opacity": 1},
            "shadow": {"offsetX": 0, "offsetY": 4, "blur": 10, "color": "#000000", "opacity": 0.6},
            "active": {"font": {"color": "#FACC15"}},
            "animation": {"style": "pop"},
        },
        "clip": {"width": 640, "height": 320, "position": "center", "offset": {"y": -0.2}},
    },
    # Minimal: clean sentence-case text with a soft shadow near the bottom.
    "minimal": {
        "asset": {
            "font": {"family": "Montserrat", "size": 38, "weight": 600, "color": "#FFFFFF"},
            "shadow": {"offsetX": 0, "offsetY": 2, "blur": 8, "color": "#000000", "opacity": 0.75},
            "align": {"vertical": "bottom"},
            "animation": {"style": "fade"},
        },
        "clip": {"width": 620, "height": 240, "position": "bottom", "offset": {"y": 0.08}},
    },
}


def _caption_clip(style: str) -> dict:
    preset = CAPTION_STYLES.get(style, CAPTION_STYLES["hormozi"])
    return {"asset": {"type": "rich-caption", "src": "alias://main", **preset["asset"]},
            "start": 0, "length": "end", **preset["clip"]}


def shotstack_payload(src_url: str, start: float, end: float, style: str) -> dict:
    return {
        "timeline": {
            "background": "#000000",
            "tracks": [
                {"clips": [_caption_clip(style)]},
                {"clips": [{"alias": "main", "asset": {"type": "video", "src": src_url, "trim": start},
                            "start": 0, "length": round(end - start, 2), "fit": "crop"}]},
            ],
        },
        "output": {"format": "mp4", "aspectRatio": "9:16", "resolution": "hd"},
    }


async def shotstack_render(src_url: str, start: float, end: float, style: str = "hormozi") -> str:
    """Render and return the temporary output URL (deleted by Shotstack after 24h — copy it right away)."""
    payload = shotstack_payload(src_url, start, end, style)
    headers = {"x-api-key": shotstack_key(), "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(f"{_shotstack_base()}/render", headers=headers, json=payload)
        if r.status_code not in (200, 201):
            raise ProviderError(f"Shotstack recusou o render ({r.status_code}): {r.text[:200]}")
        rid = r.json()["response"]["id"]
        for _ in range(180):  # up to ~15 min
            await asyncio.sleep(5)
            s = await client.get(f"{_shotstack_base()}/render/{rid}", headers=headers)
            resp = s.json().get("response", {})
            if resp.get("status") == "done" and resp.get("url"):
                return resp["url"]
            if resp.get("status") == "failed":
                raise ProviderError(f"Shotstack falhou: {resp.get('error')}")
    raise ProviderError("Shotstack: tempo de renderização excedido")


# ---------- Local media helpers (copy renders, thumbnails) ----------

async def download_file(url: str, dest: Path) -> Path:
    tmp = dest.with_suffix(dest.suffix + ".part")
    async with httpx.AsyncClient(timeout=httpx.Timeout(30, read=300)) as client:
        async with client.stream("GET", url) as r:
            if r.status_code != 200:
                raise ProviderError(f"Download do render falhou ({r.status_code})")
            with tmp.open("wb") as fh:
                async for chunk in r.aiter_bytes(1024 * 1024):
                    fh.write(chunk)
    tmp.replace(dest)
    return dest


async def make_thumbnail(src: str, dest: Path, at: float) -> Path:
    """Grab one frame (center-cropped to 9:16 if the source is wider) as a small JPEG."""
    proc = await asyncio.create_subprocess_exec(
        _ffmpeg_exe(), "-v", "error", "-y", "-ss", f"{max(0.0, at):.2f}", "-i", src, "-frames:v", "1",
        "-vf", "crop='min(iw,ih*9/16)':ih,scale=360:-2", "-q:v", "4", str(dest),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    _, err = await asyncio.wait_for(proc.communicate(), timeout=120)
    if proc.returncode != 0 or not dest.is_file():
        raise ProviderError(f"Falha ao gerar capa: {err.decode(errors='ignore')[-200:]}")
    return dest
