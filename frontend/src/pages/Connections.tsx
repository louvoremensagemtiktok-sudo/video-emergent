import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, CircleDashed, Coins, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { ConnectionsReport, KeyStatus } from "@/lib/types";
import { useMe } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const DESCRIPTIONS: Record<KeyStatus["service"], string> = {
  assemblyai: "Transcrição do áudio com marcações de tempo por palavra.",
  shotstack: "Renderização vertical 9:16, corte e legendas dinâmicas.",
  openai: "Análise de viralidade, títulos magnéticos, gancho e hashtags.",
};

function KeyCard({ k }: { k: KeyStatus }) {
  const ok = k.valid;
  const Icon = ok ? CheckCircle2 : k.configured ? CircleAlert : CircleDashed;
  const modeLabel = k.mode === "emergent" ? "Chave Emergent" : k.mode === "real" ? "API real" : "Modo Simulação";
  return (
    <div
      data-testid={`connection-card-${k.service}`}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-[#111827] p-5 transition-colors duration-200",
        ok ? "border-emerald-700/60" : k.configured ? "border-rose-700/60" : "border-amber-700/50",
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{k.label}</h3>
        <Icon className={cn("size-5", ok ? "text-emerald-400" : k.configured ? "text-rose-400" : "text-amber-400")} />
      </div>
      <p className="text-sm text-slate-400">{DESCRIPTIONS[k.service]}</p>
      <div className="flex flex-wrap gap-1.5">
        <Badge data-testid={`connection-status-${k.service}`} className={ok ? "bg-emerald-900 text-emerald-100" : "bg-rose-900 text-rose-100"}>
          {ok ? "Conectado" : k.configured ? "Inválida" : "Não configurada"}
        </Badge>
        <Badge variant="outline" data-testid={`connection-mode-${k.service}`} className={k.mode === "simulation" ? "border-amber-500/50 text-amber-300" : "border-sky-500/50 text-sky-300"}>
          {modeLabel}
        </Badge>
        {k.latency_ms !== null && (
          <Badge variant="outline" data-testid={`connection-latency-${k.service}`} className="font-mono">{k.latency_ms} ms</Badge>
        )}
      </div>
      <p data-testid={`connection-message-${k.service}`} className="text-xs text-slate-300">{k.message}</p>
      <code className="mt-auto rounded-md bg-slate-950 px-2 py-1 font-mono text-[11px] text-slate-400">{k.env_var}</code>
    </div>
  );
}

export default function Connections() {
  const me = useMe();
  const report = useQuery({
    queryKey: ["connections"],
    queryFn: () => apiGet<ConnectionsReport>("/connections/verify"),
    retry: false,
    staleTime: 60_000,
  });
  const data = report.isError ? undefined : report.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">Configurações</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Conexões</h1>
          <p className="mt-1 text-sm text-slate-400">Status em tempo real das chaves de API usadas no processamento.</p>
        </div>
        <Button data-testid="btn-testar-conexoes" onClick={() => void report.refetch()} disabled={report.isFetching}>
          {report.isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Testar conexões
        </Button>
      </div>

      {data?.simulation_active && (
        <div data-testid="banner-modo-simulacao" className="flex items-start gap-3 rounded-xl border border-amber-600/50 bg-amber-950/30 p-4 text-sm text-amber-100">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" />
          <div>
            <p className="font-semibold">Modo Simulação Ativo</p>
            <p className="text-amber-200/80">
              Sem chaves AssemblyAI/Shotstack válidas, a transcrição e a renderização são simuladas — a análise de viralidade por IA continua real.
              Adicione <code className="font-mono">ASSEMBLYAI_API_KEY</code> e <code className="font-mono">SHOTSTACK_API_KEY</code> (ou <code className="font-mono">CHAVE_API_SHOTSTACK</code>) no arquivo <code className="font-mono">backend/.env</code> para ativar o pipeline completo.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {report.isLoading
          ? [0, 1, 2].map((i) => <div key={i} className="h-56 animate-pulse rounded-2xl bg-slate-900" />)
          : data?.keys.map((k) => <KeyCard key={k.service} k={k} />)}
        {report.isError && (
          <p data-testid="connections-error" className="text-sm text-rose-300 md:col-span-3">Não foi possível verificar as conexões agora.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#4338CA]/60 bg-[#1E1B4B]/50 p-5">
        <div className="grid size-12 place-items-center rounded-xl bg-[#312E81]"><Coins className="size-6 text-[#A5B4FC]" /></div>
        <div className="flex-1">
          <p className="text-xs uppercase tracking-[0.18em] text-[#A5B4FC]">Saldo da conta</p>
          <p data-testid="connections-credit-balance" className="font-mono text-3xl font-bold text-white">{me.data?.credits ?? "—"} créditos</p>
        </div>
        <p className="max-w-sm text-sm text-[#C7D2FE]">Cada processamento custa 3 créditos. Falhas de transcrição ou renderização estornam os créditos automaticamente.</p>
      </div>
    </div>
  );
}
