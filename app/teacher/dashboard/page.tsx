import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import ClassManager from "@/components/ClassManager";

async function Welcome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return <p className="text-slate-600">Logged in as {user?.email}</p>;
}

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <h1 className="text-2xl font-semibold text-slate-900">Teacher dashboard</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <Welcome />
      </Suspense>
      <ClassManager />
    </main>
  );
}