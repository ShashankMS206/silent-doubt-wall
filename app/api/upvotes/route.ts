// app/api/upvotes/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getIp, isRateLimited } from "@/lib/rateLimit";

export async function POST(req: Request) {
  try {
    if (isRateLimited(`vote:${getIp(req)}`, 30, 60_000)) {
      return NextResponse.json(
        { error: "Too many votes, please wait a moment." },
        { status: 429 }
      );
    }

    const { code, clusterId, sessionId, kind } = (await req.json()) as {
      code?: string;
      clusterId?: string;
      sessionId?: string;
      kind?: "me_too" | "still_confused" | "understood";
    };

    const cleanCode = (code ?? "").trim().toUpperCase();
    const cleanSession = (sessionId ?? "").trim();

    if (
      !cleanCode ||
      !clusterId ||
      !cleanSession ||
      (kind !== "me_too" && kind !== "still_confused" && kind !== "understood")
    ) {
      return NextResponse.json({ error: "Invalid vote payload" }, { status: 400 });
    }

    const admin = createAdminClient();

    // 1. Verify cluster belongs to a class with this code
    const { data: cluster, error: clusterErr } = await admin
      .from("clusters")
      .select("id, status, lectures!inner(classes!inner(code, archived))")
      .eq("id", clusterId)
      .single();

    if (clusterErr || !cluster) {
      return NextResponse.json({ error: "Cluster not found" }, { status: 404 });
    }

    const lec = Array.isArray(cluster.lectures)
      ? cluster.lectures[0]
      : cluster.lectures;
    const cls = Array.isArray(lec?.classes) ? lec.classes[0] : lec?.classes;

    if (!cls || cls.code.toUpperCase() !== cleanCode || cls.archived) {
      return NextResponse.json({ error: "Invalid class code" }, { status: 403 });
    }

    // 2. Check if this vote already exists for this session
    const { data: existing } = await admin
      .from("upvotes")
      .select("id")
      .eq("cluster_id", clusterId)
      .eq("session_id", cleanSession)
      .eq("kind", kind)
      .maybeSingle();

    const now = new Date().toISOString();

    if (existing) {
      // Unselect (remove existing vote)
      const { error: delErr } = await admin
        .from("upvotes")
        .delete()
        .eq("id", existing.id);

      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      await admin
        .from("clusters")
        .update({ updated_at: now })
        .eq("id", clusterId);

      return NextResponse.json({ ok: true, action: "removed" });
    } else {
      // Select (add new vote)
      const { error: voteErr } = await admin.from("upvotes").insert({
        cluster_id: clusterId,
        session_id: cleanSession,
        kind,
      });

      if (voteErr && voteErr.code !== "23505") {
        return NextResponse.json({ error: voteErr.message }, { status: 500 });
      }

      const updatePayload: Record<string, string> = { updated_at: now };
      if (kind === "still_confused" && cluster.status === "addressed") {
        updatePayload.status = "open";
      }

      await admin.from("clusters").update(updatePayload).eq("id", clusterId);

      return NextResponse.json({ ok: true, action: "added" });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}