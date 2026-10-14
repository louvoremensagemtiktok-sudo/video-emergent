import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, apiDelete, apiGet, apiPost, apiUpload } from "@/lib/api";
import type { Clip, DurationMode, MessageOut, Profile, Project, ProjectActionResult } from "@/lib/types";

export const qk = {
  me: ["me"] as const,
  projects: ["projects"] as const,
  clips: ["clips"] as const,
};

export function errorMessage(err: unknown, fallback = "Algo deu errado"): string {
  if (err instanceof ApiError) {
    const body = err.body as { detail?: unknown } | null;
    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail)) return "Dados inválidos — verifique os campos";
  }
  return fallback;
}

export function useMe(poll = false) {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => apiGet<Profile>("/auth/me"),
    retry: false,
    refetchInterval: poll ? 3000 : false,
  });
}

const isBusy = (p: Project) => p.status === "pending" || p.status === "processing";

export function useProjects() {
  return useQuery({
    queryKey: qk.projects,
    queryFn: () => apiGet<Project[]>("/projects"),
    retry: false,
    refetchInterval: (q) => (q.state.data?.some(isBusy) ? 2500 : false),
  });
}

export function useAnyProcessing(): boolean {
  const { data } = useProjects();
  return !!data?.some(isBusy);
}

export function useClips(poll: boolean) {
  return useQuery({
    queryKey: qk.clips,
    queryFn: () => apiGet<Clip[]>("/clips"),
    retry: false,
    refetchInterval: (q) => (poll || q.state.data?.some((c) => c.status === "processing") ? 2500 : false),
  });
}

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.projects });
    void qc.invalidateQueries({ queryKey: qk.clips });
    void qc.invalidateQueries({ queryKey: qk.me });
  };
}

function onActionSuccess(invalidate: () => void) {
  return (res: ProjectActionResult | MessageOut | Clip) => {
    if ("message" in res && typeof res.message === "string") toast.success(res.message);
    invalidate();
  };
}

export function useCreateProject() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { video_url: string; duration_mode: DurationMode }) =>
      apiPost<ProjectActionResult>("/projects", input),
    onSuccess: onActionSuccess(invalidate),
    onError: (e) => toast.error(errorMessage(e, "Não foi possível iniciar o processamento")),
  });
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

export function useUploadProject(onProgress?: (p: UploadProgress) => void) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { file: File; duration_mode: DurationMode }) => {
      const fd = new FormData();
      fd.append("file", input.file);
      fd.append("duration_mode", input.duration_mode);
      return apiUpload<ProjectActionResult>("/projects/upload", fd, (loaded, total) => onProgress?.({ loaded, total }));
    },
    onSuccess: onActionSuccess(invalidate),
    onError: (e) => toast.error(errorMessage(e, "Falha no upload")),
  });
}

export function useProjectAction() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "cancel" | "retry" | "delete" }) =>
      action === "delete"
        ? apiDelete<MessageOut>(`/projects/${id}`)
        : apiPost<ProjectActionResult>(`/projects/${id}/${action}`),
    onSuccess: onActionSuccess(invalidate),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useClipAction() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "cancel" | "retry" | "delete" }): Promise<Clip | MessageOut> =>
      action === "delete" ? apiDelete<MessageOut>(`/clips/${id}`) : apiPost<Clip>(`/clips/${id}/${action}`),
    onSuccess: (res, vars) => {
      if (vars.action === "retry") toast.success("Renderizando o corte novamente");
      else if (vars.action === "cancel") toast.success("Processamento do corte cancelado");
      else onActionSuccess(invalidate)(res);
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
