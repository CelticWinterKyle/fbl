import { NextResponse } from "next/server";
import { readLogRaw } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { date: string } }) {
  const date = params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  const raw = readLogRaw(date);
  if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(raw, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename=ai-${date}.jsonl`
    }
  });
}
