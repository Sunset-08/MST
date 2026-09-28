// ============================================================
// SECUREX — API Client
// Clean abstraction over fetch. Member 3 connects real endpoints here.
// Toggle mock: NEXT_PUBLIC_USE_MOCK_API=true
// ============================================================

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api';
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_API === 'true';

export { USE_MOCK, BASE_URL };

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}
