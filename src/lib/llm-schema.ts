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

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export const SqlRequestSchema = z.object({
  question: z.string().min(1).max(2000),
  // One or more loaded tables. Multiple tables enable cross-table joins.
  tables: z.array(TableSchemaInput).min(1).max(8),
  history: z.array(ChatMessageSchema).max(20).optional(),
  failedSql: z
    .object({
      sql: z.string(),
      error: z.string(),
    })
    .optional(),
});

export type SqlRequest = z.infer<typeof SqlRequestSchema>;

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
