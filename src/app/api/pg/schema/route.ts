import { NextResponse } from "next/server";
import { z } from "zod";
import { friendlyPgError, introspectSchema } from "@/lib/pg-server";

const RequestSchema = z.object({
  connectionString: z.string().min(1).max(2000),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  try {
    const tables = await introspectSchema(parsed.data.connectionString);
    if (tables.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron tablas legibles en el esquema public." },
        { status: 400 },
      );
    }
    return NextResponse.json({ tables });
  } catch (err) {
    return NextResponse.json({ error: friendlyPgError(err) }, { status: 502 });
  }
}
