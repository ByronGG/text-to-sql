import { GROQ_KEY_HEADER, getStoredApiKey } from "@/lib/api-key";
import type { TableSchema } from "@/lib/csv-table";

/** POSTs JSON to an LLM route, attaching the user's BYOK key when present. */
export async function postLlm<T>(url: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = getStoredApiKey();
  if (apiKey) headers[GROQ_KEY_HEADER] = apiKey;

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (json as { error?: unknown } | null)?.error;
    throw new Error(typeof error === "string" ? error : "El servicio no respondió correctamente.");
  }
  return json as T;
}

/** Asks the model for a few natural-language questions this dataset can answer. */
export async function fetchSuggestions(tables: TableSchema[]): Promise<string[]> {
  const { preguntas } = await postLlm<{ preguntas: string[] }>("/api/suggest", { tables });
  return preguntas;
}

/** Asks the model to explain a SQL query in plain language. */
export async function fetchExplanation(sql: string, tables: TableSchema[]): Promise<string> {
  const { explicacion } = await postLlm<{ explicacion: string }>("/api/explain", { sql, tables });
  return explicacion;
}
