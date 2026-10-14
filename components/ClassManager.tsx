// components/ClassManager.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { createClient } from "@/utils/supabase/client";

type Lecture = { id: string; title: string; created_at: string };
type ClassRow = { id: string; name: string; code: string; lectures: Lecture[] };

type HistoryRow = {
  lectureId: string;
  title: string;
  doubts: number;
  me_too: number;
  still_confused: number;
  understood: number;
  open_clusters: number;
  addressed_clusters: number;
};

// No 0/O/1/I so codes are easy to read from a projector
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

function getBaseSiteUrl() {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export default function ClassManager() {
  const supabase = createClient();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [className, setClassName] = useState("");
  const [lectureTitles, setLectureTitles] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // QR modal & History chart state
  const [openQrClassId, setOpenQrClassId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [openHistoryClassId, setOpenHistoryClassId] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<Record<string, HistoryRow[]>>({});
  const [loadingHistory, setLoadingHistory] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("classes")
      .select("id, name, code, lectures(id, title, created_at)")
      .eq("archived", false)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else {
      setClasses(
        (data as ClassRow[]).map((c) => ({
          ...c,
          lectures: [...c.lectures].sort((a, b) =>
            b.created_at.localeCompare(a.created_at)
          ),
        }))
      );
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createClass(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const name = className.trim();
    if (!name) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return setError("Not logged in");

    // Retry if the random code collides with an existing one
    for (let i = 0; i < 5; i++) {
      const { error } = await supabase
        .from("classes")
        .insert({ name, code: randomCode(), teacher_id: user.id });
      if (!error) {
        setClassName("");
        return load();
      }
      if (error.code !== "23505") return setError(error.message);
    }
    setError("Could not generate a unique code, try again");
  }

  async function addLecture(classId: string) {
    setError("");
    const title = (lectureTitles[classId] ?? "").trim();
    if (!title) return;
    const { error } = await supabase
      .from("lectures")
      .insert({ class_id: classId, title });
    if (error) return setError(error.message);
    setLectureTitles((t) => ({ ...t, [classId]: "" }));
    load();
  }

  async function toggleHistory(classId: string) {
    if (openHistoryClassId === classId) {
      setOpenHistoryClassId(null);
      return;
    }
    setOpenHistoryClassId(classId);
    setLoadingHistory(classId);
    try {
      const res = await fetch(
        `/api/teacher/history?classId=${encodeURIComponent(classId)}`
      );
      if (res.ok) {
        const json = await res.json();
        setHistoryData((prev) => ({ ...prev, [classId]: json.history ?? [] }));
      }
    } finally {
      setLoadingHistory(null);
    }
  }

  function copyJoinUrl(code: string) {
    const url = `${getBaseSiteUrl()}/join/${code}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  const baseUrl = getBaseSiteUrl();

  return (
    <section className="mt-6 space-y-6 max-w-2xl">
      <form onSubmit={createClass} className="flex gap-2">
        <input
          value={className}
          onChange={(e) => setClassName(e.target.value)}
          placeholder="New class name, e.g. BCA Sem 5 - DBMS"
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
        />
        <button className="bg-indigo-600 text-white rounded-lg px-4 py-2 font-medium">
          Create class
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-slate-500">Loading...</p>}
      {!loading && classes.length === 0 && (
        <p className="text-slate-500">
          No classes yet. Create your first one above.
        </p>
      )}

      {classes.map((c) => {
        const joinUrl = `${baseUrl}/join/${c.code}`;
        const showQr = openQrClassId === c.id;
        const showHistory = openHistoryClassId === c.id;
        const chartRows = historyData[c.id] ?? [];

        return (
          <div
            key={c.id}
            className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-slate-900">{c.name}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setOpenQrClassId(showQr ? null : c.id)}
                    className="text-xs border border-slate-300 rounded-md px-2.5 py-1 text-slate-700 hover:bg-slate-50"
                  >
                    {showQr ? "Hide QR" : "QR & Join Link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleHistory(c.id)}
                    className="text-xs border border-slate-300 rounded-md px-2.5 py-1 text-slate-700 hover:bg-slate-50"
                  >
                    {showHistory ? "Hide History Chart" : "Confusion History"}
                  </button>
                </div>
              </div>
              <span className="font-mono tabular-nums text-lg text-indigo-900 tracking-widest">
                {c.code}
              </span>
            </div>

            {/* QR Code & Join Link Panel */}
            {showQr && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row items-center gap-4">
                <div className="bg-white p-3 rounded-lg border border-slate-200 shrink-0">
                  <QRCodeSVG value={joinUrl} size={140} />
                </div>
                <div className="space-y-2 text-center sm:text-left flex-1">
                  <p className="text-xs uppercase tracking-wide font-semibold text-slate-500">
                    Scan to post doubts anonymously
                  </p>
                  <p className="font-mono text-sm text-slate-800 break-all bg-white border border-slate-200 rounded px-2.5 py-1.5">
                    {joinUrl}
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                    <button
                      type="button"
                      onClick={() => copyJoinUrl(c.code)}
                      className="text-xs bg-indigo-600 text-white rounded-md px-3 py-1.5 font-medium hover:bg-indigo-700"
                    >
                      {copiedCode === c.code ? "Copied!" : "Copy Join Link"}
                    </button>
                    <Link
                      href={`/join/${c.code}`}
                      target="_blank"
                      className="text-xs border border-slate-300 bg-white text-slate-700 rounded-md px-3 py-1.5 hover:bg-slate-50"
                    >
                      Open Student View &rarr;
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Lecture-wise Confusion History Chart (Recharts) */}
            {showHistory && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                <p className="text-xs uppercase tracking-wide font-semibold text-slate-600">
                  Lecture-wise Confusion History
                </p>
                {loadingHistory === c.id ? (
                  <p className="text-xs text-slate-500 py-4">Loading chart...</p>
                ) : chartRows.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4">
                    No lecture history available yet.
                  </p>
                ) : (
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartRows}
                        margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="title"
                          tick={{ fontSize: 12, fill: "#475569" }}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 12, fill: "#475569" }}
                        />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar
                          dataKey="doubts"
                          name="Doubts"
                          fill="#4f46e5"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="me_too"
                          name="Me too"
                          fill="#0ea5e9"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="still_confused"
                          name="Still confused"
                          fill="#f59e0b"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="understood"
                          name="Understood"
                          fill="#10b981"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            <ul className="text-sm text-slate-700 space-y-1">
              {c.lectures.length === 0 && (
                <li className="text-slate-500">No lectures yet.</li>
              )}
              {c.lectures.map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/teacher/lecture/${l.id}`}
                    className="text-indigo-600 hover:underline"
                  >
                    {l.title}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="flex gap-2">
              <input
                value={lectureTitles[c.id] ?? ""}
                onChange={(e) =>
                  setLectureTitles((t) => ({ ...t, [c.id]: e.target.value }))
                }
                placeholder="New lecture, e.g. Lecture 7 - Normalization"
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900"
              />
              <button
                onClick={() => addLecture(c.id)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700"
              >
                Add lecture
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}