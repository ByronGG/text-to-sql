import { z } from "zod";

const ColumnSchemaInput = z.object({
  name: z.string(),
  type: z.string(),
  categoricalValues: z.array(z.string()).optional(),
});

const TableSchemaInput = z.object({
  tableName: z.string(),
  rowCount: z.number(),
  columns: z.array(ColumnSchemaInput),
  sampleRows: z.array(z.record(z.string(), z.unknown())),
});

const TablesInput = z.array(TableSchemaInput).min(1).max(8);

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export const SqlRequestSchema = z.object({
  question: z.string().min(1).max(2000),
  // One or more loaded tables. Multiple tables enable cross-table joins.
  tables: TablesInput,
  history: z.array(ChatMessageSchema).max(20).optional(),
  failedSql: z
    .object({
      sql: z.string(),
      error: z.string(),
    })
    .optional(),
});

export type SqlRequest = z.infer<typeof SqlRequestSchema>;

// Suggested-questions endpoint: schema in, a few natural-language questions out.
export const SuggestRequestSchema = z.object({ tables: TablesInput });
export const SuggestResponseSchema = z.object({
  preguntas: z.array(z.string().min(1)).min(1).max(6),
});

// Explain endpoint: a SQL query + schema in, a natural-language explanation out.
export const ExplainRequestSchema = z.object({
  sql: z.string().min(1).max(10_000),
  tables: TablesInput,
});
export const ExplainResponseSchema = z.object({ explicacion: z.string().min(1) });

// The LLM must answer with exactly one of these two shapes: a ready-to-run
// query, or a clarifying question when the request is too ambiguous to guess
// (the human-in-the-loop path).
export const LlmResponseSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("sql"),
    consulta: z.string().min(1),
    interpretacion: z.string(),
  }),
  z.object({
    tipo: z.literal("aclaracion"),
    pregunta_al_usuario: z.string().min(1),
  }),
]);

export type LlmResponse = z.infer<typeof LlmResponseSchema>;
