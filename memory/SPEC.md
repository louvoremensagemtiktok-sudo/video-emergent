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

## Status das integrações (atualizado)
- ASSEMBLYAI_API_KEY e SHOTSTACK_API_KEY configuradas em backend/.env; SHOTSTACK_ENV=v1 (chave de PRODUÇÃO — cada render consome créditos Shotstack).
- YouTube: yt-dlp (+ yt-dlp-ejs, --js-runtimes node) BAIXA o vídeo para backend/uploads/yt-{project_id}.mp4 (URLs googlevideo são presas ao IP do servidor).
  AssemblyAI recebe o arquivo via /v2/upload; Shotstack lê via {APP_URL}/api/files/<arquivo>. APP_URL precisa ser a URL pública.
- Legendas Shotstack: asset type=caption src=alias://main; posição no nível do clip (position=bottom, offset.y=0.15).
- Teste real: vídeo de 3:33 → 5 cortes 720x1280 em ~2min20s.
- yt-dlp: tenta 1º MP4 combinado (formato 18, não exige PO token) e depois DASH vídeo+áudio com merge (ffmpeg via pip imageio-ffmpeg).
  YouTube aplica anti-bot (HTTP 403 / "confirm you're not a bot") a vários vídeos vindos de IP de datacenter → erro amigável + estorno.
  Contornos opcionais em backend/.env: YOUTUBE_COOKIES_FILE=/caminho/cookies.txt (Netscape) e YTDLP_PROXY=http://user:pass@host:porta (proxy residencial).
- Upload local de MP4 testado com APIs reais (5 cortes em ~2min) — é o caminho garantido.
- Project.error_code (Optional["youtube_blocked"]): setado pelo pipeline via ProviderError(code=...), limpo no retry/início.
  Dashboard: projeto com youtube_blocked mostra aviso âmbar + botão "Enviar MP4 em vez disso" (btn-enviar-mp4-em-vez) → aba Upload ativa, scroll até #novo-projeto e pulso (animate-attention) por ~2.4s. Estado da aba elevado para Dashboard.
- FOCO NO UPLOAD (decisão do usuário: sem cookies/proxy do YouTube por enquanto). Aba "Upload de MP4" é a padrão e a primeira; YouTube secundário com aviso de possível bloqueio.
  Upload via XHR (apiUpload com onProgress) → barra/percentual real; validação no cliente (MP4/MOV/WEBM/MKV/M4V, ≤500 MB); drag & drop.
  Ingress público testado com 450 MB OK. Backend grava em streaming e retorna 413 acima de 500 MB.
