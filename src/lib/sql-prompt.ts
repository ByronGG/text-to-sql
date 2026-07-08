import type { SqlRequest } from "@/lib/llm-schema";

const SYSTEM_PROMPT = `Eres un asistente que traduce preguntas en lenguaje natural a consultas SQL para DuckDB.

Reglas estrictas:
1. Solo puedes generar una única sentencia SELECT o WITH ... SELECT de lectura. Nunca generes INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, ni ninguna otra operación.
2. Usa exactamente los nombres de tabla y de columnas indicados en el esquema. Encierra los nombres de columna entre comillas dobles. Solo puedes consultar las tablas listadas en el esquema; no inventes tablas.
3. Puede haber varias tablas. Si la pregunta necesita datos de más de una, combínalas con JOIN usando columnas que representen la misma entidad (guíate por las relaciones sugeridas más abajo, si las hay). Cuando dos tablas tienen columnas con el mismo nombre, califícalas con el nombre de la tabla (por ejemplo "ventas"."cliente_id") para evitar ambigüedad.
4. Si la pregunta es ambigua y no puedes hacer una suposición razonable, responde pidiendo una aclaración en vez de adivinar.
5. Si sí generas SQL a partir de una suposición razonable (por ejemplo, interpretar "mejores" como mayor monto total), decláralo explícitamente en "interpretacion".
6. Si hay preguntas previas en la conversación, la nueva pregunta puede ser un seguimiento que se apoya en ellas (p. ej. "y ahora solo los de CDMX" reutiliza los filtros y columnas de la consulta anterior). Considera ese contexto al generar el SQL.
7. Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni bloques de código markdown.

Debes responder con EXACTAMENTE uno de estos dos formatos:

Si puedes generar la consulta:
{"tipo": "sql", "consulta": "SELECT ...", "interpretacion": "..."}

Si necesitas más información:
{"tipo": "aclaracion", "pregunta_al_usuario": "..."}`;

type TableInput = SqlRequest["tables"][number];

function tableToText(table: TableInput): string {
  const columnLines = table.columns.map((column) => {
    const values = column.categoricalValues
      ? ` (valores posibles: ${column.categoricalValues.join(", ")})`
      : "";
    return `- "${column.name}": ${column.type}${values}`;
  });

  const sampleLines = table.sampleRows.slice(0, 5).map((row) => JSON.stringify(row));

  return [
    `Tabla "${table.tableName}" (${table.rowCount} filas totales)`,
    "Columnas:",
    ...columnLines,
    "Filas de muestra:",
    ...sampleLines,
  ].join("\n");
}

// Columns that appear in more than one table are likely join keys. Surfacing
// them (with the tables they live in) nudges the model toward correct JOINs
// without hard-coding any relationship.
function joinHints(tables: TableInput[]): string {
  if (tables.length < 2) return "";

  const tablesByColumn = new Map<string, string[]>();
  for (const table of tables) {
    for (const column of table.columns) {
      const list = tablesByColumn.get(column.name) ?? [];
      list.push(table.tableName);
      tablesByColumn.set(column.name, list);
    }
  }

  const shared = [...tablesByColumn.entries()].filter(([, names]) => names.length > 1);
  if (shared.length === 0) return "";

  const lines = shared.map(
    ([column, names]) => `- "${column}" aparece en: ${names.join(", ")}`,
  );
  return [
    "",
    "Relaciones sugeridas (columnas con el mismo nombre en varias tablas, posibles llaves de JOIN):",
    ...lines,
  ].join("\n");
}

function schemaToText(tables: TableInput[]): string {
  return tables.map(tableToText).join("\n\n") + joinHints(tables);
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function buildMessages(request: SqlRequest): ChatMessage[] {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT}\n\nEsquema de los datos disponibles:\n${schemaToText(request.tables)}`,
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
