import { GROQ_KEY_HEADER, getStoredApiKey } from "@/lib/api-key";
import { LlmResponseSchema, type LlmResponse, type SqlRequest } from "@/lib/llm-schema";

/** Calls /api/sql and validates the shape of whatever comes back. */
export async function askQuestion(payload: SqlRequest): Promise<LlmResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // If the user brought their own key, forward it so the server uses it
  // instead of the shared key (and skips the shared rate limit).
  const apiKey = getStoredApiKey();
  if (apiKey) headers[GROQ_KEY_HEADER] = apiKey;

  const res = await fetch("/api/sql", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(
      typeof body?.error === "string" ? body.error : "El servicio no respondió correctamente.",
    );
  }

  const json = await res.json().catch(() => null);
  const parsed = LlmResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("El servicio devolvió una respuesta inválida.");
  }
  return parsed.data;
}
