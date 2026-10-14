import { NavLink, Navigate, Outlet } from "react-router-dom";
import { Clapperboard, LayoutDashboard, LogOut, PlugZap, Sparkles } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAnyProcessing, useMe } from "@/lib/hooks";
import { endSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { CreditBadge } from "@/components/CreditBadge";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Novo Projeto", icon: LayoutDashboard, testId: "nav-novo-projeto" },
  { to: "/cortes", label: "Meus Cortes", icon: Clapperboard, testId: "nav-meus-cortes" },
  { to: "/conexoes", label: "Conexões", icon: PlugZap, testId: "nav-conexoes" },
];

function MeWatcher() {
  // Keeps the credit counter live while jobs run (refunds land without a reload).
  const busy = useAnyProcessing();
  useMe(busy);
  return null;
}

export default function AppLayout() {
  const me = useMe();
  if (me.error instanceof ApiError && me.error.status === 401) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-svh">
      <MeWatcher />
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2" data-testid="brand-logo">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-sky-500 via-indigo-500 to-emerald-400">
              <Sparkles className="size-4 text-white" />
            </span>
            <span className="hidden font-heading text-sm font-bold tracking-tight sm:block">VIDEOS IA VIRAIS</span>
          </NavLink>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                data-testid={n.testId}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors duration-200 hover:bg-slate-800/60 hover:text-white",
                    isActive && "bg-slate-800 text-white",
                  )
                }
              >
                <n.icon className="size-4" />
                <span className="hidden md:inline">{n.label}</span>
              </NavLink>
            ))}
          </nav>
          <CreditBadge credits={me.data?.credits} />
          <span data-testid="user-email" className="hidden max-w-[180px] truncate text-sm text-slate-400 lg:block">
            {me.data?.email}
          </span>
          <Button variant="ghost" size="icon-sm" data-testid="btn-logout" aria-label="Sair" onClick={() => void endSession()}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
