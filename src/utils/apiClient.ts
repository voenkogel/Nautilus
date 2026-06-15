// Centralized API client. Injects auth headers, applies consistent error
// handling (throws ApiError on any non-2xx response), and parses JSON.
// Replaces ad-hoc fetch() calls scattered across the app.
import { getAuthHeaders } from './auth';

/** Thrown when a request returns a non-2xx status. Carries the HTTP status. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RequestOptions {
  /** Extra headers, merged over the default auth + JSON headers. */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: RequestOptions = {}
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { ...getAuthHeaders(), ...opts.headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: opts.signal,
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      message = data?.message || data?.error || message;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new ApiError(message, response.status);
  }

  // Some endpoints return an empty body; guard JSON.parse.
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, body, opts),
  del: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, undefined, opts),
};
