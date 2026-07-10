import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { GROQ_KEY_HEADER } from "@/lib/api-key";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ChatMessage } from "@/lib/sql-prompt";

// Shared Groq plumbing for the LLM routes (/api/sql, /api/suggest, /api/explain):
// key resolution + rate limit, the chat-completions call, JSON extraction, and
// error mapping. Keeps the three routes to just their prompt + response schema.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

/** Stable hash of any JSON-serializable value, for cache keys. */
export function hashObject(obj: unknown): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

/** Parses the model's reply, tolerating a ```json fenced block. */
export function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

export interface GroqAccess {
  apiKey: string;
  /** The user's own key, when they brought one (BYOK). */
  clientKey?: string;
}

/**
 * Resolves which Groq key to use and enforces the shared-key rate limit. A
 * user-supplied key (BYOK) bypasses the limit since it spends their own quota.
 * Returns a NextResponse to short-circuit on 429 / missing key.
 */
export function resolveGroqAccess(request: Request): GroqAccess | NextResponse {
  const clientKey = request.headers.get(GROQ_KEY_HEADER)?.trim() || undefined;

  if (!clientKey) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rate = checkRateLimit(ip);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes. Intenta de nuevo en unos minutos o usa tu propia API key." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rate.resetAt - Date.now()) / 1000)) } },
      );
    }
  }

  const apiKey = clientKey ?? process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No hay API key configurada. Agrega tu propia API key de Groq para continuar." },
      { status: 500 },
    );
  }
  return { apiKey, clientKey };
}

export type GroqResult =
  | { ok: true; content: string }
  | { ok: false; authRejected: boolean };

/** Calls Groq chat-completions at temperature 0 with JSON output enforced. */
export async function callGroq(messages: ChatMessage[], apiKey: string): Promise<GroqResult> {
  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });
  } catch {
    return { ok: false, authRejected: false };
  }
  if (!res.ok) return { ok: false, authRejected: res.status === 401 || res.status === 403 };

  const completion = await res.json().catch(() => null);
  const content: unknown = completion?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return { ok: false, authRejected: false };
  return { ok: true, content };
}

/** Maps a failed Groq call to a response — a rejected BYOK key is the user's to fix. */
export function groqErrorResponse(
  result: Extract<GroqResult, { ok: false }>,
  clientKey?: string,
): NextResponse {
  if (clientKey && result.authRejected) {
    return NextResponse.json(
      { error: "Groq rechazó tu API key. Revísala e inténtalo de nuevo." },
      { status: 401 },
    );
  }
  return NextResponse.json({ error: "El modelo devolvió un error." }, { status: 502 });
}
