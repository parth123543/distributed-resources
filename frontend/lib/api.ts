const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )dr_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try { const body = await response.json(); message = body.detail ?? message; } catch {}
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return {} as T;
  return response.json();
}

export async function loginApi(email: string, password: string) {
  const formData = new URLSearchParams();
  formData.append("username", email);
  formData.append("password", password);
  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });
  if (!response.ok) throw new ApiError(response.status, "Invalid email or password.");
  return response.json() as Promise<{ access_token: string; token_type: string }>;
}

export async function signupApi(email: string, password: string) {
  return apiFetch<User>("/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) });
}

export async function getMeApi() { return apiFetch<User>("/auth/me"); }
export async function getMachinesApi() { return apiFetch<Machine[]>("/machines"); }
export async function registerMachineApi(data: MachineCreate) {
  return apiFetch<Machine>("/machines", { method: "POST", body: JSON.stringify(data) });
}
export async function deleteMachineApi(id: string) {
  return apiFetch<void>(`/machines/${id}`, { method: "DELETE" });
}
export async function getJobsApi() { return apiFetch<Job[]>("/jobs"); }
export async function getJobApi(id: string) { return apiFetch<Job>(`/jobs/${id}`); }
export async function submitJobApi(data: JobCreate) {
  return apiFetch<Job>("/jobs", { method: "POST", body: JSON.stringify(data) });
}
export async function deleteJobApi(id: string) {
  return apiFetch<void>(`/jobs/${id}`, { method: "DELETE" });
}

export type UserRole = "student" | "admin";
export type MachineStatus = "online" | "offline" | "busy";
export type JobStatus = "pending" | "scheduled" | "running" | "completed" | "failed";

export interface User { id: string; email: string; role: UserRole; created_at: string; }
export interface Machine {
  id: string; owner_id: string; cpu_cores: number; ram_gb: number;
  gpu_info: string | null; os: string; status: MachineStatus;
  last_heartbeat: string | null; created_at: string;
}
export interface MachineCreate { cpu_cores: number; ram_gb: number; gpu_info?: string; os: string; }
export interface Job {
  id: string; submitted_by: string; assigned_machine_id: string | null;
  status: JobStatus; required_cpu: number; required_ram: number;
  required_gpu: string | null; priority: number; command: string;
  result_output: string | null; created_at: string;
  started_at: string | null; completed_at: string | null;
}
export interface JobCreate {
  required_cpu: number; required_ram: number;
  required_gpu?: string; priority?: number; command: string;
}
