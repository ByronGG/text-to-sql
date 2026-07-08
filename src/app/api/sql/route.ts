import { NextResponse } from "next/server";
import { GROQ_KEY_HEADER } from "@/lib/api-key";
import { LlmResponseSchema, SqlRequestSchema } from "@/lib/llm-schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { cacheKey, getCached, isCacheable, setCached } from "@/lib/sql-cache";
import { buildMessages } from "@/lib/sql-prompt";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = SqlRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  // Cache check comes first: a hit is free (no Groq call), so it should neither
  // consume the rate limit nor require a key.
  const cacheable = isCacheable(parsed.data);
  const key = cacheable ? cacheKey(parsed.data) : undefined;
  if (key) {
    const cached = getCached(key);
    if (cached) {
      return NextResponse.json(cached, { headers: { "x-cache": "HIT" } });
    }
  }

  // BYOK: a user-supplied key spends the user's own Groq quota, so it bypasses
  // our per-IP rate limit (which only exists to protect the shared server key).
  const clientKey = request.headers.get(GROQ_KEY_HEADER)?.trim();

  if (!clientKey) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rate = checkRateLimit(ip);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes. Intenta de nuevo en unos minutos o usa tu propia API key." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((rate.resetAt - Date.now()) / 1000)) },
        },
      );
    }
  }

  const apiKey = clientKey || process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No hay API key configurada. Agrega tu propia API key de Groq para continuar." },
      { status: 500 },
    );
  }

  const messages = buildMessages(parsed.data);

  let completionRes: Response;
  try {
    completionRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });
  } catch {
    return NextResponse.json({ error: "No se pudo contactar al modelo." }, { status: 502 });
  }

  if (!completionRes.ok) {
    // A rejected BYOK key is the user's to fix, so say so specifically.
    if (clientKey && (completionRes.status === 401 || completionRes.status === 403)) {
      return NextResponse.json(
        { error: "Groq rechazó tu API key. Revísala e inténtalo de nuevo." },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: "El modelo devolvió un error." }, { status: 502 });
  }

  const completion = await completionRes.json();
  const content: unknown = completion?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return NextResponse.json({ error: "El modelo no devolvió contenido." }, { status: 502 });
  }

  let rawJson: unknown;
  try {
    rawJson = extractJson(content);
  } catch {
    return NextResponse.json(
      { error: "El modelo respondió en un formato inválido." },
      { status: 502 },
    );
  }

  const llmParsed = LlmResponseSchema.safeParse(rawJson);
  if (!llmParsed.success) {
    return NextResponse.json(
      { error: "El modelo respondió en un formato inesperado." },
      { status: 502 },
    );
  }

  if (key) setCached(key, llmParsed.data);

  return NextResponse.json(llmParsed.data, { headers: { "x-cache": "MISS" } });
}
