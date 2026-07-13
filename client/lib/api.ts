import {
  clearPortalSession,
  loadAccessToken,
  loadRefreshToken,
  saveAccessToken,
  saveRefreshToken,
} from "@/lib/session";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4010";

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = loadRefreshToken();
  if (!refreshToken) return null;

  const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) return null;

  const tokens = (await response.json()) as {
    accessToken: string;
    refreshToken: string;
  };
  saveAccessToken(tokens.accessToken);
  saveRefreshToken(tokens.refreshToken);
  return tokens.accessToken;
}

export async function authenticatedFetch(path: string, init?: RequestInit) {
  const token = loadAccessToken();
  const headers = new Headers(init?.headers);

  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (response.status === 401) {
    const renewedToken = await refreshAccessToken();
    if (renewedToken) {
      headers.set("Authorization", `Bearer ${renewedToken}`);
      response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
    }
  }
  if (response.status === 401 && typeof window !== "undefined") {
    clearPortalSession();
    window.location.replace("/login");
  }
  return response;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(path, init);
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}
