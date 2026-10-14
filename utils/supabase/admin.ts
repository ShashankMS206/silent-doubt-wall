import "server-only";
import { createClient } from "@supabase/supabase-js";

// Use ONLY inside API routes / server code, after validating the class code
// or the teacher's session. Never import this from a client component.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}