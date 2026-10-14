// app/api/teacher/history/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const classId = (searchParams.get("classId") ?? "").trim();

    if (!classId) {
      return NextResponse.json({ error: "classId is required" }, { status: 400 });
    }

    // 1. Verify teacher is logged in
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // 2. Verify teacher owns this class
    const { data: cls, error: clsErr } = await admin
      .from("classes")
      .select("id, teacher_id")
      .eq("id", classId)
      .single();

    if (clsErr || !cls || cls.teacher_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. Fetch all lectures for this class in chronological order
    const { data: lectures, error: lecErr } = await admin
      .from("lectures")
      .select("id, title, created_at")
      .eq("class_id", classId)
      .order("created_at", { ascending: true });

    if (lecErr || !lectures || lectures.length === 0) {
      return NextResponse.json({ history: [] });
    }

    const lectureIds = lectures.map((l) => l.id);

    // 4. Fetch clusters, doubts, and upvotes (never selecting session_id)
    const [clustersRes, doubtsRes] = await Promise.all([
      admin
        .from("clusters")
        .select("id, lecture_id, status")
        .in("lecture_id", lectureIds),
      admin
        .from("doubts")
        .select("id, lecture_id")
        .in("lecture_id", lectureIds),
    ]);

    const clusters = clustersRes.data ?? [];
    const doubts = doubtsRes.data ?? [];
    const clusterIds = clusters.map((c) => c.id);

    let upvotes: { cluster_id: string; kind: string }[] = [];
    if (clusterIds.length > 0) {
      const { data: upv } = await admin
        .from("upvotes")
        .select("cluster_id, kind")
        .in("cluster_id", clusterIds);
      upvotes = upv ?? [];
    }

    const clusterToLecture = new Map<string, string>();
    for (const c of clusters) {
      clusterToLecture.set(c.id, c.lecture_id);
    }

    const history = lectures.map((l) => {
      const lecDoubts = doubts.filter((d) => d.lecture_id === l.id).length;
      const lecClusters = clusters.filter((c) => c.lecture_id === l.id);
      const lecUpvotes = upvotes.filter(
        (u) => clusterToLecture.get(u.cluster_id) === l.id
      );

      const meToo = lecUpvotes.filter((u) => u.kind === "me_too").length;
      const stillConfused = lecUpvotes.filter(
        (u) => u.kind === "still_confused"
      ).length;
      const understood = lecUpvotes.filter(
        (u) => u.kind === "understood"
      ).length;

      return {
        lectureId: l.id,
        title: l.title,
        doubts: lecDoubts,
        me_too: meToo,
        still_confused: stillConfused,
        understood: understood,
        open_clusters: lecClusters.filter((c) => c.status === "open").length,
        addressed_clusters: lecClusters.filter((c) => c.status === "addressed")
          .length,
      };
    });

    return NextResponse.json({ history });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}