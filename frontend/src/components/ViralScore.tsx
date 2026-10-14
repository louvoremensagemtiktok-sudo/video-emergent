import { cn } from "@/lib/utils";

export function scoreTier(score: number) {
  if (score >= 80) return { label: "Viral", cls: "bg-[#064E3B] text-[#ECFDF5] border-emerald-500/50" };
  if (score >= 60) return { label: "Promissor", cls: "bg-[#78350F] text-[#FFFBEB] border-amber-500/50" };
  return { label: "Regular", cls: "bg-[#4C1D95] text-[#FAF5FF] border-violet-500/50" };
}

export function ViralScore({ score, className }: { score: number; className?: string }) {
  const tier = scoreTier(score);
  return (
    <div
      data-testid="badge-viral-score"
      className={cn(
        "flex items-center gap-2 rounded-xl border px-2.5 py-1.5 backdrop-blur-md",
        tier.cls,
        score >= 85 && "animate-score-glow",
        className,
      )}
    >
      <span className="font-mono text-xl font-bold leading-none tabular-nums">{score}</span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-90">{tier.label}</span>
    </div>
  );
}
