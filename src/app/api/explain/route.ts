import { NextResponse } from "next/server";
import { callGroq, extractJson, groqErrorResponse, hashObject, resolveGroqAccess } from "@/lib/api-groq";
import { ExplainRequestSchema, ExplainResponseSchema } from "@/lib/llm-schema";
import { buildExplainMessages } from "@/lib/sql-prompt";

// The same (sql + schema) always explains the same way; cache it.
const cache = new Map<string, string>();
const MAX_ENTRIES = 300;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = ExplainRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const key = hashObject({ sql: parsed.data.sql, tables: parsed.data.tables });
  const cached = cache.get(key);
  if (cached) return NextResponse.json({ explicacion: cached }, { headers: { "x-cache": "HIT" } });

  const access = resolveGroqAccess(request);
  if (access instanceof NextResponse) return access;

  const result = await callGroq(buildExplainMessages(parsed.data.sql, parsed.data.tables), access.apiKey);
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

  cache.set(key, p.data.explicacion);
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  return NextResponse.json({ explicacion: p.data.explicacion }, { headers: { "x-cache": "MISS" } });
}
