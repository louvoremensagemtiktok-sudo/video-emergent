import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clapperboard, Coins, FolderKanban, Gauge } from "lucide-react";
import { useAnyProcessing, useClips, useMe, useProjects } from "@/lib/hooks";
import { ImportProjectCard, type ImportSource } from "@/components/ImportProjectCard";
import { ProjectStatusList } from "@/components/ProjectStatusList";
import { ClipsGrid } from "@/components/ClipCard";
import { EmptyState } from "@/components/EmptyState";
import { buttonVariants } from "@/components/ui/button";

function Stat({ icon: Icon, label, value, testId }: { icon: typeof Coins; label: string; value: string | number; testId: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-[#111827] p-4">
      <div className="grid size-10 place-items-center rounded-lg bg-slate-800"><Icon className="size-5 text-sky-400" /></div>
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <p data-testid={testId} className="font-mono text-xl font-bold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const me = useMe();
  const projects = useProjects();
  const busy = useAnyProcessing();
  const clips = useClips(busy);
  const [source, setSource] = useState<ImportSource>("upload");
  const [highlight, setHighlight] = useState(false);
  const highlightTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(highlightTimer.current), []);

  const goToUpload = () => {
    setSource("upload");
    setHighlight(true);
    document.getElementById("novo-projeto")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlight(false), 2400);
  };

  const projectList = projects.isError ? [] : projects.data ?? [];
  const clipList = clips.isError ? [] : clips.data ?? [];
  const ready = clipList.filter((c) => c.status === "ready");
  const avg = ready.length ? Math.round(ready.reduce((s, c) => s + c.viral_score, 0) / ready.length) : 0;

  return (
    <div className="space-y-8">
      <ImportProjectCard source={source} onSourceChange={setSource} highlight={highlight} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="space-y-3 lg:col-span-8">
          <h2 className="text-lg font-semibold">Projetos recentes</h2>
          {projects.isLoading ? (
            <div className="h-24 animate-pulse rounded-xl bg-slate-900" />
          ) : projectList.length ? (
            <ProjectStatusList projects={projectList.slice(0, 6)} onUploadInstead={goToUpload} />
          ) : (
            <EmptyState
              testId="empty-projects"
              title="Nenhum projeto ainda"
              text="Envie um vídeo MP4 acima. O andamento da transcrição, análise e renderização aparece aqui em tempo real."
            />
          )}
        </section>
        <aside className="space-y-3 lg:col-span-4">
          <h2 className="text-lg font-semibold">Resumo</h2>
          <Stat icon={Coins} label="Créditos" value={me.data?.credits ?? "—"} testId="stat-creditos" />
          <Stat icon={FolderKanban} label="Projetos" value={projectList.length} testId="stat-projetos" />
          <Stat icon={Clapperboard} label="Cortes prontos" value={ready.length} testId="stat-cortes" />
          <Stat icon={Gauge} label="Nota média" value={ready.length ? avg : "—"} testId="stat-nota-media" />
        </aside>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Cortes gerados</h2>
          {clipList.length > 0 && (
            <Link to="/cortes" data-testid="link-ver-todos-cortes" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Ver biblioteca <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
        {clips.isLoading ? (
          <div className="h-40 animate-pulse rounded-xl bg-slate-900" />
        ) : clipList.length ? (
          <ClipsGrid clips={clipList.slice(0, 8)} />
        ) : (
          <EmptyState
            testId="empty-clips"
            title="Nenhum corte gerado ainda"
            text="Envie um vídeo MP4 acima para extrair seus primeiros shorts virais!"
          />
        )}
      </section>
    </div>
  );
}
