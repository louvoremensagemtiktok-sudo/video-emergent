import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAnyProcessing, useClips } from "@/lib/hooks";
import type { ClipStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ClipsGrid } from "@/components/ClipCard";
import { EmptyState } from "@/components/EmptyState";
import { buttonVariants } from "@/components/ui/button";

const FILTERS: { value: "all" | ClipStatus; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "ready", label: "Prontos" },
  { value: "processing", label: "Processando" },
  { value: "error", label: "Com erro" },
];

export default function Clips() {
  const busy = useAnyProcessing();
  const clips = useClips(busy);
  const [filter, setFilter] = useState<"all" | ClipStatus>("all");
  const list = useMemo(() => {
    const all = clips.isError ? [] : clips.data ?? [];
    return filter === "all" ? all : all.filter((c) => c.status === filter);
  }, [clips.data, clips.isError, filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">Biblioteca</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Meus Cortes</h1>
          <p data-testid="clips-count" className="mt-1 text-sm text-slate-400">{list.length} cortes</p>
        </div>
        <div className="flex rounded-xl border border-slate-800 bg-slate-900/80 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              data-testid={`filter-${f.value}`}
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 transition-colors duration-200",
                filter === f.value && "bg-slate-700 text-white",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {clips.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-900" />
      ) : list.length ? (
        <ClipsGrid clips={list} />
      ) : (
        <EmptyState
          testId="empty-library"
          title={filter === "all" ? "Sua biblioteca está vazia" : "Nenhum corte neste filtro"}
          text="Nenhum corte gerado ainda. Cole um link do YouTube ou envie um vídeo para extrair seus primeiros shorts virais!"
          action={
            <Link to="/" data-testid="btn-empty-novo-projeto" className={buttonVariants()}>
              <Plus className="size-4" /> Novo Projeto
            </Link>
          }
        />
      )}
    </div>
  );
}
