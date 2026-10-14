"""verify-api-keys: live status of AssemblyAI, Shotstack and OpenAI."""

import asyncio
import time
import uuid

import httpx
from emergentintegrations.llm.chat import LlmChat, UserMessage
from fastapi import APIRouter, Depends

from lib.auth import get_current_user
from lib.keys import assemblyai_key, emergent_key, openai_key, shotstack_env, shotstack_key
from models.schemas import ConnectionsReport, KeyStatus
from services.pipeline import now

router = APIRouter(prefix="/connections", tags=["connections"])


def _ms(t0: float) -> int:
    return int((time.perf_counter() - t0) * 1000)


async def _check_assembly() -> KeyStatus:
    base = dict(service="assemblyai", label="AssemblyAI", env_var="ASSEMBLYAI_API_KEY")
    key = assemblyai_key()
    if not key:
        return KeyStatus(**base, configured=False, valid=False, mode="simulation",
                         message="Chave ausente — transcrição em modo simulação")
    t0 = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get("https://api.assemblyai.com/v2/transcript", params={"limit": 1}, headers={"authorization": key})
        ok = r.status_code == 200
        return KeyStatus(**base, configured=True, valid=ok, mode="real" if ok else "simulation", latency_ms=_ms(t0),
                         message="Conectado" if ok else f"Chave inválida (HTTP {r.status_code})")
    except httpx.HTTPError as exc:
        return KeyStatus(**base, configured=True, valid=False, mode="simulation", message=f"Erro de rede: {exc}")


async def _check_shotstack() -> KeyStatus:
    base = dict(service="shotstack", label="Shotstack", env_var="SHOTSTACK_API_KEY / CHAVE_API_SHOTSTACK")
    key = shotstack_key()
    if not key:
        return KeyStatus(**base, configured=False, valid=False, mode="simulation",
                         message="Chave ausente — renderização em modo simulação")
    t0 = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"https://api.shotstack.io/edit/{shotstack_env()}/render/{uuid.uuid4()}", headers={"x-api-key": key})
        ok = r.status_code not in (401, 403)
        return KeyStatus(**base, configured=True, valid=ok, mode="real" if ok else "simulation", latency_ms=_ms(t0),
                         message=f"Conectado ({shotstack_env()})" if ok else f"Chave inválida (HTTP {r.status_code})")
    except httpx.HTTPError as exc:
        return KeyStatus(**base, configured=True, valid=False, mode="simulation", message=f"Erro de rede: {exc}")


async def _check_openai() -> KeyStatus:
    base = dict(service="openai", label="OpenAI", env_var="OPENAI_API_KEY")
    t0 = time.perf_counter()
    own = openai_key()
    if own:
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {own}"})
            ok = r.status_code == 200
            return KeyStatus(**base, configured=True, valid=ok, mode="real", latency_ms=_ms(t0),
                             message="Conectado (chave própria)" if ok else f"Chave inválida (HTTP {r.status_code})")
        except httpx.HTTPError as exc:
            return KeyStatus(**base, configured=True, valid=False, mode="real", message=f"Erro de rede: {exc}")
    key = emergent_key()
    if not key:
        return KeyStatus(**base, configured=False, valid=False, mode="simulation", message="Nenhuma chave de LLM configurada")
    try:
        chat = LlmChat(api_key=key, session_id=f"ping-{uuid.uuid4()}", system_message="Responda apenas 'ok'.").with_model("openai", "gpt-5-nano")
        await asyncio.wait_for(chat.send_message(UserMessage(text="ping")), timeout=30)
        return KeyStatus(**base, configured=True, valid=True, mode="emergent", latency_ms=_ms(t0),
                         message="Conectado via Chave Universal Emergent")
    except Exception as exc:  # SDK raises heterogeneous errors
        return KeyStatus(**base, configured=True, valid=False, mode="emergent", latency_ms=_ms(t0),
                         message=f"Falha: {str(exc)[:160]}")


@router.get("/verify", response_model=ConnectionsReport)
async def verify_api_keys(user: dict = Depends(get_current_user)):
    keys = list(await asyncio.gather(_check_assembly(), _check_shotstack(), _check_openai()))
    simulation = any(k.mode == "simulation" for k in keys if k.service != "openai")
    return ConnectionsReport(keys=keys, credits=user["credits"], simulation_active=simulation, checked_at=now())
