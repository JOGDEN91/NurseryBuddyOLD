import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import LAViewClient, { type Doc } from "./LAViewClient";

export default async function Page({ params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: (name, value, options) =>
          cookieStore.set({ name, value, ...options }),
        remove: (name, options) =>
          cookieStore.set({ name, value: "", ...options }),
      },
    }
  );

  const laId = params.id;

  // Optional: fetch a display name for the header
  let laName: string | undefined = undefined;
  try {
    const { data } = await supabase
      .from("local_authorities")
      .select("name, display_name, title")
      .eq("id", laId)
      .maybeSingle();
    laName =
      (data?.display_name as string) ??
      (data?.name as string) ??
      (data?.title as string) ??
      undefined;
  } catch {
    // ignore – name is optional
  }

  // Choose document table (A preferred, B legacy)
  let table: "la_documents" | "documents" = "la_documents";
  const probe = await supabase.from("la_documents").select("id").limit(1);
  if (probe.error) table = "documents";

  // Select shape compatible with the client Doc type
  let selectCols =
    "id, la_id, doc_type, title, url, notes, status";
  if (table === "documents") {
    selectCols += ", storage_path";
  }

const { data: docs, error: docsErr } = await supabase
  .from(table)
  .select("id, la_id, doc_type, title, url, notes") // no 'status'
  .eq("la_id", laId)
  .limit(200);

  if (docsErr) {
    // If something odd happens, just pass an empty array;
    // the client stays fully typeable and saves will still work.
    return <LAViewClient laId={laId} laName={laName} documents={[]} />;
  }

  return (
    <LAViewClient
      laId={laId}
      laName={laName}
      documents={(docs ?? []) as Doc[]}
    />
  );
}
