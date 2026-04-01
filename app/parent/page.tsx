import ParentHomeClient from "./ParentHomeClient";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

// Read-only cookie bridge for Next 14 (no set/remove here).
function bridge() {
  const jar = cookies();
  return {
    get: (n: string) => jar.get(n)?.value,
    // set/remove are intentionally no-ops in Server Components.
    set: (_n: string, _v: string, _o?: any) => {},
    remove: (_n: string, _o?: any) => {},
  };
}

export default async function ParentHomePage() {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: bridge() }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const fullName =
  (user?.user_metadata?.full_name as string | undefined) ||
  (user?.user_metadata?.first_name as string | undefined) ||
  "";

const firstName =
  fullName.trim().split(" ")[0] || "Parent";

const bootstrap = {
  greetingName: firstName,
  badges: { docsRequired: 0, invoicesDue: 0, notifications: 0 },
};

  return <ParentHomeClient bootstrap={bootstrap} />;
}
