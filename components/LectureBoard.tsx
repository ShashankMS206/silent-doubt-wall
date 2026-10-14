// components/LectureBoard.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

type Cluster = {
  id: string;
  label: string | null;
  status: "open" | "addressed";
  doubt_count: number;
  me_too_count: number;
  still_confused_count: number;
  score: number;
  published_explanation: string | null;
  updated_at: string;
};
type Doubt = { id: string; text: string; created_at: string };
type Info = { title: string; className: string; code: string };
type StyleMode = "default" | "simpler" | "analogy" | "code";

export default function LectureBoard({ lectureId }: { lectureId: string }) {
  const [supabase] = useState(() => createClient());
  const [info, setInfo] = useState<Info | null>(null);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [doubts, setDoubts] = useState<Record<string, Doubt[]>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Re-explain & Publish state
  const [activeExplainId, setActiveExplainId] = useState<string | null>(null);
  const [aiOriginal, setAiOriginal] = useState<Record<string, string>>({});
  const [draftText, setDraftText] = useState<Record<string, string>>({});
  const [generatingMode, setGeneratingMode] = useState<StyleMode | null>(null);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("top_clusters", {
      p_lecture_id: lectureId,
    });
    if (error) setError(error.message);
    else {
      setError("");
      setClusters(data as Cluster[]);
    }
    setLoading(false);
  }, [supabase, lectureId]);

  useEffect(() => {
    supabase
      .from("lectures")
      .select("title, classes(name, code)")
      .eq("id", lectureId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const cls = data.classes as unknown as
          | { name: string; code: string }
          | { name: string; code: string }[];
        const c = Array.isArray(cls) ? cls[0] : cls;
        setInfo({
          title: data.title,
          className: c?.name ?? "",
          code: c?.code ?? "",
        });
      });
  }, [supabase, lectureId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`clusters-${lectureId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "clusters",
          filter: `lecture_id=eq.${lectureId}`,
        },
        () => load()
      )
      .subscribe();
    const poll = setInterval(load, 10_000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [supabase, lectureId, load]);

  async function toggle(clusterId: string) {
    if (expanded === clusterId) return setExpanded(null);
    setExpanded(clusterId);
    const { data, error } = await supabase.rpc("get_cluster_doubts", {
      p_cluster_id: clusterId,
    });
    if (error) return setError(error.message);
    setDoubts((d) => ({ ...d, [clusterId]: data as Doubt[] }));
  }

  async function markAddressed(clusterId: string) {
    const { error } = await supabase
      .from("clusters")
      .update({ status: "addressed", updated_at: new Date().toISOString() })
      .eq("id", clusterId);
    if (error) return setError(error.message);
    load();
  }

  async function generateExplanation(clusterId: string, mode: StyleMode = "default") {
    setError("");
    setActiveExplainId(clusterId);
    setGeneratingMode(mode);
    try {
      const res = await fetch("/api/clusters/re-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterId, mode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to generate explanation");
      } else {
        setAiOriginal((prev) => ({ ...prev, [clusterId]: json.draft }));
        setDraftText((prev) => ({ ...prev, [clusterId]: json.draft }));
      }
    } catch {
      setError("Network error while calling AI re-explain");
    } finally {
      setGeneratingMode(null);
    }
  }

  async function publishExplanation(clusterId: string) {
    const text = (draftText[clusterId] ?? "").trim();
    if (!text) return;
    setError("");
    setPublishing(true);

    const original = (aiOriginal[clusterId] ?? "").trim();
    const source = text === original ? "ai_draft" : "teacher_edited";

    try {
      const res = await fetch("/api/clusters/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterId, text, source }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to publish explanation");
      } else {
        setActiveExplainId(null);
        await load();
      }
    } catch {
      setError("Network error while publishing explanation");
    } finally {
      setPublishing(false);
    }
  }

  const open = clusters.filter((c) => c.status === "open");
  const top = open.slice(0, 3);
  const otherOpen = open.length - top.length;
  const addressed = clusters.length - open.length;

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl space-y-5">
        <Link href="/teacher/dashboard" className="text-sm text-indigo-600">
          &larr; All classes
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {info?.title ?? "Lecture"}
            </h1>
            <p className="text-slate-600">{info?.className}</p>
          </div>
          {info?.code && (
            <div className="text-right">
              <p className="text-xs text-slate-500">Class code</p>
              <p className="font-mono tabular-nums text-xl tracking-widest text-indigo-900">
                {info.code}
              </p>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading && <p className="text-slate-500">Loading...</p>}

        {!loading && top.length === 0 && (
          <p className="text-slate-500">
            No open doubts yet. Students can post at /join/{info?.code ?? "CODE"}.
          </p>
        )}

        {top.map((c, i) => (
          <div
            key={c.id}
            className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
          >
            <div className="flex items-start gap-3">
              <span className="font-mono tabular-nums text-2xl text-amber-600">
                {i + 1}
              </span>
              <div className="flex-1">
                <h2 className="font-semibold text-slate-900">
                  {c.label ?? "Untitled topic"}
                </h2>
                <p className="text-sm text-slate-600 font-mono tabular-nums">
                  {c.doubt_count} doubts · {c.me_too_count} me too ·{" "}
                  {c.still_confused_count} still confused
                </p>
              </div>
              <span className="font-mono tabular-nums text-sm text-slate-500">
                {c.score.toFixed(1)}
              </span>
            </div>

            {c.published_explanation && (
              <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1">
                <p className="font-semibold">Published Explanation:</p>
                <p className="whitespace-pre-wrap">{c.published_explanation}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => toggle(c.id)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                {expanded === c.id ? "Hide doubts" : "View doubts"}
              </button>
              <button
                onClick={() => {
                  if (activeExplainId === c.id) {
                    setActiveExplainId(null);
                  } else if (draftText[c.id]) {
                    setActiveExplainId(c.id);
                  } else {
                    generateExplanation(c.id, "default");
                  }
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-1.5 text-sm font-medium"
              >
                {activeExplainId === c.id ? "Close AI helper" : "Re-explain"}
              </button>
              <button
                onClick={() => markAddressed(c.id)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Mark addressed
              </button>
            </div>

            {activeExplainId === c.id && (
              <div className="border-t border-slate-100 pt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-500 mr-1">Regenerate:</span>
                  {(
                    [
                      ["default", "Standard"],
                      ["simpler", "Simpler"],
                      ["analogy", "Different analogy"],
                      ["code", "Code example"],
                    ] as [StyleMode, string][]
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      disabled={generatingMode !== null}
                      onClick={() => generateExplanation(c.id, mode)}
                      className="text-xs border border-slate-300 rounded-md px-2.5 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {generatingMode === mode ? "Thinking..." : label}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={4}
                  value={draftText[c.id] ?? ""}
                  onChange={(e) =>
                    setDraftText((prev) => ({ ...prev, [c.id]: e.target.value }))
                  }
                  placeholder="Write or edit the explanation for your class..."
                  className="w-full border border-slate-300 rounded-lg p-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {draftText[c.id] &&
                    draftText[c.id]?.trim() !== (aiOriginal[c.id] ?? "").trim()
                      ? "Edited by teacher"
                      : "AI draft (editable)"}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveExplainId(null)}
                      className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-600"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={
                        publishing ||
                        generatingMode !== null ||
                        !(draftText[c.id] ?? "").trim()
                      }
                      onClick={() => publishExplanation(c.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                    >
                      {publishing ? "Publishing..." : "Publish to class"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {expanded === c.id && (
              <ul className="text-sm text-slate-700 space-y-1 border-t border-slate-100 pt-3">
                {(doubts[c.id] ?? []).map((d) => (
                  <li key={d.id}>&ldquo;{d.text}&rdquo;</li>
                ))}
                {!doubts[c.id] && <li className="text-slate-500">Loading...</li>}
              </ul>
            )}
          </div>
        ))}

        {(otherOpen > 0 || addressed > 0) && (
          <p className="text-sm text-slate-500">
            {otherOpen > 0 &&
              `${otherOpen} more open topic${otherOpen > 1 ? "s" : ""}`}
            {otherOpen > 0 && addressed > 0 && " · "}
            {addressed > 0 && `${addressed} addressed`}
          </p>
        )}
      </div>
    </main>
  );
}