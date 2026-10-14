import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getIp, isRateLimited } from "@/lib/rateLimit";
import { checkDoubtText } from "@/lib/filter";
import { embedText, labelCluster } from "@/lib/gemini";
import { judgeCluster } from "@/lib/clusterJudge";
import {
  AUTO_JOIN_SIMILARITY,
  CANDIDATE_MIN_SIMILARITY,
  MAX_DOUBT_LENGTH,
  MIN_DOUBT_LENGTH,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  SIMILARITY_THRESHOLD,
}from "@/lib/constants";
export const maxDuration = 30;
type Match = { cluster_id: string; doubt_text: string; similarity: number };

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const code = String(body?.code ?? "").toUpperCase();
  const lectureId = String(body?.lectureId ?? "");
  const sessionId = String(body?.sessionId ?? "");
  const text = String(body?.text ?? "").trim();

  if (!/^[A-Z2-9]{6}$/.test(code) || !lectureId || sessionId.length < 8 || sessionId.length > 100) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (
    isRateLimited(`ip:${getIp(request)}`, RATE_LIMIT_MAX * 4, RATE_LIMIT_WINDOW_MS) ||
    isRateLimited(`sid:${sessionId}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)
  ) {
    return NextResponse.json(
      { error: "You're posting too fast. Wait a few seconds." },
      { status: 429 }
    );
  }

  if (text.length < MIN_DOUBT_LENGTH || text.length > MAX_DOUBT_LENGTH) {
    return NextResponse.json(
      { error: `Doubt must be ${MIN_DOUBT_LENGTH}-${MAX_DOUBT_LENGTH} characters.` },
      { status: 400 }
    );
  }
  const problem = checkDoubtText(text);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const admin = createAdminClient();

  // The lecture must belong to the class with this code
  const { data: lecture } = await admin
    .from("lectures")
    .select("id, classes!inner(code, archived)")
    .eq("id", lectureId)
    .eq("classes.code", code)
    .eq("classes.archived", false)
    .maybeSingle();

  if (!lecture) {
    return NextResponse.json({ error: "Class or lecture not found" }, { status: 404 });
  }

  // 1. Embed the doubt
  let embedding: number[];
  try {
    embedding = await embedText(text);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "The AI service is busy. Please try again." },
      { status: 502 }
    );
  }

  // 2. Nearest existing doubts in this lecture (sorted by similarity, best first)
  const { data: matches, error: matchError } = await admin.rpc("match_doubts", {
    query_embedding: embedding,
    target_lecture_id: lectureId,
    match_threshold: 0,
    match_count: 10,
  });
  if (matchError) console.error("match_doubts error:", matchError.message);

  const all = (matches ?? []) as Match[];
  const best = all[0];

  // Shortlist up to 3 distinct clusters above the candidate floor, with example doubts
  const byCluster = new Map<string, string[]>();
  for (const m of all) {
    if (m.similarity < CANDIDATE_MIN_SIMILARITY) break;
    const examples = byCluster.get(m.cluster_id);
    if (examples) {
      if (examples.length < 2) examples.push(m.doubt_text);
    } else if (byCluster.size < 3) {
      byCluster.set(m.cluster_id, [m.doubt_text]);
    }
  }

  // 3. Decide: join an existing cluster or start a new one
  let clusterId: string | null = null;
  let how = "new (no candidates)";

  if (best && best.similarity >= AUTO_JOIN_SIMILARITY) {
    clusterId = best.cluster_id;
    how = "join (near-duplicate)";
  } else if (byCluster.size > 0) {
    const ids = [...byCluster.keys()];
    const { data: rows } = await admin.from("clusters").select("id, label").in("id", ids);
    const labels = new Map(
      (rows ?? []).map((r): [string, string] => [r.id, r.label ?? "Untitled"])
    );
    const candidates = ids.map((id) => ({
      clusterId: id,
      label: labels.get(id) ?? "Untitled",
      examples: byCluster.get(id)!,
    }));

    const verdict = await judgeCluster(text, candidates);
    if (verdict === null) {
      console.warn("[cluster] JUDGE UNAVAILABLE, using threshold fallback");
      if (best && best.similarity >= SIMILARITY_THRESHOLD) {
        clusterId = best.cluster_id;
        how = "join (threshold fallback)";
      } else {
        how = "new (threshold fallback)";
      }
    } else if (verdict === "NEW") {
      how = "new (judge)";
    } else {
      clusterId = verdict;
      how = "join (judge)";
    }
  }

  console.log(
    `[cluster] ${how} | best ${best ? best.similarity.toFixed(3) : "none"} | "${text.slice(0, 50)}"`
  );

  if (clusterId) {
    // A new doubt on an addressed topic means the explanation didn't land: reopen it
    await admin
      .from("clusters")
      .update({ status: "open" })
      .eq("id", clusterId)
      .eq("status", "addressed");
  } else {
    const label = await labelCluster(text);
    const { data: cluster, error: clusterError } = await admin
      .from("clusters")
      .insert({ lecture_id: lectureId, label })
      .select("id")
      .single();
    if (clusterError || !cluster) {
      console.error(clusterError);
      return NextResponse.json({ error: "Could not save your doubt" }, { status: 500 });
    }
    clusterId = cluster.id;
  }

  // 4. Save the doubt
  const { error } = await admin.from("doubts").insert({
    lecture_id: lectureId,
    cluster_id: clusterId,
    text,
    embedding,
    session_id: sessionId,
  });

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not save your doubt" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}