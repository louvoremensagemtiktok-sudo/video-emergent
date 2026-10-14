# VIDEOS IA VIRAIS — SPEC
SaaS (pt-BR) que extrai cortes virais 9:16 de vídeos longos (URL YouTube ou upload local).
Stack: FastAPI + MongoDB (substitui Supabase) + React/Vite. Auth: email+senha, cookie httpOnly `vv_session` (JWT).

## Dados (Mongo)
- profiles: id, user_id, email (unique), password_hash, credits (default 50), created_at
- projects: id, user_id, video_url, source_type(youtube|upload), title, status(pending|processing|completed|failed), stage, progress, duration_mode(30|60|auto), error, simulated, charged, refunded, created_at
- clips: id, project_id, user_id, title, description, hook, start_time, end_time, viral_score 0-100, hashtags[], download_url, preview_url, source_url, source_type, status(processing|ready|error), error, simulated, created_at

## Fluxo process-video (services/pipeline.py)
POST /api/projects {video_url, duration_mode} ou POST /api/projects/upload (multipart file, duration_mode)
1) valida URL / créditos >=3 (402 se insuficiente) 2) debita 3 atomicamente 3) AssemblyAI (se ASSEMBLYAI_API_KEY; senão simulação)
4) OpenAI gpt-5.2 via EMERGENT_LLM_KEY (ou OPENAI_API_KEY) — 3-5 cortes 30-60s, nota, gancho, hashtags (REAL)
5) Shotstack (se SHOTSTACK_API_KEY/CHAVE_API_SHOTSTACK; senão simulação: upload → download do original/preview com #t; YouTube → preview embed, sem MP4)
6) clips ready. Falha em qualquer etapa (ou todos renders falham, ou cancelamento, ou restart do servidor) → project failed + estorno idempotente de 3 créditos.
Ações: projeto cancel (estorna) / retry (cobra 3) / delete (estorna se em andamento). Clip: delete, retry (re-render grátis), cancel.
GET /api/connections/verify — status real das 3 chaves (latência, modo real/simulation/emergent).

## Páginas
/login, /register, / (Novo Projeto + projetos recentes + resumo + cortes gerados), /cortes (biblioteca com filtro), /conexoes.
Sem dados mock: tudo do banco, empty states quando vazio.
