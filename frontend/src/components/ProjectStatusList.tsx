import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Ban, Link2, RotateCcw, ShieldAlert, Trash2, Upload } from "lucide-react";
import { useProjectAction } from "@/lib/hooks";
import type { Project, ProjectStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS: Record<ProjectStatus, { label: string; cls: string }> = {
  pending: { label: "Na fila", cls: "bg-slate-700 text-slate-100" },
  processing: { label: "Processando", cls: "bg-sky-900 text-sky-100" },
  completed: { label: "Concluído", cls: "bg-emerald-900 text-emerald-100" },
  failed: { label: "Falhou", cls: "bg-rose-900 text-rose-100" },
};

export function timeAgo(iso: string) {
  const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
  return formatDistanceToNow(d, { addSuffix: true, locale: ptBR });
}

function ProjectRow({ project, onUploadInstead }: { project: Project; onUploadInstead?: () => void }) {
  const action = useProjectAction();
  const busy = project.status === "pending" || project.status === "processing";
  const st = STATUS[project.status];
  const run = (a: "cancel" | "retry" | "delete") => action.mutate({ id: project.id, action: a });

  return (
    <li data-testid={`project-row-${project.id}`} className="rounded-xl border border-slate-800 bg-[#111827] p-4 transition-colors duration-200 hover:border-sky-800">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-800">
          {project.source_type === "youtube" ? <Link2 className="size-4 text-sky-400" /> : <Upload className="size-4 text-sky-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <p data-testid="project-title" className="truncate font-medium">{project.title}</p>
          <p className="text-xs text-slate-500">
            {timeAgo(project.created_at)} • {project.duration_mode === "auto" ? "Automático" : `${project.duration_mode}s`} • Legenda {project.caption_style === "minimal" ? "Minimalista" : "Hormozi"}
            {project.clips_count > 0 && ` • ${project.clips_count} cortes`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {project.simulated && (
            <Badge variant="outline" data-testid="badge-simulacao" className="border-amber-500/40 text-amber-300">Simulação</Badge>
          )}
          <Badge data-testid="project-status" className={st.cls}>{st.label}</Badge>
        </div>
      </div>

      {busy && (
        <div className="mt-3 space-y-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              data-testid="project-progress"
              className="h-full animate-stripes rounded-full bg-[linear-gradient(45deg,#0284C7_25%,#38BDF8_25%,#38BDF8_50%,#0284C7_50%,#0284C7_75%,#38BDF8_75%)] bg-[length:28px_28px] transition-[width] duration-700"
              style={{ width: `${project.progress}%` }}
            />
          </div>
          <p data-testid="project-stage" className="text-xs text-sky-300">{project.stage}…</p>
        </div>
      )}
      {project.status === "failed" && project.error_code === "youtube_blocked" ? (
        <div
          data-testid="project-youtube-blocked"
          className="mt-3 flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 sm:flex-row sm:items-center"
        >
          <ShieldAlert className="size-5 shrink-0 text-amber-400" />
          <div className="min-w-0 flex-1 text-xs leading-relaxed">
            <p className="font-semibold text-amber-200">O YouTube bloqueou o download deste vídeo</p>
            <p data-testid="project-error" className="text-amber-100/80">
              Seus 3 créditos foram estornados. Baixe o vídeo no seu computador e envie o arquivo MP4 — o processamento é o mesmo.
            </p>
          </div>
          {onUploadInstead && (
            <Button
              size="sm"
              data-testid="btn-enviar-mp4-em-vez"
              onClick={onUploadInstead}
              className="shrink-0 bg-amber-500 text-slate-950 transition-transform duration-200 hover:-translate-y-0.5 hover:bg-amber-400"
            >
              <Upload className="size-4" /> Enviar MP4 em vez disso
            </Button>
          )}
        </div>
      ) : (
        project.status === "failed" && project.error && (
          <p data-testid="project-error" className="mt-2 text-xs text-rose-300">{project.error}</p>
        )
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="xs" variant="outline" data-testid="btn-cancelar-processamento-projeto" disabled={!busy || action.isPending} onClick={() => run("cancel")}>
          <Ban className="size-3.5" /> Cancelar Processamento
        </Button>
        <Button size="xs" variant="outline" data-testid="btn-refazer-projeto" disabled={busy || action.isPending} onClick={() => run("retry")}>
          <RotateCcw className="size-3.5" /> Refazer (3 créditos)
        </Button>
        <Button size="xs" variant="destructive" data-testid="btn-excluir-projeto" disabled={action.isPending} onClick={() => run("delete")}>
          <Trash2 className="size-3.5" /> Excluir
        </Button>
      </div>
    </li>
  );
}

export function ProjectStatusList({ projects, onUploadInstead }: { projects: Project[]; onUploadInstead?: () => void }) {
  return (
    <ul data-testid="project-list" className={cn("space-y-3")}>
      {projects.map((p) => (
        <ProjectRow key={p.id} project={p} onUploadInstead={onUploadInstead} />
      ))}
    </ul>
  );
}
