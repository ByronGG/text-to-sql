import { NextResponse } from "next/server";
import { callGroq, extractJson, groqErrorResponse, hashObject, resolveGroqAccess } from "@/lib/api-groq";
import { createCache } from "@/lib/kv-cache";
import { FollowUpRequestSchema, SuggestResponseSchema } from "@/lib/llm-schema";
import { buildFollowUpMessages } from "@/lib/sql-prompt";

// Follow-up suggestions depend on the schema + the previous question and its
// SQL, all deterministic at temperature 0, so the same turn re-suggests the
// same refinements. Redis-backed when configured, else a per-instance in-memory
// LRU (same shape as /api/suggest).
const cache = createCache<string[]>("follow-up", { maxEntries: 300, ttlSeconds: 60 * 60 * 24 });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = FollowUpRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const lang = parsed.data.lang ?? "es";
  const key = hashObject({
    tables: parsed.data.tables,
    question: parsed.data.question,
    sql: parsed.data.sql,
    lang,
  });
  const cached = await cache.get(key);
  if (cached) return NextResponse.json({ preguntas: cached }, { headers: { "x-cache": "HIT" } });

  const access = await resolveGroqAccess(request);
  if (access instanceof NextResponse) return access;

  const result = await callGroq(
    buildFollowUpMessages(parsed.data.question, parsed.data.sql, parsed.data.tables, lang),
    access.apiKey,
  );
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
