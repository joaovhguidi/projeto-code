// Cliente HTTP da API. Envia o cabeçalho anti-CSRF e padroniza erros.
export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>, public code?: string, public details?: any) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown, opts: { raw?: boolean } = {}): Promise<T> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${url}`, {
      method,
      credentials: 'same-origin',
      headers: { 'X-Nexo-Request': '1', ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Não foi possível conectar ao servidor. Verifique sua internet.');
  }
  if (opts.raw) return res as unknown as T;
  const text = await res.text();
  const json = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
  if (!res.ok) {
    const fields = json?.fields ?? json?.details?.fields;
    throw new ApiError(res.status, json?.error ?? 'Erro inesperado.', fields, json?.code, json?.details);
  }
  return json as T;
}

export const api = {
  get: <T = any>(url: string) => request<T>('GET', url),
  post: <T = any>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T = any>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  patch: <T = any>(url: string, body?: unknown) => request<T>('PATCH', url, body ?? {}),
  del: <T = any>(url: string) => request<T>('DELETE', url),
  upload: <T = any>(url: string, form: FormData) => request<T>('POST', url, form),
};

export function qs(params: Record<string, unknown>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export interface Page<T> { data: T[]; total: number; page: number; pageSize: number; sums?: Record<string, number> }
