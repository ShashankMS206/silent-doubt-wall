import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getIp, isRateLimited } from "@/lib/rateLimit";

export async function GET(request: Request) {
  // Limit code guessing: 30 lookups per minute per IP
  if (isRateLimited(`class:${getIp(request)}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const code = new URL(request.url).searchParams.get("code")?.toUpperCase() ?? "";
  if (!/^[A-Z2-9]{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid class code" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: cls } = await admin
    .from("classes")
    .select("id, name")
    .eq("code", code)
    .eq("archived", false)
    .maybeSingle();

  if (!cls) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 });
  }

  const { data: lectures } = await admin
    .from("lectures")
    .select("id, title")
    .eq("class_id", cls.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ name: cls.name, lectures: lectures ?? [] });
}