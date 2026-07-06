import type { SqlRequest } from "@/lib/llm-schema";

const SYSTEM_PROMPT = `Eres un asistente que traduce preguntas en lenguaje natural a consultas SQL para DuckDB.

Reglas estrictas:
1. Solo puedes generar una única sentencia SELECT o WITH ... SELECT de lectura. Nunca generes INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, ni ninguna otra operación.
2. Usa exactamente el nombre de tabla y de columnas indicados en el esquema. Encierra los nombres de columna entre comillas dobles.
3. Si la pregunta es ambigua y no puedes hacer una suposición razonable, responde pidiendo una aclaración en vez de adivinar.
4. Si sí generas SQL a partir de una suposición razonable (por ejemplo, interpretar "mejores" como mayor monto total), decláralo explícitamente en "interpretacion".
5. Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni bloques de código markdown.

Debes responder con EXACTAMENTE uno de estos dos formatos:

Si puedes generar la consulta:
{"tipo": "sql", "consulta": "SELECT ...", "interpretacion": "..."}

Si necesitas más información:
{"tipo": "aclaracion", "pregunta_al_usuario": "..."}`;

function schemaToText(schema: SqlRequest["schema"]): string {
  const columnLines = schema.columns.map((column) => {
    const values = column.categoricalValues
      ? ` (valores posibles: ${column.categoricalValues.join(", ")})`
      : "";
    return `- "${column.name}": ${column.type}${values}`;
  });

  const sampleLines = schema.sampleRows.slice(0, 5).map((row) => JSON.stringify(row));

  return [
    `Tabla: ${schema.tableName} (${schema.rowCount} filas totales)`,
    "Columnas:",
    ...columnLines,
    "Filas de muestra:",
    ...sampleLines,
  ].join("\n");
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function buildMessages(request: SqlRequest): ChatMessage[] {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT}\n\nEsquema de los datos disponibles:\n${schemaToText(request.schema)}`,
    },
    ...(request.history ?? []),
  ];

  if (request.failedSql) {
    messages.push({
      role: "user",
      content:
        `Mi pregunta original: "${request.question}"\n\n` +
        `Generaste este SQL, pero falló al ejecutarse:\n` +
        `SQL: ${request.failedSql.sql}\n` +
        `Error: ${request.failedSql.error}\n\n` +
        `Corrige el SQL y responde de nuevo en el formato JSON indicado.`,
    });
  } else {
    messages.push({ role: "user", content: request.question });
  }

  return messages;
}
