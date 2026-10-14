import type { ReactNode } from "react";
import { Film } from "lucide-react";

export function EmptyState({ title, text, action, testId }: { title: string; text: string; action?: ReactNode; testId: string }) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-slate-700 bg-[#111827]/60 p-8 sm:flex-row sm:items-center"
    >
      <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-500/20 via-indigo-500/20 to-emerald-400/20">
        <Film className="size-8 animate-float-reel text-sky-400" />
      </div>
      <div className="flex-1 space-y-1">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="max-w-xl text-sm leading-relaxed text-slate-400">{text}</p>
      </div>
      {action}
    </div>
  );
}
