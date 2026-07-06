// Longest phrases first so e.g. "LEFT JOIN" matches as one unit instead of
// leaving "LEFT" dangling before a separately-matched "JOIN".
const CLAUSE_KEYWORDS = [
  "LEFT JOIN",
  "RIGHT JOIN",
  "INNER JOIN",
  "FULL JOIN",
  "GROUP BY",
  "ORDER BY",
  "UNION ALL",
  "SELECT",
  "FROM",
  "WHERE",
  "HAVING",
  "LIMIT",
  "JOIN",
  "UNION",
  "WITH",
];

const KEYWORD_PATTERN = new RegExp(
  `\\b(${CLAUSE_KEYWORDS.map((k) => k.replace(" ", "\\s+")).join("|")})\\b`,
  "gi",
);

// \0 can't legitimately appear in SQL source text, so it's a safe placeholder
// delimiter — unlike plain digits/spaces, it can't collide with an unrelated
// number already in the query (e.g. "LIMIT 5").
const PLACEHOLDER_PATTERN = /\0(\d+)\0/g;

/**
 * Breaks a SQL statement onto multiple lines at clause boundaries, purely
 * for display — SQL doesn't care about line breaks, so this never touches
 * the string actually sent to the engine.
 *
 * String/identifier literals are protected first so a value that happens to
 * contain a keyword-like substring (e.g. a column literally named "from")
 * is never split mid-literal.
 */
export function formatSqlForDisplay(sql: string): string {
  const literals: string[] = [];
  const withoutLiterals = sql.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, (match) => {
    literals.push(match);
    return `\0${literals.length - 1}\0`;
  });

  const withBreaks = withoutLiterals
    .replace(KEYWORD_PATTERN, (match, _group, offset) => (offset === 0 ? match : `\n${match}`))
    .trim();

  return withBreaks.replace(PLACEHOLDER_PATTERN, (_match, index) => literals[Number(index)]);
}
