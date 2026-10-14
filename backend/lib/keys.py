"""Read API keys at call time (supports the CHAVE_API_SHOTSTACK alias)."""

import os


def assemblyai_key() -> str:
    return os.environ.get("ASSEMBLYAI_API_KEY", "").strip()


def shotstack_key() -> str:
    return (os.environ.get("SHOTSTACK_API_KEY", "") or os.environ.get("CHAVE_API_SHOTSTACK", "")).strip()


def shotstack_env() -> str:
    return os.environ.get("SHOTSTACK_ENV", "stage").strip() or "stage"


def openai_key() -> str:
    return os.environ.get("OPENAI_API_KEY", "").strip()


def emergent_key() -> str:
    return os.environ.get("EMERGENT_LLM_KEY", "").strip()


def llm_key() -> str:
    """Own OpenAI key wins; otherwise the Emergent universal key."""
    return openai_key() or emergent_key()


def public_base_url() -> str:
    return os.environ.get("APP_URL", "").rstrip("/")
