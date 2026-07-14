import { NextResponse } from "next/server";
import { callGroq, extractJson, groqErrorResponse, hashObject, resolveGroqAccess } from "@/lib/api-groq";
import { createCache } from "@/lib/kv-cache";
import { ExplainRequestSchema, ExplainResponseSchema } from "@/lib/llm-schema";
import { buildExplainMessages } from "@/lib/sql-prompt";

// The same (sql + schema + lang) always explains the same way; cache it.
// Redis-backed when configured, else a per-instance in-memory LRU.
const cache = createCache<string>("explain", { maxEntries: 300, ttlSeconds: 60 * 60 * 24 });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = ExplainRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const lang = parsed.data.lang ?? "es";
  const key = hashObject({ sql: parsed.data.sql, tables: parsed.data.tables, lang });
  const cached = await cache.get(key);
  if (cached) return NextResponse.json({ explicacion: cached }, { headers: { "x-cache": "HIT" } });

  const access = await resolveGroqAccess(request);
  if (access instanceof NextResponse) return access;

  const result = await callGroq(buildExplainMessages(parsed.data.sql, parsed.data.tables, lang), access.apiKey);
  if (!result.ok) return groqErrorResponse(result, access.clientKey);

  let rawJson: unknown;
  try {
    rawJson = extractJson(result.content);
  } catch {
    return NextResponse.json({ error: "El modelo respondió en un formato inválido." }, { status: 502 });
  }

  const p = ExplainResponseSchema.safeParse(rawJson);
  if (!p.success) {
    return NextResponse.json({ error: "El modelo respondió en un formato inesperado." }, { status: 502 });
  }

  await cache.set(key, p.data.explicacion);
  return NextResponse.json({ explicacion: p.data.explicacion }, { headers: { "x-cache": "MISS" } });
}
