// app/api/student/clusters/route.ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = (searchParams.get("code") ?? "").trim().toUpperCase();
    const lectureId = (searchParams.get("lectureId") ?? "").trim();
    const sessionId = (searchParams.get("sessionId") ?? "").trim();

    if (!code || !lectureId) {
      return NextResponse.json(
        { error: "code and lectureId are required" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data: lecture, error: lecErr } = await admin
      .from("lectures")
      .select("id, classes!inner(id, code, archived)")
      .eq("id", lectureId)
      .single();

    if (lecErr || !lecture) {
      return NextResponse.json({ error: "Lecture not found" }, { status: 404 });
    }

    const cls = Array.isArray(lecture.classes)
      ? lecture.classes[0]
      : lecture.classes;

    if (!cls || cls.code.toUpperCase() !== code || cls.archived) {
      return NextResponse.json({ error: "Invalid class code" }, { status: 403 });
    }

    const { data: rawClusters, error: clustErr } = await admin
      .from("clusters")
      .select("id, label, status, created_at, updated_at")
      .eq("lecture_id", lectureId);

    if (clustErr) {
      return NextResponse.json({ error: clustErr.message }, { status: 500 });
    }

    const clusterIds = (rawClusters ?? []).map((c) => c.id);
    if (clusterIds.length === 0) {
      return NextResponse.json({ clusters: [], myVotes: [] });
    }

    const [doubtsRes, upvotesRes, explanationsRes, myVotesRes] = await Promise.all([
      admin.from("doubts").select("id, cluster_id").in("cluster_id", clusterIds),
      admin.from("upvotes").select("cluster_id, kind").in("cluster_id", clusterIds),
      admin
        .from("cluster_explanations")
        .select("cluster_id, text, published_at, audio_url, video_url")
        .in("cluster_id", clusterIds)
        .order("published_at", { ascending: false }),
      sessionId
        ? admin
            .from("upvotes")
            .select("cluster_id, kind")
            .eq("session_id", sessionId)
            .in("cluster_id", clusterIds)
        : Promise.resolve({ data: [] }),
    ]);

    const doubtsList = doubtsRes.data ?? [];
    const upvotesList = upvotesRes.data ?? [];
    const explanationsList = explanationsRes.data ?? [];

    const clusters = (rawClusters ?? [])
      .map((c) => {
        const doubt_count = doubtsList.filter((d) => d.cluster_id === c.id).length;
        const me_too_count = upvotesList.filter(
          (u) => u.cluster_id === c.id && u.kind === "me_too"
        ).length;
        const still_confused_count = upvotesList.filter(
          (u) => u.cluster_id === c.id && u.kind === "still_confused"
        ).length;
        const understood_count = upvotesList.filter(
          (u) => u.cluster_id === c.id && u.kind === "understood"
        ).length;

        const latestExp = explanationsList.find((e) => e.cluster_id === c.id);
        const score = doubt_count + me_too_count + 2 * still_confused_count;

        return {
          id: c.id,
          label: c.label,
          status: c.status,
          doubt_count,
          me_too_count,
          still_confused_count,
          understood_count,
          score,
          published_explanation: latestExp?.text ?? null,
          audio_url: latestExp?.audio_url ?? null,
          video_url: latestExp?.video_url ?? null,
          updated_at: c.updated_at ?? c.created_at,
        };
      })
      .sort((a, b) => b.score - a.score);

    return NextResponse.json({
      clusters,
      myVotes: myVotesRes.data ?? [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}