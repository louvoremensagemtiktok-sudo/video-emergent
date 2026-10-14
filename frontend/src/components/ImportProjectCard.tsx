import { useRef, useState, type FormEvent } from "react";
import { Coins, Link2, Loader2, ShieldCheck, Upload, Wand2, X } from "lucide-react";
import { useCreateProject, useMe, useUploadProject } from "@/lib/hooks";
import type { DurationMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const COST = 3;
const DURATIONS: { value: DurationMode; label: string }[] = [
  { value: "30", label: "30s" },
  { value: "60", label: "60s" },
  { value: "auto", label: "Automático" },
];
const YT_RE = /(youtube\.com\/(watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)[\w-]{11}/;

export type ImportSource = "youtube" | "upload";

interface ImportProjectCardProps {
  source: ImportSource;
  onSourceChange: (s: ImportSource) => void;
  /** Pulses the card/dropzone when the user is sent here from a blocked YouTube project. */
  highlight?: boolean;
}

export function ImportProjectCard({ source, onSourceChange, highlight = false }: ImportProjectCardProps) {
  const me = useMe();
  const createProject = useCreateProject();
  const uploadProject = useUploadProject();
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<DurationMode>("auto");
  const fileRef = useRef<HTMLInputElement>(null);

  const credits = me.data?.credits;
  const enough = credits === undefined || credits >= COST;
  const pending = createProject.isPending || uploadProject.isPending;
  const urlValid = YT_RE.test(url.trim());
  const canSubmit = enough && !pending && (source === "youtube" ? urlValid : !!file);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (source === "youtube") {
      createProject.mutate({ video_url: url.trim(), duration_mode: duration }, { onSuccess: () => setUrl("") });
    } else if (file) {
      uploadProject.mutate({ file, duration_mode: duration }, {
        onSuccess: () => {
          setFile(null);
          if (fileRef.current) fileRef.current.value = "";
        },
      });
    }
  };

  return (
    <section
      id="novo-projeto"
      data-testid="import-project-card"
      data-highlight={highlight || undefined}
      className="relative mx-auto w-full scroll-mt-24 transition-shadow duration-500 data-[highlight]:animate-attention max-w-4xl overflow-hidden rounded-2xl border border-slate-800 bg-[linear-gradient(135deg,rgba(11,15,23,0.95)_0%,rgba(17,24,39,0.92)_100%)] p-5 shadow-[0_20px_60px_-20px_rgba(2,132,199,0.35)] sm:p-7"
    >
      <div className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">Novo Projeto</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Transforme vídeos longos em cortes virais</h1>
        </div>
        <div className="flex rounded-xl border border-slate-800 bg-slate-900/80 p-1" role="tablist">
          {(["youtube", "upload"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={source === s}
              data-testid={`tab-source-${s}`}
              onClick={() => onSourceChange(s)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 transition-colors duration-200",
                source === s && "bg-sky-600 text-white",
              )}
            >
              {s === "youtube" ? <Link2 className="size-4" /> : <Upload className="size-4" />}
              {s === "youtube" ? "URL do YouTube" : "Upload local"}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="relative mt-5 space-y-4">
        {source === "youtube" ? (
          <div className="space-y-1.5">
            <Input
              data-testid="input-youtube-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Cole aqui o link do YouTube — ex: https://www.youtube.com/watch?v=..."
              className="h-12 rounded-xl bg-slate-950/70 text-base"
            />
            {url && !urlValid && (
              <p data-testid="url-validation-error" className="text-xs text-rose-400">
                Informe uma URL válida do YouTube (watch, shorts ou youtu.be).
              </p>
            )}
          </div>
        ) : (
          <div
            data-testid="upload-dropzone"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
            }}
            className={cn(
              "flex h-12 cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 text-sm text-slate-400 transition-colors duration-200 hover:border-sky-500",
              highlight ? "border-sky-400 bg-sky-950/40 text-sky-100" : "border-slate-700 bg-slate-950/70",
            )}
          >
            <Upload className="size-4 shrink-0 text-sky-400" />
            <span data-testid="upload-file-name" className="flex-1 truncate">
              {file ? file.name : "Clique ou arraste um vídeo (MP4, MOV, WEBM — até 500 MB)"}
            </span>
            {file && (
              <button
                type="button"
                data-testid="btn-remove-file"
                aria-label="Remover arquivo"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                <X className="size-4" />
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              hidden
              data-testid="input-upload-file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        )}

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
            {pending ? "Enviando..." : "Extrair cortes"}
          </Button>
        </div>
      </form>
    </section>
  );
}
