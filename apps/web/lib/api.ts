export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
}
