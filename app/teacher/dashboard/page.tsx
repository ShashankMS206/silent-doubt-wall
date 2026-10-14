import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";

async function Welcome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return <p className="text-slate-600">Logged in as {user?.email}</p>;
}

// Suspense is required because Cache Components is enabled and this reads cookies
export default function DashboardPage() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold text-slate-900">Teacher dashboard</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <Welcome />
      </Suspense>
    </main>
  );
}