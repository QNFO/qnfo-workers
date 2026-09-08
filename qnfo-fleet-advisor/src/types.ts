// Minimal ambient contract types (documentation + esbuild stripping; no external type deps).
// PRECONDITION: bindings declared in wrangler.jsonc exist before any use.
export interface D1Row { [k: string]: unknown }

export interface D1Result {
  results: D1Row[];
  success: boolean;
  meta?: { last_row_id?: number; changes?: number };
}

export interface D1Statement {
  bind(...v: unknown[]): D1Statement;
  all(): Promise<D1Result>;
  run(): Promise<D1Result>;
  first(col?: string): Promise<unknown>;
}

export interface D1Database {
  prepare(q: string): D1Statement;
  exec(q: string): Promise<unknown>;
  batch(stmts: D1Statement[]): Promise<unknown[]>;
}

export interface Env {
  AI: { run(model: string, input: unknown): Promise<{ response?: string; [k: string]: unknown }> };
  AUDIT_DB: D1Database;
  FleetAdvisor: DurableObjectNamespace;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  ADVISOR_TOKEN: string;
  ADVISOR_MODEL: string;
  PROBE_WORKERS: string;
}
