// app/api/org/declarations/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ANON;

function cookieBridge() {
  const jar = cookies();
  return {
    get: (n: string) => jar.get(n)?.value,
    set() {},
    remove() {},
  };
}

// Helper to parse query without new URL()
function getSearchParams(req: Request) {
  const idx = req.url.indexOf("?");
  const query = idx === -1 ? "" : req.url.slice(idx + 1);
  return new URLSearchParams(query);
}

// Labels we care about for doc status on declarations
const INTERESTING_LABELS = [
  "Birth certificate",
  "Proof of ID",
  "Proof of address",
  "Funding code letter",
];

// Try to extract season name ("Autumn" etc.) from term_name
function extractSeason(termName: string): string | null {
  const m = termName.match(/\(([^)]+)\)/);
  if (m && m[1]) return m[1].trim();
  const seasons = ["Autumn", "Spring", "Summer", "Winter"];
  const lower = termName.toLowerCase();
  for (const s of seasons) {
    if (lower.includes(s.toLowerCase())) return s;
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const params = getSearchParams(req);
    const nurseryId = params.get("nursery_id");
    const termId = params.get("term_id");

    if (!nurseryId) {
      return NextResponse.json(
        { ok: false, error: "nursery_id is required" },
        { status: 400 }
      );
    }

    // RLS-aware client for auth
    const supa = createServerClient(URL_BASE, ANON, {
      cookies: cookieBridge(),
    });
    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json(
        { ok: false, error: "Not signed in" },
        { status: 401 }
      );
    }

    // Service client for cross-table reads
    const admin = createClient(URL_BASE, SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Nursery → org + la_id
    // NOTE: adjust "la_id" if your column is named differently
    const { data: nursery, error: nErr } = await admin
      .from("nurseries")
      .select("id, organisation_id, la_id")
      .eq("id", nurseryId)
      .maybeSingle();

    if (nErr || !nursery) {
      return NextResponse.json(
        { ok: false, error: "Nursery not found" },
        { status: 404 }
      );
    }

    const orgId = nursery.organisation_id as string | null;
    const laId = (nursery as any).la_id as string | null;

    // 2) Check user is ORG_ADMIN for this org
    const { data: grants } = await admin
      .from("role_grants")
      .select("org_id, role")
      .eq("user_id", user.id);

    const orgAdminOrgIds = (grants || [])
      .filter((g: any) => g.role === "ORG_ADMIN")
      .map((g: any) => g.org_id);

    if (!orgId || !orgAdminOrgIds.includes(orgId)) {
      return NextResponse.json(
        { ok: false, error: "You do not manage this nursery" },
        { status: 403 }
      );
    }

    // 3) Terms for this nursery's LA → group into funding seasons
    let groupedTerms: {
      id: string;
      label: string;
      start_date: string | null;
      end_date: string | null;
    }[] = [];

    if (laId) {
      const { data: termRows, error: tErr } = await admin
        .from("la_term_dates")
        .select("id, term_name, academic_year, start_date, end_date")
        .eq("la_id", laId)
        .order("start_date", { ascending: true });

      if (tErr) {
        console.error("la_term_dates error:", tErr);
      } else {
        const groups = new Map<
          string,
          {
            id: string;
            label: string;
            start_date: string | null;
            end_date: string | null;
          }
        >();

        (termRows || []).forEach((row: any) => {
          const termName: string = row.term_name ?? "";
          const season = extractSeason(termName);
          const label =
            season && row.academic_year
              ? `${season} ${row.academic_year}`
              : row.term_name ?? "Term";

          const key = label;
          const start = row.start_date as string | null;
          const end = row.end_date as string | null;

          const existing = groups.get(key);
          if (!existing) {
            groups.set(key, {
              id: row.id as string, // use first row's id as the group's term_id
              label,
              start_date: start,
              end_date: end,
            });
          } else {
            if (
              start &&
              (!existing.start_date ||
                new Date(start) < new Date(existing.start_date))
            ) {
              existing.start_date = start;
            }
            if (
              end &&
              (!existing.end_date ||
                new Date(end) > new Date(existing.end_date))
            ) {
              existing.end_date = end;
            }
          }
        });

        groupedTerms = Array.from(groups.values()).sort((a, b) => {
          if (!a.start_date || !b.start_date) return 0;
          return (
            new Date(a.start_date).getTime() -
            new Date(b.start_date).getTime()
          );
        });
      }
    }

    const terms = groupedTerms;

    // If no term_id specified, just return terms (no declaration items yet)
    if (!termId) {
      return NextResponse.json(
        { ok: true, terms, items: [] },
        { status: 200 }
      );
    }

    // 4) Declarations for this nursery + term
    const { data: decls, error: dErr } = await admin
      .from("child_declarations")
      .select(
        `
        id,
        child_id,
        term_id,
        status,
        signed_at,
        signed_by_name
      `
      )
      .eq("nursery_id", nurseryId)
      .eq("term_id", termId)
      .order("created_at", { ascending: true });

    if (dErr) {
      console.error("child_declarations error:", dErr);
      return NextResponse.json(
        { ok: false, error: "Failed to load declarations" },
        { status: 500 }
      );
    }

    const childIds = Array.from(
      new Set((decls || []).map((d: any) => d.child_id).filter(Boolean))
    ) as string[];

    const { data: children } = childIds.length
      ? await admin
          .from("children")
          .select("id, first_name, last_name")
          .in("id", childIds)
      : { data: [] as any[] };

    const childMap = new Map(
      (children || []).map((c: any) => [c.id, c])
    );

    let items = (decls || []).map((d: any) => {
      const ch = childMap.get(d.child_id) || {};
      return {
        id: d.id as string,
        status: (d.status as string | null) ?? "pending",
        signed_at: (d.signed_at as string | null) ?? null,
        signed_by_name: (d.signed_by_name as string | null) ?? null,
        child: {
          id: d.child_id as string,
          first_name: (ch.first_name as string | null) ?? null,
          last_name: (ch.last_name as string | null) ?? null,
        },
        term_id: d.term_id as string,
      };
    });

    // 5) Attach supporting document statuses per child (from documents table)
    const childIdsForDocs = Array.from(
      new Set(items.map((d: any) => d.child.id).filter(Boolean))
    ) as string[];

    let docsByChild: Record<string, { label: string; status: string }[]> = {};

    if (childIdsForDocs.length) {
      const { data: docRows, error: docsErr } = await admin
        .from("documents")
        .select("child_id, label, status")
        .in("child_id", childIdsForDocs);

      if (docsErr) {
        console.error("documents error (declarations):", docsErr);
      } else {
        const interesting = INTERESTING_LABELS.map((s) => s.toLowerCase());
        const map: Record<string, Map<string, string>> = {};

        (docRows || []).forEach((row: any) => {
          const cid = row.child_id as string;
          const label = (row.label as string) || "";
          if (!label) return;
          const key = label.toLowerCase();
          if (!interesting.includes(key)) return;

          const status = (row.status as string | null) || "pending";
          const childMapDocs = map[cid] || new Map<string, string>();
          if (!map[cid]) map[cid] = childMapDocs;
          childMapDocs.set(key, status);
        });

        docsByChild = {};
        for (const cid of childIdsForDocs) {
          const childMapDocs = map[cid] || new Map<string, string>();
          docsByChild[cid] = INTERESTING_LABELS.map((label) => {
            const key = label.toLowerCase();
            const status = childMapDocs.get(key) || "missing";
            return { label, status };
          });
        }
      }
    }

    const itemsWithDocs = items.map((d: any) => {
      const cid = d.child.id as string;
      return {
        ...d,
        docs:
          docsByChild[cid] ??
          INTERESTING_LABELS.map((label) => ({
            label,
            status: "missing",
          })),
      };
    });

    return NextResponse.json(
      { ok: true, terms, items: itemsWithDocs },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("/api/org/declarations GET error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}