"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Lecture = { id: string; title: string; created_at: string };
type ClassRow = { id: string; name: string; code: string; lectures: Lecture[] };

// No 0/O/1/I so codes are easy to read from a projector
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export default function ClassManager() {
  const supabase = createClient();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [className, setClassName] = useState("");
  const [lectureTitles, setLectureTitles] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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
        <p className="text-slate-500">No classes yet. Create your first one above.</p>
      )}

      {classes.map((c) => (
        <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">{c.name}</h2>
            <span className="font-mono tabular-nums text-lg text-indigo-900 tracking-widest">
              {c.code}
            </span>
          </div>

          <ul className="text-sm text-slate-700 space-y-1">
            {c.lectures.length === 0 && (
              <li className="text-slate-500">No lectures yet.</li>
            )}
            {c.lectures.map((l) => (
              <li key={l.id}>{l.title}</li>
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
      ))}
    </section>
  );
}