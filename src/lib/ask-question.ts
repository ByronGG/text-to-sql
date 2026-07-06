import { LlmResponseSchema, type LlmResponse, type SqlRequest } from "@/lib/llm-schema";

/** Calls /api/sql and validates the shape of whatever comes back. */
export async function askQuestion(payload: SqlRequest): Promise<LlmResponse> {
  const res = await fetch("/api/sql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
