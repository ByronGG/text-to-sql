import { NextResponse } from "next/server";
import { callGroq, extractJson, groqErrorResponse, hashObject, resolveGroqAccess } from "@/lib/api-groq";
import { SuggestRequestSchema, SuggestResponseSchema } from "@/lib/llm-schema";
import { buildSuggestMessages } from "@/lib/sql-prompt";

// Suggestions depend only on the schema, so many users on the same dataset (the
// bundled samples especially) share one generation. Small in-memory cache.
const cache = new Map<string, string[]>();
const MAX_ENTRIES = 200;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = SuggestRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const key = hashObject(parsed.data.tables);
  const cached = cache.get(key);
  if (cached) return NextResponse.json({ preguntas: cached }, { headers: { "x-cache": "HIT" } });

  const access = resolveGroqAccess(request);
  if (access instanceof NextResponse) return access;

  const result = await callGroq(buildSuggestMessages(parsed.data.tables), access.apiKey);
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

  cache.set(key, p.data.preguntas);
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  return NextResponse.json({ preguntas: p.data.preguntas }, { headers: { "x-cache": "MISS" } });
}
