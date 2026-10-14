"""Pydantic models — mirrored by hand in frontend/src/lib/types.ts."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

ProjectStatus = Literal["pending", "processing", "completed", "failed"]
ClipStatus = Literal["processing", "ready", "error"]
DurationMode = Literal["30", "60", "auto"]


class SignupInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class Profile(BaseModel):
    id: str
    user_id: str
    email: str
    credits: int
    created_at: datetime


class ProjectCreate(BaseModel):
    video_url: str = Field(min_length=8)
    duration_mode: DurationMode = "auto"


class Project(BaseModel):
    id: str
    user_id: str
    video_url: str
    source_type: Literal["youtube", "upload"]
    title: str
    status: ProjectStatus
    stage: str
    progress: int
    duration_mode: DurationMode
    error: Optional[str] = None
    simulated: bool
    clips_count: int = 0
    created_at: datetime


class Clip(BaseModel):
    id: str
    project_id: str
    user_id: str
    title: str
    description: str
    hook: str
    start_time: float
    end_time: float
    viral_score: int
    hashtags: list[str]
    download_url: Optional[str] = None
    preview_url: Optional[str] = None
    source_url: str
    source_type: Literal["youtube", "upload"]
    status: ClipStatus
    error: Optional[str] = None
    simulated: bool
    created_at: datetime


class ProjectActionResult(BaseModel):
    project: Project
    credits: int
    message: str


class KeyStatus(BaseModel):
    service: Literal["assemblyai", "shotstack", "openai"]
    label: str
    env_var: str
    configured: bool
    valid: bool
    mode: Literal["real", "simulation", "emergent"]
    latency_ms: Optional[int] = None
    message: str


class ConnectionsReport(BaseModel):
    keys: list[KeyStatus]
    credits: int
    simulation_active: bool
    checked_at: datetime


class MessageOut(BaseModel):
    message: str
