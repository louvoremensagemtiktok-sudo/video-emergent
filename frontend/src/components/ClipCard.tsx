import { useState } from "react";
import { Ban, Copy, Download, Loader2, Play, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useClipAction } from "@/lib/hooks";
import type { Clip } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ViralScore } from "@/components/ViralScore";
import { cn } from "@/lib/utils";

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function youtubeId(url: string) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function coverFor(clip: Clip): string | null {
  if (clip.thumbnail_url) return clip.thumbnail_url;
  const id = clip.preview_url ? null : youtubeId(clip.source_url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

function Preview({ clip }: { clip: Clip }) {
  const [playing, setPlaying] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);

  if (clip.status === "processing") {
    return (
      <div className="grid h-full place-items-center bg-slate-900 text-sky-300">
        <div className="flex flex-col items-center gap-2 text-xs">
          <Loader2 className="size-6 animate-spin" /> Renderizando 9:16…
        </div>
      </div>
    );
  }
  if (clip.status === "error") {
    return (
      <div className="grid h-full place-items-center bg-rose-950/40 p-4 text-center text-xs text-rose-200">
        <div className="flex flex-col items-center gap-2">
          <TriangleAlert className="size-6" /> {clip.error ?? "Falha na renderização"}
        </div>
      </div>
    );
  }

  const cover = coverFailed ? null : coverFor(clip);
  const ytId = youtubeId(clip.source_url);
  const canPlay = !!clip.preview_url || !!ytId;

  if (cover && !playing) {
    return (
      <button
        type="button"
        data-testid="clip-cover-button"
        aria-label={`Reproduzir ${clip.title}`}
        disabled={!canPlay}
        onClick={() => setPlaying(true)}
        className="group/cover relative block h-full w-full cursor-pointer disabled:cursor-default"
      >
        <img
          data-testid="clip-cover-image"
          src={cover}
          alt={`Capa do corte: ${clip.title}`}
          loading="lazy"
          onError={() => setCoverFailed(true)}
          className="h-full w-full object-cover transition-transform duration-500 group-hover/cover:scale-[1.03]"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30" />
        {canPlay && (
          <span className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/15 backdrop-blur-md ring-1 ring-white/30 transition-[transform,background-color] duration-200 group-hover/cover:scale-110 group-hover/cover:bg-sky-500/80">
            <Play className="ml-0.5 size-6 fill-white text-white" />
          </span>
        )}
      </button>
    );
  }

  if (clip.preview_url) {
    return (
      <video
        data-testid="clip-video-preview"
        src={clip.preview_url}
        poster={cover ?? undefined}
        controls
        autoPlay={playing}
        preload={playing ? "auto" : "metadata"}
        playsInline
        className="h-full w-full object-cover"
      />
    );
  }
  if (ytId) {
    return (
      <iframe
        data-testid="clip-youtube-preview"
        title={clip.title}
        src={`https://www.youtube.com/embed/${ytId}?start=${Math.floor(clip.start_time)}&end=${Math.ceil(clip.end_time)}&rel=0${playing ? "&autoplay=1" : ""}`}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        className="h-full w-full scale-[1.9]"
      />
    );
  }
  return <div className="h-full bg-slate-900" />;
}

export function ClipCard({ clip }: { clip: Clip }) {
  const action = useClipAction();
  const run = (a: "cancel" | "retry" | "delete") => action.mutate({ id: clip.id, action: a });
  const processing = clip.status === "processing";

  const copyTags = async () => {
    try {
      await navigator.clipboard.writeText(clip.hashtags.join(" "));
      toast.success("Hashtags copiadas!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <article
      data-testid={`clip-card-${clip.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#111827] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-sky-700 hover:shadow-[0_12px_28px_rgba(2,132,199,0.18)]"
    >
      <div className="relative aspect-[9/16] max-h-[420px] w-full overflow-hidden bg-black">
        <Preview clip={clip} />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
          <ViralScore score={clip.viral_score} />
          <Badge data-testid="clip-time-range" className="bg-black/60 font-mono text-white backdrop-blur-md">
            {fmt(clip.start_time)}–{fmt(clip.end_time)}
          </Badge>
        </div>
        {clip.simulated && clip.status === "ready" && (
          <Badge data-testid="clip-simulated-badge" className="pointer-events-none absolute bottom-2.5 left-2.5 bg-amber-500/90 text-black">
            Modo simulação
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h3 data-testid="clip-title" className="line-clamp-2 text-base font-semibold leading-snug">{clip.title}</h3>
        {clip.hook && (
          <p data-testid="clip-hook" className="line-clamp-2 border-l-2 border-sky-500 pl-2 text-xs italic text-slate-300">“{clip.hook}”</p>
        )}
        <div data-testid="clip-hashtags" className="flex flex-wrap gap-1">
          {clip.hashtags.map((t) => (
            <span key={t} className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[11px] text-sky-300">{t}</span>
          ))}
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
          <Button size="sm" variant="secondary" data-testid="btn-copiar-hashtags" onClick={() => void copyTags()}>
            <Copy className="size-3.5" /> Hashtags
          </Button>
          {clip.download_url && clip.status === "ready" ? (
            <a
              href={clip.download_url}
              download
              target="_blank"
              rel="noreferrer"
              data-testid="btn-download-mp4"
              className={cn(buttonVariants({ size: "sm" }))}
            >
              <Download className="size-3.5" /> MP4
            </a>
          ) : (
            <Button size="sm" disabled data-testid="btn-download-mp4" title={clip.simulated ? "Configure a Shotstack em Conexões para gerar o MP4" : "Indisponível"}>
              <Download className="size-3.5" /> MP4
            </Button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button size="xs" variant="outline" data-testid="btn-excluir-corte" disabled={action.isPending} onClick={() => run("delete")}>
            <Trash2 className="size-3.5" /> Excluir
          </Button>
          <Button size="xs" variant="outline" data-testid="btn-refazer-corte" disabled={processing || action.isPending} onClick={() => run("retry")}>
            <RotateCcw className="size-3.5" /> Refazer
          </Button>
          <Button size="xs" variant="outline" data-testid="btn-cancelar-processamento" disabled={!processing || action.isPending} onClick={() => run("cancel")} title="Cancelar Processamento">
            <Ban className="size-3.5" /> Cancelar
          </Button>
        </div>
      </div>
    </article>
  );
}

export function ClipsGrid({ clips }: { clips: Clip[] }) {
  return (
    <div data-testid="clips-grid" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {clips.map((c) => (
        <ClipCard key={c.id} clip={c} />
      ))}
    </div>
  );
}
