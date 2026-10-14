import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from pymongo.errors import DuplicateKeyError

from lib.auth import clear_session_cookie, get_current_user, hash_password, set_session_cookie, verify_password
from lib.db import db
from models.schemas import LoginInput, MessageOut, Profile, SignupInput
from services.pipeline import now

router = APIRouter(prefix="/auth", tags=["auth"])

INITIAL_CREDITS = 50


@router.post("/signup", response_model=Profile)
async def signup(body: SignupInput, response: Response):
    email = body.email.lower()
    if await db.profiles.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="E-mail já cadastrado")
    profile = {
        "id": str(uuid.uuid4()), "user_id": str(uuid.uuid4()), "email": email,
        "password_hash": hash_password(body.password), "credits": INITIAL_CREDITS, "created_at": now(),
    }
    try:
        await db.profiles.insert_one(dict(profile))
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="E-mail já cadastrado")
    set_session_cookie(response, profile["user_id"])
    return Profile(**profile)


@router.post("/login", response_model=Profile)
async def login(body: LoginInput, response: Response):
    user = await db.profiles.find_one({"email": body.email.lower()}, {"_id": 0})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos")
    set_session_cookie(response, user["user_id"])
    return Profile(**user)


@router.post("/logout", response_model=MessageOut)
async def logout(response: Response):
    clear_session_cookie(response)
    return MessageOut(message="ok")


@router.get("/me", response_model=Profile)
async def me(user: dict = Depends(get_current_user)):
    return Profile(**user)
