import { LlmResponseSchema, type LlmResponse, type SqlRequest } from "@/lib/llm-schema";
import { postLlm } from "@/lib/llm-client";

/** Calls /api/sql and validates the shape of whatever comes back. */
export async function askQuestion(payload: SqlRequest): Promise<LlmResponse> {
  const json = await postLlm<unknown>("/api/sql", payload);
  const parsed = LlmResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("El servicio devolvió una respuesta inválida.");
  }
  return parsed.data;
}
