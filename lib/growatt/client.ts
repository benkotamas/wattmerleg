import "server-only";
import { GrowattError } from "./errors";
import type { GrowattHttpMethod } from "./types";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
export type GrowattRequest = { method?: GrowattHttpMethod; path: string; query?: Record<string, string>; body?: unknown; form?: Record<string, string> };

export class GrowattClient {
  constructor(private readonly options: { baseUrl: string; token: string; authHeader: string; authValueTemplate: string; userAgent?: string; timeoutMs?: number; fetcher?: FetchLike; maxAttempts?: number }) {}
  get(path: string, query: Record<string, string> = {}) { return this.request({ method: "GET", path, query }); }
  async request(request: GrowattRequest): Promise<unknown> {
    let last: GrowattError | undefined;
    const maxAttempts = Math.max(1, this.options.maxAttempts ?? 2);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try { return await this.once(request); }
      catch (error) {
        const normalized = error instanceof GrowattError ? error : new GrowattError("GROWATT_UNAVAILABLE", 503, { cause: error });
        last = normalized;
        if (attempt === maxAttempts - 1 || !new Set(["GROWATT_TIMEOUT", "GROWATT_RATE_LIMITED", "GROWATT_UNAVAILABLE"]).has(normalized.code)) throw normalized;
      }
    }
    throw last!;
  }
  private async once(request: GrowattRequest) {
    const url = new URL(request.path, this.options.baseUrl);
    for (const [key, value] of Object.entries(request.query ?? {})) url.searchParams.set(key, value);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10_000);
    const method = request.method ?? "GET";
    const headers: Record<string, string> = { Accept: "application/json", [this.options.authHeader]: this.options.authValueTemplate.replaceAll("{token}", this.options.token), ...(this.options.userAgent ? { "User-Agent": this.options.userAgent } : {}) };
    let body: string | undefined;
    if (method === "POST" && request.form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(request.form).toString(); }
    else if (method === "POST" && request.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(request.body); }
    let response: Response;
    try { response = await (this.options.fetcher ?? fetch)(url, { method, headers, body, signal: controller.signal, cache: "no-store" }); }
    catch (error) { if (error instanceof Error && error.name === "AbortError") throw new GrowattError("GROWATT_TIMEOUT", 503, { cause: error }); throw new GrowattError("GROWATT_UNAVAILABLE", 503, { cause: error }); }
    finally { clearTimeout(timer); }
    if (response.status === 401 || response.status === 403) throw new GrowattError("GROWATT_AUTH_FAILED", 401);
    if (response.status === 429) throw new GrowattError("GROWATT_RATE_LIMITED", 429);
    if (response.status >= 500) throw new GrowattError("GROWATT_UNAVAILABLE", 503);
    if (!response.ok) throw new GrowattError("GROWATT_INVALID_RESPONSE", 502);
    try { return await response.json(); } catch (error) { throw new GrowattError("GROWATT_INVALID_RESPONSE", 502, { cause: error }); }
  }
}
