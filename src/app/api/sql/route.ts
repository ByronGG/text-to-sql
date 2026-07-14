import { NextResponse } from "next/server";
import { callGroq, extractJson, groqErrorResponse, resolveGroqAccess } from "@/lib/api-groq";
import { LlmResponseSchema, SqlRequestSchema } from "@/lib/llm-schema";
import { cacheKey, getCached, isCacheable, setCached } from "@/lib/sql-cache";
import { buildMessages } from "@/lib/sql-prompt";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = SqlRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  // Cache check comes first: a hit is free (no Groq call), so it should neither
  // consume the rate limit nor require a key.
  const key = isCacheable(parsed.data) ? cacheKey(parsed.data) : undefined;
  if (key) {
    const cached = await getCached(key);
    if (cached) return NextResponse.json(cached, { headers: { "x-cache": "HIT" } });
  }

  const access = await resolveGroqAccess(request);
  if (access instanceof NextResponse) return access;

  const result = await callGroq(buildMessages(parsed.data), access.apiKey);
  if (!result.ok) return groqErrorResponse(result, access.clientKey);

  let rawJson: unknown;
  try {
    rawJson = extractJson(result.content);
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

  if (key) await setCached(key, llmParsed.data);
  return NextResponse.json(llmParsed.data, { headers: { "x-cache": "MISS" } });
}
