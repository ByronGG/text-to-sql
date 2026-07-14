import { NextResponse } from "next/server";
import { callGroq, extractJson, groqErrorResponse, hashObject, resolveGroqAccess } from "@/lib/api-groq";
import { createCache } from "@/lib/kv-cache";
import { SuggestRequestSchema, SuggestResponseSchema } from "@/lib/llm-schema";
import { buildSuggestMessages } from "@/lib/sql-prompt";

// Suggestions depend only on the schema, so many users on the same dataset (the
// bundled samples especially) share one generation. Redis-backed when
// configured, else a per-instance in-memory LRU.
const cache = createCache<string[]>("suggest", { maxEntries: 200, ttlSeconds: 60 * 60 * 24 });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = SuggestRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const lang = parsed.data.lang ?? "es";
  const key = hashObject({ tables: parsed.data.tables, lang });
  const cached = await cache.get(key);
  if (cached) return NextResponse.json({ preguntas: cached }, { headers: { "x-cache": "HIT" } });

  const access = await resolveGroqAccess(request);
  if (access instanceof NextResponse) return access;

  const result = await callGroq(buildSuggestMessages(parsed.data.tables, lang), access.apiKey);
  if (!result.ok) return groqErrorResponse(result, access.clientKey);

  let rawJson: unknown;
  try {
    rawJson = extractJson(result.content);
  } catch {
    return NextResponse.json({ error: "El modelo respondió en un formato inválido." }, { status: 502 });
  }

  const p = SuggestResponseSchema.safeParse(rawJson);
  if (!p.success) {
    return NextResponse.json({ error: "El modelo respondió en un formato inesperado." }, { status: 502 });
  }

  await cache.set(key, p.data.preguntas);
  return NextResponse.json({ preguntas: p.data.preguntas }, { headers: { "x-cache": "MISS" } });
}
