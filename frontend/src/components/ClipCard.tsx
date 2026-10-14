import { Ban, Copy, Download, Loader2, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
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

function Preview({ clip }: { clip: Clip }) {
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
  if (clip.preview_url) {
    return <video data-testid="clip-video-preview" src={clip.preview_url} controls preload="metadata" playsInline className="h-full w-full object-cover" />;
  }
  const id = youtubeId(clip.source_url);
  if (id) {
    return (
      <iframe
        data-testid="clip-youtube-preview"
        title={clip.title}
        src={`https://www.youtube.com/embed/${id}?start=${Math.floor(clip.start_time)}&end=${Math.ceil(clip.end_time)}&rel=0`}
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
