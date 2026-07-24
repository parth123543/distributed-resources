const TOKEN_KEY = "dr_token";
const TOKEN_MAX_AGE = 60 * 60;

export function setToken(token: string): void {
  document.cookie = [
    `${TOKEN_KEY}=${encodeURIComponent(token)}`,
    `max-age=${TOKEN_MAX_AGE}`,
    "path=/",
    "SameSite=Strict",
  ].join("; ");
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )dr_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function clearToken(): void {
  document.cookie = `${TOKEN_KEY}=; max-age=0; path=/`;
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function decodeToken(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}
