"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Lang = "es" | "en";

const STORAGE_KEY = "askql-lang";

// ---------------------------------------------------------------------------
// Message dictionaries. `es` is the source of truth; `en` must match its shape
// (enforced by `Messages = typeof es`). Values are plain strings, functions for
// interpolation/plurals, or ReactNode for the few rich (code/link) strings.
// ---------------------------------------------------------------------------

const es = {
  locale: "es-MX",
  langToggle: { label: "Idioma", es: "ES", en: "EN" },

  nav: {
    dashboard: (n: number) => `Tablero${n > 0 ? ` (${n})` : ""}`,
    back: "Volver",
  },

  home: {
    title: "Pregúntale a tus datos",
    subtitle:
      "Sube uno o varios archivos (CSV o Excel) o conéctate a una base Postgres, y " +
      "pregunta en lenguaje natural. AskQL traduce tu pregunta a SQL —incluyendo " +
      "joins entre tablas—, la ejecuta y te devuelve los resultados en una tabla " +
      "lista para exportar a Excel.",
    sectionData: "DATOS",
    sectionQuery: "CONSULTA",
    modeFile: "Archivo",
    modePostgres: "Postgres",
    loadingSample: "Cargando datos de ejemplo…",
    sharedNotice: (q: string) =>
      `Recibiste una consulta compartida: «${q}». Sube tu archivo para ejecutarla.`,
    addAnotherFile: "AGREGAR OTRO ARCHIVO",
    connected: (n: number) => `CONECTADO · ${n} tabla${n === 1 ? "" : "s"}`,
    disconnect: "Desconectar",
  },

  disclaimer: {
    fileTitle: "Tus datos no salen de tu navegador",
    fileBody:
      "Tu archivo se procesa localmente con DuckDB. Solo el esquema (nombres y " +
      "tipos de columnas) se envía al modelo para generar el SQL — nunca tus " +
      "datos ni sus filas. No se sube ni se guarda nada en ningún servidor.",
    pgTitle: "Modo Postgres: tus datos sí salen del navegador",
    pgBody: (
      <>
        Las consultas se ejecutan en el servidor contra tu base de datos. Se aplican
        solo lectura (transacción <code className="font-mono text-xs">READ ONLY</code>),
        límite de filas y timeout, pero aun así conéctate con un usuario de{" "}
        <strong>solo lectura</strong>. La cadena de conexión se envía al servidor en
        cada consulta y no se guarda.
      </>
    ) as ReactNode,
  },

  upload: {
    errorProcess: (msg: string) => `No se pudo procesar el archivo: ${msg}`,
    errorProcessGeneric: "No se pudo procesar el archivo.",
    errorNoSheets: "El archivo de Excel no tiene hojas.",
    errorReadExcel: (msg: string) => `No se pudo leer el Excel: ${msg}`,
    errorReadExcelGeneric: "No se pudo leer el archivo de Excel.",
    sheetPrompt: (name: string) => `${name} tiene varias hojas. ¿Cuál quieres analizar?`,
    cancel: "Cancelar",
    dropHere: "Suelta tu archivo aquí",
    dragPrompt: "Arrastra tu CSV o Excel aquí, o",
    processing: "Procesando…",
    chooseFile: "Elegir archivo",
    useSample: "Usar datos de ejemplo",
    errorSample: "No se pudo cargar el ejemplo.",
  },

  schema: {
    rowsCols: (rows: string, cols: number) => `${rows} filas · ${cols} columnas`,
    remove: "Quitar",
    columnsDetected: "Columnas detectadas",
    values: (n: number) => `${n} valores`,
    dataSample: "Muestra de datos",
  },

  console: {
    placeholderFollowup: "Pregunta de seguimiento… (ej. y ahora solo los de Monterrey)",
    placeholderInitial: "Ej. ¿Quiénes son mis mejores clientes de agosto?",
    thinking: "Pensando…",
    ask: "Preguntar",
    tryWith: "PRUEBA CON",
    followUpWith: "CONTINÚA CON",
    conversation: "CONVERSACIÓN",
    clear: "Limpiar",
    generating: "Generando la consulta…",
    correcting: (attempt: number, total: number) =>
      `Corrigiendo la consulta (intento ${attempt} de ${total})…`,
    errorTitle: "No se pudo completar la consulta",
    hideSql: "Ocultar SQL",
    showSql: "Ver SQL generado",
    explaining: "Explicando…",
    explain: "Explicar",
    pinned: "En el tablero",
    pin: "Fijar al tablero",
    linkCopied: "Enlace copiado",
    share: "Compartir",
    running: "Ejecutando…",
    runSql: "Ejecutar SQL",
    cancel: "Cancelar",
    editRerun: "Editar y re-ejecutar",
    needContext: "Necesito más contexto",
    yourAnswer: "Tu respuesta…",
    respond: "Responder",
    resultsFileBase: "resultados",
    editedSuffix: "SQL editado",
    editedInterpretation: "Consulta editada manualmente.",
    errorService: "No se pudo contactar el servicio.",
    errorUnknown: "Error desconocido.",
    errorInvalidQuery: (msg: string) => `No se pudo generar una consulta válida: ${msg}`,
    errorSqlRun: "El SQL no se pudo ejecutar.",
    errorExplain: "No se pudo explicar la consulta.",
    combinedQuestion: (orig: string, clar: string, ans: string) =>
      `Pregunta original: "${orig}"\n` +
      `Aclaración pedida: "${clar}"\n` +
      `Respuesta del usuario: "${ans}"`,
  },

  results: {
    rows: (formatted: string, count: number) => `${formatted} fila${count === 1 ? "" : "s"}`,
    truncated: " · truncado a 1,000",
    summaryLabel: "Resumen",
    chartLabel: "Gráfica",
    tableLabel: "Tabla",
    page: (i: number, n: number) => `Página ${i} de ${n}`,
    prev: "Anterior",
    next: "Siguiente",
    csv: "CSV",
    excel: "Excel",
  },

  pg: {
    connString: "Cadena de conexión",
    placeholder: "postgresql://usuario:contraseña@host:5432/basededatos",
    hint: (
      <>
        Se introspecta el esquema <code className="font-mono">public</code>. Para bases
        gestionadas (Supabase, Neon, RDS) agrega{" "}
        <code className="font-mono">?sslmode=require</code>.
      </>
    ) as ReactNode,
    connecting: "Conectando…",
    connect: "Conectar",
    errorConnect: "No se pudo conectar.",
  },

  apiKey: {
    apiKey: "API key",
    activeTitle: "Estás usando tu propia API key",
    active: "activa",
    dialogTitle: "Tu propia API key de Groq",
    description:
      "Opcional. Con tu propia key las consultas usan tu cuota de Groq y no el " +
      "límite compartido de la demo. Se guarda solo en este navegador y se envía " +
      "a nuestro proxy únicamente para llamar a Groq; no la almacenamos en el " +
      "servidor.",
    placeholderHasKey: "•••••••• (hay una key guardada)",
    placeholderNew: "gsk_…",
    hint: (
      <>
        Consíguela gratis en{" "}
        <a
          href="https://console.groq.com/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-4 hover:underline"
        >
          console.groq.com/keys
        </a>
        .
      </>
    ) as ReactNode,
    removeKey: "Quitar key",
    save: "Guardar",
  },

  dashboard: {
    brand: "AskQL · TABLERO",
    title: "Tablero de resultados",
    clearBoard: "Limpiar tablero",
    description:
      "Los resultados que fijas desde una consulta quedan aquí como tarjetas — " +
      "reordénalas y expórtalas. Se guardan en tu navegador.",
    empty: (pin: ReactNode) => (
      <>
        Aún no has fijado resultados. En una consulta, usa {pin} y aparecerán aquí.
      </>
    ),
    pinLabel: "Fijar al tablero",
    up: "Subir",
    down: "Bajar",
    remove: "Quitar",
    sql: "SQL",
    resultFileBase: "resultado",
  },
};

type Messages = typeof es;

const en: Messages = {
  locale: "en-US",
  langToggle: { label: "Language", es: "ES", en: "EN" },

  nav: {
    dashboard: (n: number) => `Dashboard${n > 0 ? ` (${n})` : ""}`,
    back: "Back",
  },

  home: {
    title: "Ask your data",
    subtitle:
      "Upload one or more files (CSV or Excel) or connect a Postgres database, and " +
      "ask in natural language. AskQL turns your question into SQL —including joins " +
      "across tables—, runs it, and returns the results in a table ready to export " +
      "to Excel.",
    sectionData: "DATA",
    sectionQuery: "QUERY",
    modeFile: "File",
    modePostgres: "Postgres",
    loadingSample: "Loading sample data…",
    sharedNotice: (q: string) =>
      `You received a shared query: «${q}». Upload your file to run it.`,
    addAnotherFile: "ADD ANOTHER FILE",
    connected: (n: number) => `CONNECTED · ${n} table${n === 1 ? "" : "s"}`,
    disconnect: "Disconnect",
  },

  disclaimer: {
    fileTitle: "Your data never leaves your browser",
    fileBody:
      "Your file is processed locally with DuckDB. Only the schema (column names " +
      "and types) is sent to the model to generate the SQL — never your data or its " +
      "rows. Nothing is uploaded or stored on any server.",
    pgTitle: "Postgres mode: your data does leave the browser",
    pgBody: (
      <>
        Queries run on the server against your database. Read-only is enforced (a{" "}
        <code className="font-mono text-xs">READ ONLY</code> transaction), plus a row
        limit and timeout, but even so connect with a <strong>read-only</strong> user.
        The connection string is sent to the server with each query and is not stored.
      </>
    ),
  },

  upload: {
    errorProcess: (msg: string) => `Could not process the file: ${msg}`,
    errorProcessGeneric: "Could not process the file.",
    errorNoSheets: "The Excel file has no sheets.",
    errorReadExcel: (msg: string) => `Could not read the Excel file: ${msg}`,
    errorReadExcelGeneric: "Could not read the Excel file.",
    sheetPrompt: (name: string) => `${name} has several sheets. Which one do you want to analyze?`,
    cancel: "Cancel",
    dropHere: "Drop your file here",
    dragPrompt: "Drag your CSV or Excel here, or",
    processing: "Processing…",
    chooseFile: "Choose file",
    useSample: "Use sample data",
    errorSample: "Could not load the sample.",
  },

  schema: {
    rowsCols: (rows: string, cols: number) => `${rows} rows · ${cols} columns`,
    remove: "Remove",
    columnsDetected: "Detected columns",
    values: (n: number) => `${n} values`,
    dataSample: "Data sample",
  },

  console: {
    placeholderFollowup: "Follow-up question… (e.g. now only the ones from Monterrey)",
    placeholderInitial: "E.g. Who are my best customers in August?",
    thinking: "Thinking…",
    ask: "Ask",
    tryWith: "TRY",
    followUpWith: "CONTINUE WITH",
    conversation: "CONVERSATION",
    clear: "Clear",
    generating: "Generating the query…",
    correcting: (attempt: number, total: number) =>
      `Fixing the query (attempt ${attempt} of ${total})…`,
    errorTitle: "Could not complete the query",
    hideSql: "Hide SQL",
    showSql: "View generated SQL",
    explaining: "Explaining…",
    explain: "Explain",
    pinned: "On the dashboard",
    pin: "Pin to dashboard",
    linkCopied: "Link copied",
    share: "Share",
    running: "Running…",
    runSql: "Run SQL",
    cancel: "Cancel",
    editRerun: "Edit and re-run",
    needContext: "I need more context",
    yourAnswer: "Your answer…",
    respond: "Respond",
    resultsFileBase: "results",
    editedSuffix: "edited SQL",
    editedInterpretation: "Manually edited query.",
    errorService: "Could not reach the service.",
    errorUnknown: "Unknown error.",
    errorInvalidQuery: (msg: string) => `Could not generate a valid query: ${msg}`,
    errorSqlRun: "The SQL could not be executed.",
    errorExplain: "Could not explain the query.",
    combinedQuestion: (orig: string, clar: string, ans: string) =>
      `Original question: "${orig}"\n` +
      `Clarification requested: "${clar}"\n` +
      `User's answer: "${ans}"`,
  },

  results: {
    rows: (formatted: string, count: number) => `${formatted} row${count === 1 ? "" : "s"}`,
    truncated: " · truncated to 1,000",
    summaryLabel: "Summary",
    chartLabel: "Chart",
    tableLabel: "Table",
    page: (i: number, n: number) => `Page ${i} of ${n}`,
    prev: "Previous",
    next: "Next",
    csv: "CSV",
    excel: "Excel",
  },

  pg: {
    connString: "Connection string",
    placeholder: "postgresql://user:password@host:5432/database",
    hint: (
      <>
        The <code className="font-mono">public</code> schema is introspected. For managed
        databases (Supabase, Neon, RDS) add{" "}
        <code className="font-mono">?sslmode=require</code>.
      </>
    ),
    connecting: "Connecting…",
    connect: "Connect",
    errorConnect: "Could not connect.",
  },

  apiKey: {
    apiKey: "API key",
    activeTitle: "You're using your own API key",
    active: "active",
    dialogTitle: "Your own Groq API key",
    description:
      "Optional. With your own key, queries use your Groq quota instead of the " +
      "demo's shared limit. It's stored only in this browser and sent to our proxy " +
      "only to call Groq; we don't store it on the server.",
    placeholderHasKey: "•••••••• (a key is saved)",
    placeholderNew: "gsk_…",
    hint: (
      <>
        Get one for free at{" "}
        <a
          href="https://console.groq.com/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-4 hover:underline"
        >
          console.groq.com/keys
        </a>
        .
      </>
    ),
    removeKey: "Remove key",
    save: "Save",
  },

  dashboard: {
    brand: "AskQL · DASHBOARD",
    title: "Results dashboard",
    clearBoard: "Clear dashboard",
    description:
      "Results you pin from a query stay here as cards — reorder and export them. " +
      "They're saved in your browser.",
    empty: (pin: ReactNode) => (
      <>You haven&apos;t pinned any results yet. In a query, use {pin} and they&apos;ll show up here.</>
    ),
    pinLabel: "Pin to dashboard",
    up: "Move up",
    down: "Move down",
    remove: "Remove",
    sql: "SQL",
    resultFileBase: "result",
  },
};

const dictionaries: Record<Lang, Messages> = { es, en };

// ---------------------------------------------------------------------------
// Context + hooks
// ---------------------------------------------------------------------------

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Always start at "es" so the server render and first client render agree;
  // the stored preference is applied in an effect after hydration.
  const [lang, setLangState] = useState<Lang>("es");

  // localStorage is client-only; read the saved preference after mount so the
  // initial render matches the server ("es"). setState-in-effect is intended.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "es" || stored === "en") {
      setLangState(stored);
      document.documentElement.lang = stored;
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
  }, []);

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>
  );
}

export function useLang(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used within a LanguageProvider");
  return ctx;
}

/** Returns the message dictionary for the active language. */
export function useT(): Messages {
  return dictionaries[useLang().lang];
}

/** Segmented ES / EN toggle for the header. */
export function LanguageToggle() {
  const { lang, setLang } = useLang();
  const t = dictionaries[lang];
  return (
    <div
      className="inline-flex rounded-md border border-border p-0.5"
      role="group"
      aria-label={t.langToggle.label}
    >
      {(["es", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={
            "rounded px-1.5 py-0.5 text-xs font-mono transition-colors " +
            (lang === l
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          {t.langToggle[l]}
        </button>
      ))}
    </div>
  );
}
