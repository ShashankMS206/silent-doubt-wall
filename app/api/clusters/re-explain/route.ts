// app/api/clusters/re-explain/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { generateText } from "@/lib/gemini";
export const maxDuration = 30; 

type StyleMode = "default" | "simpler" | "analogy" | "code";

export async function POST(req: Request) {
  try {
    const { clusterId, mode = "default" } = (await req.json()) as {
      clusterId?: string;
      mode?: StyleMode;
    };

    if (!clusterId) {
      return NextResponse.json({ error: "clusterId is required" }, { status: 400 });
    }

    // 1. Verify teacher is logged in
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Verify teacher owns the class this cluster belongs to
    const admin = createAdminClient();
    const { data: cluster, error: clusterErr } = await admin
      .from("clusters")
      .select("id, label, lecture_id, lectures!inner(id, title, classes!inner(teacher_id))")
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

    // 3. Fetch doubt texts in this cluster (never reading session_id)
    const { data: doubts, error: doubtsErr } = await admin
      .from("doubts")
      .select("text")
      .eq("cluster_id", clusterId)
      .order("created_at", { ascending: true })
      .limit(15);

    if (doubtsErr || !doubts || doubts.length === 0) {
      return NextResponse.json(
        { error: "No doubts found in this cluster" },
        { status: 400 }
      );
    }

    const bulletList = doubts.map((d, i) => `${i + 1}. "${d.text}"`).join("\n");

    let modeInstruction =
      "Write a 3-4 sentence plain-language re-explanation the teacher can say aloud in class, followed by one relatable everyday analogy. Do not assume prior knowledge.";

    if (mode === "simpler") {
      modeInstruction =
        "Explain this as simply as possible (like explaining to a complete beginner on day 1). Use 2-3 very short sentences with zero jargon, plus one ultra-simple everyday analogy.";
    } else if (mode === "analogy") {
      modeInstruction =
        "Write a brief 2-sentence explanation, then provide a fresh, vivid real-world analogy (different from standard textbook analogies) that makes the concept click immediately.";
    } else if (mode === "code") {
      modeInstruction =
        "Write a 2-3 sentence plain-language explanation, followed by a tiny, minimal 4-6 line annotated code example that directly clears up these doubts.";
    }

    const prompt = [
      `You are helping a teacher during live lecture "${lectureObj?.title ?? ""}".`,
      `Topic cluster: "${cluster.label ?? "Student confusion"}"`,
      `Here are anonymous student doubts on the same topic:\n${bulletList}`,
      modeInstruction,
      `Keep it concise, warm, and ready to read aloud or publish directly to students. Do not include markdown headings or meta-introductions.`,
    ].join("\n\n");

    const draft = await generateText(prompt);

    if (!draft || !draft.trim()) {
      return NextResponse.json(
        { error: "AI model could not generate an explanation right now. Try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ draft: draft.trim() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("[re-explain error]:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}