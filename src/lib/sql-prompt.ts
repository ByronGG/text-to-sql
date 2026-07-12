import type { Lang, SqlRequest } from "@/lib/llm-schema";

// The JSON contract (keys tipo/consulta/interpretacion/pregunta_al_usuario) is
// identical across languages — only the natural-language *content* the model
// writes into those fields switches. `lang` defaults to Spanish.
const SYSTEM_PROMPT: Record<Lang, string> = {
  es: `Eres un asistente que traduce preguntas en lenguaje natural a consultas SQL para DuckDB.

Reglas estrictas:
1. Solo puedes generar una única sentencia SELECT o WITH ... SELECT de lectura. Nunca generes INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, ni ninguna otra operación.
2. Usa exactamente los nombres de tabla y de columnas indicados en el esquema. Encierra los nombres de columna entre comillas dobles. Solo puedes consultar las tablas listadas en el esquema; no inventes tablas.
3. Puede haber varias tablas. Si la pregunta necesita datos de más de una, combínalas con JOIN usando columnas que representen la misma entidad (guíate por las relaciones sugeridas más abajo, si las hay). Cuando dos tablas tienen columnas con el mismo nombre, califícalas con el nombre de la tabla (por ejemplo "ventas"."cliente_id") para evitar ambigüedad.
4. Si la pregunta es ambigua y no puedes hacer una suposición razonable, responde pidiendo una aclaración en vez de adivinar.
5. Si sí generas SQL a partir de una suposición razonable (por ejemplo, interpretar "mejores" como mayor monto total), decláralo explícitamente en "interpretacion".
6. Si hay preguntas previas en la conversación, la nueva pregunta puede ser un seguimiento que se apoya en ellas (p. ej. "y ahora solo los de CDMX" reutiliza los filtros y columnas de la consulta anterior). Considera ese contexto al generar el SQL.
7. Escribe los textos de "interpretacion" y "pregunta_al_usuario" en español.
8. Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni bloques de código markdown.

Debes responder con EXACTAMENTE uno de estos dos formatos:

Si puedes generar la consulta:
{"tipo": "sql", "consulta": "SELECT ...", "interpretacion": "..."}

Si necesitas más información:
{"tipo": "aclaracion", "pregunta_al_usuario": "..."}`,
  en: `You are an assistant that translates natural-language questions into SQL queries for DuckDB.

Strict rules:
1. You may only generate a single read-only SELECT or WITH ... SELECT statement. Never generate INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, or any other operation.
2. Use exactly the table and column names given in the schema. Wrap column names in double quotes. You may only query the tables listed in the schema; do not invent tables.
3. There may be several tables. If the question needs data from more than one, combine them with JOINs using columns that represent the same entity (follow the suggested relationships below, if any). When two tables have columns with the same name, qualify them with the table name (for example "ventas"."cliente_id") to avoid ambiguity.
4. If the question is ambiguous and you cannot make a reasonable assumption, respond by asking for a clarification instead of guessing.
5. If you do generate SQL from a reasonable assumption (for example, interpreting "best" as highest total amount), state it explicitly in "interpretacion".
6. If there are previous questions in the conversation, the new question may be a follow-up that builds on them (e.g. "and now only the ones from CDMX" reuses the filters and columns of the previous query). Take that context into account when generating the SQL.
7. Write the "interpretacion" and "pregunta_al_usuario" texts in English.
8. Respond ONLY with a valid JSON object, with no extra text or markdown code blocks.

You must respond with EXACTLY one of these two formats:

If you can generate the query:
{"tipo": "sql", "consulta": "SELECT ...", "interpretacion": "..."}

If you need more information:
{"tipo": "aclaracion", "pregunta_al_usuario": "..."}`,
};

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

/** Renders all tables (columns, samples, join hints) as prompt context. */
export function describeTables(tables: TableInput[]): string {
  return tables.map(tableToText).join("\n\n") + joinHints(tables);
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const SCHEMA_LABEL: Record<Lang, string> = {
  es: "Esquema de los datos disponibles",
  en: "Schema of the available data",
};

function failedSqlMessage(lang: Lang, question: string, sql: string, error: string): string {
  if (lang === "en") {
    return (
      `My original question: "${question}"\n\n` +
      `You generated this SQL, but it failed to run:\n` +
      `SQL: ${sql}\n` +
      `Error: ${error}\n\n` +
      `Fix the SQL and respond again in the indicated JSON format.`
    );
  }
  return (
    `Mi pregunta original: "${question}"\n\n` +
    `Generaste este SQL, pero falló al ejecutarse:\n` +
    `SQL: ${sql}\n` +
    `Error: ${error}\n\n` +
    `Corrige el SQL y responde de nuevo en el formato JSON indicado.`
  );
}

export function buildMessages(request: SqlRequest): ChatMessage[] {
  const lang = request.lang ?? "es";
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT[lang]}\n\n${SCHEMA_LABEL[lang]}:\n${describeTables(request.tables)}`,
    },
    ...(request.history ?? []),
  ];

  if (request.failedSql) {
    messages.push({
      role: "user",
      content: failedSqlMessage(lang, request.question, request.failedSql.sql, request.failedSql.error),
    });
  } else {
    messages.push({ role: "user", content: request.question });
  }

  return messages;
}

const SUGGEST_PROMPT: Record<Lang, string> = {
  es: `Eres un analista de datos. A partir del esquema, propón preguntas de negocio útiles e interesantes que se puedan responder ÚNICAMENTE con estos datos. Deben ser concretas, variadas (una agregación, una comparación, un ranking/top, y si hay fechas una tendencia) y estar en español, cortas y en lenguaje natural (sin SQL). No inventes columnas ni tablas. Si hay varias tablas, incluye al menos una que las combine.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, con entre 3 y 5 preguntas:
{"preguntas": ["...", "..."]}`,
  en: `You are a data analyst. From the schema, propose useful and interesting business questions that can be answered USING ONLY this data. They must be concrete, varied (an aggregation, a comparison, a ranking/top, and if there are dates a trend), in English, short, and in natural language (no SQL). Do not invent columns or tables. If there are several tables, include at least one that combines them.

Respond ONLY with a valid JSON object, with no extra text, with between 3 and 5 questions:
{"preguntas": ["...", "..."]}`,
};

export function buildSuggestMessages(tables: TableInput[], lang: Lang = "es"): ChatMessage[] {
  return [
    { role: "system", content: `${SUGGEST_PROMPT[lang]}\n\n${SCHEMA_LABEL[lang]}:\n${describeTables(tables)}` },
  ];
}

const FOLLOWUP_PROMPT: Record<Lang, string> = {
  es: `Eres un analista de datos. El usuario acaba de ejecutar una consulta y quiere seguir explorando. A partir del esquema, su pregunta anterior y el SQL que la respondió, propón entre 2 y 3 preguntas de seguimiento que refinen o profundicen esa consulta: filtrar por un valor, cambiar o añadir una agrupación, desglosar por fecha, ordenar distinto, o comparar contra otro grupo o periodo. Deben poder responderse ÚNICAMENTE con estos datos, ser cortas y en lenguaje natural (sin SQL), estar en español y ser claramente distintas de la pregunta anterior. No inventes columnas ni tablas.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, con entre 2 y 3 preguntas:
{"preguntas": ["...", "..."]}`,
  en: `You are a data analyst. The user just ran a query and wants to keep exploring. From the schema, their previous question, and the SQL that answered it, propose 2 to 3 follow-up questions that refine or drill into that query: filter by a value, change or add a grouping, break it down by date, sort differently, or compare against another group or period. They must be answerable USING ONLY this data, short and in natural language (no SQL), in English, and clearly different from the previous question. Do not invent columns or tables.

Respond ONLY with a valid JSON object, with no extra text, with between 2 and 3 questions:
{"preguntas": ["...", "..."]}`,
};

export function buildFollowUpMessages(
  question: string,
  sql: string,
  tables: TableInput[],
  lang: Lang = "es",
): ChatMessage[] {
  const userContent =
    lang === "en"
      ? `Previous question: "${question}"\nSQL that answered it:\n${sql}`
      : `Pregunta anterior: "${question}"\nSQL que la respondió:\n${sql}`;
  return [
    { role: "system", content: `${FOLLOWUP_PROMPT[lang]}\n\n${SCHEMA_LABEL[lang]}:\n${describeTables(tables)}` },
    { role: "user", content: userContent },
  ];
}

const EXPLAIN_PROMPT: Record<Lang, string> = {
  es: `Eres un experto en SQL que explica consultas a personas de negocio. Explica en español, en 2 a 4 frases claras y sin jerga innecesaria, qué hace la consulta y qué resultado devuelve, en términos del negocio (no repitas el SQL línea por línea).

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional:
{"explicacion": "..."}`,
  en: `You are a SQL expert who explains queries to business people. Explain in English, in 2 to 4 clear sentences without unnecessary jargon, what the query does and what result it returns, in business terms (do not repeat the SQL line by line).

Respond ONLY with a valid JSON object, with no extra text:
{"explicacion": "..."}`,
};

export function buildExplainMessages(sql: string, tables: TableInput[], lang: Lang = "es"): ChatMessage[] {
  const userPrompt = lang === "en" ? "Explain this SQL query" : "Explica esta consulta SQL";
  return [
    { role: "system", content: `${EXPLAIN_PROMPT[lang]}\n\n${SCHEMA_LABEL[lang]}:\n${describeTables(tables)}` },
    { role: "user", content: `${userPrompt}:\n${sql}` },
  ];
}
