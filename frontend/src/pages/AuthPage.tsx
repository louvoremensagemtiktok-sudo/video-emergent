import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Captions, Coins, Loader2, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import { errorMessage } from "@/lib/hooks";
import { beginSession } from "@/lib/session";
import type { Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const HERO_IMG =
  "https://images.unsplash.com/photo-1614963326505-843868e1d83a?crop=entropy&cs=srgb&fm=jpg&q=80&w=1200";

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const isLogin = mode === "login";

  const auth = useMutation({
    mutationFn: () => apiPost<Profile>(isLogin ? "/auth/login" : "/auth/signup", { email, password }),
    onSuccess: (p) => {
      beginSession();
      toast.success(isLogin ? "Bem-vindo de volta!" : `Conta criada — você ganhou ${p.credits} créditos!`);
      navigate("/", { replace: true });
    },
    onError: (e) => toast.error(errorMessage(e, isLogin ? "Falha no login" : "Falha no cadastro")),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!isLogin && password.length < 6) {
      toast.error("A senha precisa ter pelo menos 6 caracteres");
      return;
    }
    auth.mutate();
  };

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:block">
        <img src={HERO_IMG} alt="Estúdio de edição" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(11,15,23,0.95)_0%,rgba(17,24,39,0.8)_100%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-sky-500 via-indigo-500 to-emerald-400">
              <Sparkles className="size-5 text-white" />
            </span>
            <span className="font-heading font-bold tracking-tight">VIDEOS IA VIRAIS</span>
          </div>
          <div className="max-w-md space-y-6">
            <h2 className="text-4xl font-bold leading-tight tracking-tight">
              Do vídeo longo ao <span className="bg-gradient-to-r from-sky-400 via-indigo-400 to-emerald-300 bg-clip-text text-transparent">corte viral</span> em minutos.
            </h2>
            <ul className="space-y-3 text-slate-300">
              <li className="flex items-center gap-3"><Coins className="size-5 text-[#A5B4FC]" /> 50 créditos gratuitos para testar</li>
              <li className="flex items-center gap-3"><Captions className="size-5 text-sky-400" /> Transcrição com AssemblyAI e legendas dinâmicas</li>
              <li className="flex items-center gap-3"><Zap className="size-5 text-emerald-400" /> Ganchos, títulos e nota de viralidade por IA</li>
            </ul>
          </div>
          <p className="text-xs text-slate-500">TikTok • Instagram Reels • YouTube Shorts — formato 9:16</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} data-testid={`${mode}-form`} className="w-full max-w-sm space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">{isLogin ? "Entrar" : "Criar conta"}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">{isLogin ? "Bem-vindo de volta" : "Comece grátis"}</h1>
            <p className="mt-1 text-sm text-slate-400">{isLogin ? "Acesse seu estúdio de cortes." : "Ganhe 50 créditos de teste ao se cadastrar."}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required data-testid="input-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" required data-testid="input-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="h-11" />
          </div>
          <Button type="submit" data-testid={`btn-${mode}-submit`} disabled={auth.isPending} className="h-11 w-full">
            {auth.isPending && <Loader2 className="size-4 animate-spin" />}
            {isLogin ? "Entrar" : "Criar conta e ganhar 50 créditos"}
          </Button>
          <p className="text-center text-sm text-slate-400">
            {isLogin ? "Ainda não tem conta? " : "Já tem conta? "}
            <Link to={isLogin ? "/register" : "/login"} data-testid={isLogin ? "link-register" : "link-login"} className="font-medium text-sky-400 hover:underline">
              {isLogin ? "Cadastre-se" : "Entrar"}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
