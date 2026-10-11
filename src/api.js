const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export function deviceHash() {
  let h = localStorage.getItem("qs_device");
  if (!h) { h = crypto.randomUUID(); localStorage.setItem("qs_device", h); }
  return h;
}

export async function api(path, { headers, ...opts } = {}) {
  const r = await fetch(BASE + path, { headers: { "Content-Type": "application/json", ...headers }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
  return r.json();
}
