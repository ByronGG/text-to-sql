import { NextResponse } from "next/server";
import { z } from "zod";
import { friendlyPgError, runPgQuery } from "@/lib/pg-server";
import { SqlValidationError } from "@/lib/sql-guard";

const RequestSchema = z.object({
  connectionString: z.string().min(1).max(2000),
  sql: z.string().min(1).max(10_000),
  allowedTables: z.array(z.string()).max(50).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const { connectionString, sql, allowedTables } = parsed.data;
  try {
    const result = await runPgQuery(connectionString, sql, allowedTables);
    return NextResponse.json(result);
  } catch (err) {
    // A guard rejection is a client-side validation error, not a DB failure.
    if (err instanceof SqlValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: friendlyPgError(err) }, { status: 502 });
  }
}
