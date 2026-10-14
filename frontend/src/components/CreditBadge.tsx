import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";

export function CreditBadge({ credits, className, testId = "badge-creditos-header" }: { credits: number | undefined; className?: string; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[#4338CA] bg-[#1E1B4B] px-3 py-1 text-sm font-semibold text-[#E0E7FF]",
        className,
      )}
    >
      <Coins className="size-4 text-[#A5B4FC]" />
      <span className="font-mono tabular-nums">{credits ?? "—"}</span>
      <span className="text-[#A5B4FC]">créditos</span>
    </span>
  );
}
