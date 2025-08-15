import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ error: "Read only mode" }, { status: 405 });
}
