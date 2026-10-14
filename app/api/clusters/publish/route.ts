// app/api/clusters/publish/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export async function POST(req: Request) {
  try {
    const {
      clusterId,
      text,
      source = "ai_draft",
    } = (await req.json()) as {
      clusterId?: string;
      text?: string;
      source?: "ai_draft" | "teacher_edited";
    };

    const cleanText = (text ?? "").trim();
    if (!clusterId || !cleanText) {
      return NextResponse.json(
        { error: "clusterId and explanation text are required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: cluster, error: clusterErr } = await admin
      .from("clusters")
      .select("id, lectures!inner(classes!inner(teacher_id))")
      .eq("id", clusterId)
      .single();

    if (clusterErr || !cluster) {
      return NextResponse.json({ error: "Cluster not found" }, { status: 404 });
    }

    const lectureObj = Array.isArray(cluster.lectures)
      ? cluster.lectures[0]
      : cluster.lectures;
    const classObj = Array.isArray(lectureObj?.classes)
      ? lectureObj.classes[0]
      : lectureObj?.classes;

    if (classObj?.teacher_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const validSource = source === "teacher_edited" ? "teacher_edited" : "ai_draft";
    const now = new Date().toISOString();

    // Upsert text into cluster_explanations (preserving existing audio/video URLs if present)
    const { data: existing } = await admin
      .from("cluster_explanations")
      .select("audio_url, video_url")
      .eq("cluster_id", clusterId)
      .maybeSingle();

    const { error: upsertErr } = await admin.from("cluster_explanations").upsert(
      {
        cluster_id: clusterId,
        text: cleanText,
        source: validSource,
        published_at: now,
        audio_url: existing?.audio_url ?? null,
        video_url: existing?.video_url ?? null,
      },
      { onConflict: "cluster_id" }
    );

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    await admin.from("clusters").update({ updated_at: now }).eq("id", clusterId);

    return NextResponse.json({ ok: true, published_at: now });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}