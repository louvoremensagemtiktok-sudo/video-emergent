import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { CircleAlert, Coins, FileVideo, Link2, Loader2, ShieldCheck, Upload, Wand2, X } from "lucide-react";
import { useCreateProject, useMe, useUploadProject, type UploadProgress } from "@/lib/hooks";
import type { CaptionStyle, DurationMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const COST = 3;
const MAX_BYTES = 500 * 1024 * 1024;
const ALLOWED_EXT = [".mp4", ".mov", ".webm", ".mkv", ".m4v"];
const DURATIONS: { value: DurationMode; label: string }[] = [
  { value: "30", label: "30s" },
  { value: "60", label: "60s" },
  { value: "auto", label: "Automático" },
];
const CAPTION_STYLES: { value: CaptionStyle; label: string; hint: string }[] = [
  { value: "hormozi", label: "Hormozi", hint: "Maiúsculas, palavra falada em amarelo" },
  { value: "minimal", label: "Minimalista", hint: "Texto limpo, discreto no rodapé" },
];

function CaptionSample({ style }: { style: CaptionStyle }) {
  if (style === "hormozi") {
    return (
      <span className="font-heading text-[15px] font-black uppercase leading-none tracking-tight text-white [paint-order:stroke] [-webkit-text-stroke:3px_#000]">
        Isso muda <span className="inline-block animate-caption-pop text-[#FACC15]">tudo</span>
      </span>
    );
  }
  return <span className="text-[13px] font-semibold text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.8)]">Isso muda tudo</span>;
}

const YT_RE = /(youtube\.com\/(watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)[\w-]{11}/;

export type ImportSource = "youtube" | "upload";

const SOURCES: { value: ImportSource; label: string; icon: typeof Upload }[] = [
  { value: "upload", label: "Upload de MP4", icon: Upload },
  { value: "youtube", label: "URL do YouTube", icon: Link2 },
];

interface ImportProjectCardProps {
  source: ImportSource;
  onSourceChange: (s: ImportSource) => void;
  /** Pulses the card/dropzone when the user is sent here from a blocked YouTube project. */
  highlight?: boolean;
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function validateFile(f: File): string | null {
  const name = f.name.toLowerCase();
  if (!ALLOWED_EXT.some((ext) => name.endsWith(ext))) return "Formato não suportado — use MP4, MOV, WEBM, MKV ou M4V.";
  if (f.size > MAX_BYTES) return `Arquivo com ${formatBytes(f.size)} — o limite é 500 MB.`;
  if (f.size === 0) return "O arquivo está vazio.";
  return null;
}

export function ImportProjectCard({ source, onSourceChange, highlight = false }: ImportProjectCardProps) {
  const me = useMe();
  const createProject = useCreateProject();
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const uploadProject = useUploadProject(setProgress);
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [duration, setDuration] = useState<DurationMode>("auto");
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>("hormozi");
  const fileRef = useRef<HTMLInputElement>(null);

  const credits = me.data?.credits;
  const enough = credits === undefined || credits >= COST;
  const uploading = uploadProject.isPending;
  const pending = createProject.isPending || uploading;
  const urlValid = YT_RE.test(url.trim());
  const canSubmit = enough && !pending && (source === "youtube" ? urlValid : !!file && !fileError);
  const pct = progress && progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0;

  const pickFile = (f: File | null) => {
    setFile(f);
    setFileError(f ? validateFile(f) : null);
  };

  const clearFile = () => {
    pickFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (uploading) return;
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (source === "youtube") {
      createProject.mutate({ video_url: url.trim(), duration_mode: duration, caption_style: captionStyle }, { onSuccess: () => setUrl("") });
    } else if (file) {
      setProgress({ loaded: 0, total: file.size });
      uploadProject.mutate(
        { file, duration_mode: duration, caption_style: captionStyle },
        {
          onSuccess: clearFile,
          onSettled: () => setProgress(null),
        },
      );
    }
  };

  return (
    <section
      id="novo-projeto"
      data-testid="import-project-card"
      data-highlight={highlight || undefined}
      className="relative mx-auto w-full max-w-4xl scroll-mt-24 overflow-hidden rounded-2xl border border-slate-800 bg-[linear-gradient(135deg,rgba(11,15,23,0.95)_0%,rgba(17,24,39,0.92)_100%)] p-5 shadow-[0_20px_60px_-20px_rgba(2,132,199,0.35)] transition-shadow duration-500 data-[highlight]:animate-attention sm:p-7"
    >
      <div className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">Novo Projeto</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Transforme vídeos longos em cortes virais</h1>
        </div>
        <div className="flex rounded-xl border border-slate-800 bg-slate-900/80 p-1" role="tablist">
          {SOURCES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={source === value}
              data-testid={`tab-source-${value}`}
              disabled={uploading}
              onClick={() => onSourceChange(value)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 transition-colors duration-200 disabled:opacity-50",
                source === value && "bg-sky-600 text-white",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="relative mt-5 space-y-4">
        {source === "upload" ? (
          <div className="space-y-1.5">
            <div
              data-testid="upload-dropzone"
              role="button"
              tabIndex={0}
              aria-disabled={uploading}
              onClick={() => !uploading && fileRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !uploading && fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                if (!uploading) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "relative flex min-h-24 cursor-pointer items-center gap-4 overflow-hidden rounded-xl border border-dashed px-4 py-4 text-sm transition-[border-color,background-color] duration-200",
                dragging || highlight ? "border-sky-400 bg-sky-950/40" : "border-slate-700 bg-slate-950/70 hover:border-sky-500",
                fileError && "border-rose-500/70",
                uploading && "cursor-default",
              )}
            >
              <div className={cn("grid size-12 shrink-0 place-items-center rounded-xl transition-colors duration-200", file ? "bg-sky-600/20" : "bg-slate-800")}>
                {file ? <FileVideo className="size-6 text-sky-300" /> : <Upload className="size-6 text-sky-400" />}
              </div>
              <div className="min-w-0 flex-1">
                {file ? (
                  <>
                    <p data-testid="upload-file-name" className="truncate font-medium text-slate-100">{file.name}</p>
                    <p data-testid="upload-file-size" className="text-xs text-slate-400">{formatBytes(file.size)}</p>
                  </>
                ) : (
                  <>
                    <p data-testid="upload-file-name" className="font-medium text-slate-200">
                      {dragging ? "Solte o vídeo aqui" : "Arraste seu vídeo aqui ou clique para escolher"}
                    </p>
                    <p className="text-xs text-slate-500">MP4, MOV, WEBM, MKV ou M4V • até 500 MB</p>
                  </>
                )}
              </div>
              {file && !uploading && (
                <button
                  type="button"
                  data-testid="btn-remove-file"
                  aria-label="Remover arquivo"
                  className="rounded-md p-1 text-slate-400 transition-colors duration-200 hover:bg-slate-800 hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFile();
                  }}
                >
                  <X className="size-4" />
                </button>
              )}
              {uploading && (
                <div className="absolute inset-x-0 bottom-0 h-1 bg-slate-800">
                  <div
                    data-testid="upload-progress-bar"
                    className="h-full bg-sky-400 transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept={ALLOWED_EXT.join(",") + ",video/*"}
                hidden
                data-testid="input-upload-file"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {fileError && (
              <p data-testid="upload-file-error" className="flex items-center gap-1.5 text-xs text-rose-400">
                <CircleAlert className="size-3.5" /> {fileError}
              </p>
            )}
            {uploading && progress && (
              <p data-testid="upload-progress-text" className="text-xs text-sky-300">
                {pct < 100
                  ? `Enviando ${pct}% • ${formatBytes(progress.loaded)} de ${formatBytes(progress.total)}`
                  : "Upload concluído — iniciando o processamento…"}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Input
              data-testid="input-youtube-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Cole aqui o link do YouTube — ex: https://www.youtube.com/watch?v=..."
              className="h-12 rounded-xl bg-slate-950/70 text-base"
            />
            {url && !urlValid ? (
              <p data-testid="url-validation-error" className="text-xs text-rose-400">
                Informe uma URL válida do YouTube (watch, shorts ou youtu.be).
              </p>
            ) : (
              <p data-testid="youtube-block-hint" className="text-xs text-slate-500">
                Alguns vídeos são bloqueados pelo YouTube para download em servidores. Se acontecer, os créditos voltam e você pode enviar o MP4.
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Estilo da legenda</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Estilo da legenda">
            {CAPTION_STYLES.map((c) => {
              const selected = captionStyle === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-testid={`caption-style-${c.value}`}
                  onClick={() => setCaptionStyle(c.value)}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl border p-2 text-left transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5",
                    selected ? "border-sky-500 bg-sky-950/40" : "border-slate-800 bg-slate-900/60 hover:border-slate-600",
                  )}
                >
                  <div className="grid h-14 w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-[linear-gradient(160deg,#334155_0%,#0f172a_100%)] px-1 text-center">
                    <CaptionSample style={c.value} />
                  </div>
                  <div className="min-w-0">
                    <p className={cn("text-sm font-semibold", selected ? "text-white" : "text-slate-200")}>{c.label}</p>
                    <p className="text-xs text-slate-400">{c.hint}</p>
                  </div>
                  <span
                    aria-hidden
                    className={cn(
                      "ml-auto size-4 shrink-0 rounded-full border-2 transition-colors duration-200",
                      selected ? "border-sky-400 bg-sky-400 shadow-[inset_0_0_0_3px_#0b1220]" : "border-slate-600",
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Duração</span>
            <div className="flex rounded-xl border border-slate-800 bg-slate-900/80 p-1">
              {DURATIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  data-testid={`duration-${d.value}`}
                  aria-pressed={duration === d.value}
                  onClick={() => setDuration(d.value)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 transition-colors duration-200",
                    duration === d.value && "bg-slate-700 text-white",
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div
            data-testid="inline-credit-notice"
            className={cn(
              "flex flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-xs",
              enough ? "border-[#4338CA]/60 bg-[#1E1B4B]/60 text-[#C7D2FE]" : "border-rose-500/50 bg-rose-950/40 text-rose-200",
            )}
          >
            <Coins className="size-4 shrink-0" />
            <span>
              Custa <b>{COST} créditos</b> • Saldo: <b data-testid="inline-credit-balance" className="font-mono">{credits ?? "—"}</b>
              {enough ? (
                <span className="hidden sm:inline">
                  {" "}• <ShieldCheck className="inline size-3.5" /> Estorno automático se falhar
                </span>
              ) : (
                " • Saldo insuficiente"
              )}
            </span>
          </div>

          <Button
            type="submit"
            data-testid="btn-extrair-cortes"
            disabled={!canSubmit}
            className="h-11 rounded-xl px-6 text-sm font-semibold transition-transform duration-200 hover:-translate-y-0.5"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            {uploading ? `Enviando ${pct}%` : pending ? "Enviando..." : "Extrair cortes"}
          </Button>
        </div>
      </form>
    </section>
  );
}
