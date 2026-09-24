import { NextResponse } from "next/server";

// Unauthenticated and data-free: see src/proxy.ts's matcher exclusion.
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
