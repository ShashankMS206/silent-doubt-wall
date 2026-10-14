// components/StudentView.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { getSessionId } from "@/utils/session";
import { MAX_DOUBT_LENGTH } from "@/lib/constants";

type Lecture = { id: string; title: string };

type Cluster = {
  id: string;
  label: string | null;
  status: "open" | "addressed";
  doubt_count: number;
  me_too_count: number;
  still_confused_count: number;
  understood_count: number;
  score: number;
  published_explanation: string | null;
  updated_at: string;
};

type VoteRecord = {
  cluster_id: string;
  kind: "me_too" | "still_confused" | "understood";
};

export default function StudentView({ code }: { code: string }) {
  const [className, setClassName] = useState("");
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [lectureId, setLectureId] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sending, setSending] = useState(false);

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [myVotes, setMyVotes] = useState<VoteRecord[]>([]);
  const [votingKey, setVotingKey] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/class?code=${code}`)
      .then(async (res) => {
        if (!res.ok) return setNotFound(true);
        const data = await res.json();
        setClassName(data.name);
        setLectures(data.lectures);
        setLectureId(data.lectures[0]?.id ?? "");
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [code]);

  const loadClusters = useCallback(async () => {
    if (!lectureId) return;
    try {
      const sessionId = getSessionId();
      const res = await fetch(
        `/api/student/clusters?code=${encodeURIComponent(code)}&lectureId=${encodeURIComponent(
          lectureId
        )}&sessionId=${encodeURIComponent(sessionId)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setClusters(data.clusters ?? []);
      setMyVotes(data.myVotes ?? []);
    } catch {
      // Ignore network blips during polling
    }
  }, [code, lectureId]);

  useEffect(() => {
    if (!lectureId) return;
    loadClusters();
    const timer = setInterval(loadClusters, 5_000);
    return () => clearInterval(timer);
  }, [lectureId, loadClusters]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setSending(true);
    const res = await fetch("/api/doubts/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, lectureId, text, sessionId: getSessionId() }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (res.ok) {
      setText("");
      setStatus({ kind: "ok", msg: "Submitted anonymously." });
      loadClusters();
    } else {
      setStatus({ kind: "error", msg: data.error ?? "Something went wrong." });
    }
  }

  async function castVote(clusterId: string, kind: "me_too" | "still_confused" | "understood") {
    const key = `${clusterId}:${kind}`;
    setVotingKey(key);
    try {
      const res = await fetch("/api/upvotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          clusterId,
          sessionId: getSessionId(),
          kind,
        }),
      });
      if (res.ok) {
        await loadClusters();
      }
    } finally {
      setVotingKey(null);
    }
  }

  function hasVoted(clusterId: string, kind: "me_too" | "still_confused" | "understood") {
    return myVotes.some((v) => v.cluster_id === clusterId && v.kind === kind);
  }

  if (loading) return <main className="p-6 text-slate-500">Loading...</main>;
  if (notFound)
    return (
      <main className="p-6 text-slate-700">
        Class not found. Check the code and try again.
      </main>
    );

  return (
    <main className="min-h-screen bg-slate-50 p-4 flex justify-center">
      <div className="w-full max-w-md space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{className}</h1>
          <p className="font-mono tabular-nums text-sm text-slate-500">{code}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700">
          Anonymous mode active. No name or account is needed, and your identity is never shared.
        </div>

        {lectures.length === 0 ? (
          <p className="text-slate-600">The teacher hasn&apos;t added a lecture yet.</p>
        ) : (
          <>
            <form
              onSubmit={submit}
              className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
            >
              <label className="block text-sm text-slate-600">
                Lecture
                <select
                  value={lectureId}
                  onChange={(e) => setLectureId(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 bg-white"
                >
                  {lectures.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </select>
              </label>

              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={MAX_DOUBT_LENGTH}
                rows={4}
                placeholder="What's confusing you? Type it your own way."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
              />
              <div className="flex items-center justify-between">
                <span className="font-mono tabular-nums text-xs text-slate-500">
                  {text.length}/{MAX_DOUBT_LENGTH}
                </span>
                <button
                  disabled={sending}
                  className="bg-indigo-600 text-white rounded-lg px-4 py-2 font-medium disabled:opacity-50"
                >
                  {sending ? "Sending..." : "Post doubt"}
                </button>
              </div>
              {status && (
                <p
                  className={
                    status.kind === "ok"
                      ? "text-sm text-emerald-600"
                      : "text-sm text-red-600"
                  }
                >
                  {status.msg}
                </p>
              )}
            </form>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                  Class Doubts ({clusters.length})
                </h2>
                <span className="text-xs text-slate-400">Updates every 5s</span>
              </div>

              {clusters.length === 0 ? (
                <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-4">
                  No doubts posted for this lecture yet. Be the first to ask above!
                </p>
              ) : (
                clusters.map((c) => {
                  const votedMeToo = hasVoted(c.id, "me_too");
                  const votedStillConfused = hasVoted(c.id, "still_confused");
                  const votedUnderstood = hasVoted(c.id, "understood");

                  return (
                    <div
                      key={c.id}
                      className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-slate-900 text-sm">
                            {c.label ?? "Student question"}
                          </h3>
                          <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                            {c.doubt_count} asked · {c.me_too_count} me too
                            {c.still_confused_count > 0 &&
                              ` · ${c.still_confused_count} still confused`}
                            {c.understood_count > 0 &&
                              ` · ${c.understood_count} understood`}
                          </p>
                        </div>
                        {c.status === "addressed" && (
                          <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-medium">
                            Addressed
                          </span>
                        )}
                      </div>

                      {c.published_explanation && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-900 space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                            Teacher Explanation
                          </p>
                          <p className="whitespace-pre-wrap">
                            {c.published_explanation}
                          </p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          disabled={votingKey === `${c.id}:me_too`}
                          onClick={() => castVote(c.id, "me_too")}
                          className={`text-xs rounded-lg px-3 py-1.5 font-medium border transition disabled:opacity-50 ${
                            votedMeToo
                              ? "bg-indigo-50 border-indigo-300 text-indigo-700 hover:bg-indigo-100"
                              : "border-slate-300 text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {votedMeToo
                            ? `✓ Me too (${c.me_too_count})`
                            : `+ Me too (${c.me_too_count})`}
                        </button>

                        {c.published_explanation && (
                          <button
                            type="button"
                            disabled={votingKey === `${c.id}:still_confused`}
                            onClick={() => castVote(c.id, "still_confused")}
                            className={`text-xs rounded-lg px-3 py-1.5 font-medium border transition disabled:opacity-50 ${
                              votedStillConfused
                                ? "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
                                : "border-amber-300 text-amber-800 hover:bg-amber-50"
                            }`}
                          >
                            {votedStillConfused
                              ? `✓ Still confused (${c.still_confused_count})`
                              : `Still confused (${c.still_confused_count})`}
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={votingKey === `${c.id}:understood`}
                          onClick={() => castVote(c.id, "understood")}
                          className={`text-xs rounded-lg px-3 py-1.5 font-medium border transition disabled:opacity-50 ${
                            votedUnderstood
                              ? "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                              : "border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                          }`}
                        >
                          {votedUnderstood
                            ? `✓ Understood (${c.understood_count})`
                            : `Understood (${c.understood_count})`}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}