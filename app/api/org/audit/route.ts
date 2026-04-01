// app/api/org/audit/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ANON;

function cookieBridge() {
  const jar = cookies();
  return { get: (n: string) => jar.get(n)?.value, set() {}, remove() {} };
}

function extractSeason(termName: string): string | null {
  const m = termName.match(/\(([^)]+)\)/);
  if (m?.[1]) return m[1].trim();
  const seasons = ["Autumn", "Spring", "Summer", "Winter"];
  const lower = (termName || "").toLowerCase();
  for (const s of seasons) if (lower.includes(s.toLowerCase())) return s;
  return null;
}

function normISODate(d?: string | null) {
  if (!d) return null;
  return String(d).slice(0, 10);
}

function toTsStart(dIso: string) {
  return `${dIso}T00:00:00.000Z`;
}
function toTsEnd(dIso: string) {
  return `${dIso}T23:59:59.999Z`;
}

type AuditItem = {
  ts: string;
  category: "Declarations" | "Documents" | "Requests" | "Staff";
  title: string;
  subtitle?: string | null;
  child?: { id: string; name: string } | null;
  nursery?: { id: string; name: string } | null;
  actor?: { user_id: string | null; display_name: string | null; email: string | null } | null;
  source: { table: string; id: string | null };
  details: any;
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const termId = url.searchParams.get("term_id");
    const nurseryId = url.searchParams.get("nursery_id") || null; // optional
    const childId = url.searchParams.get("child_id") || null; // optional (future-friendly)
    const limit = Math.max(50, Math.min(1000, Number(url.searchParams.get("limit") ?? 300)));

    if (!termId && !childId) {
      return NextResponse.json({ ok: false, error: "term_id or child_id is required" }, { status: 400 });
    }

    const supa = createServerClient(URL, ANON, { cookies: cookieBridge() });
    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    }

    const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

    // Determine ORG_ADMIN org scope
    const { data: grants } = await admin.from("role_grants").select("org_id, role").eq("user_id", user.id);
    const orgIds = (grants ?? []).filter((g: any) => String(g.role).toUpperCase() === "ORG_ADMIN").map((g: any) => g.org_id);
    const orgId = orgIds[0] ?? null;

    if (!orgId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Nursery scope list (single nursery or all org nurseries)
    const { data: orgNurseries } = await admin
      .from("nurseries")
      .select("id, name, organisation_id")
      .eq("organisation_id", orgId)
      .order("name", { ascending: true });

    const nurseryList = (orgNurseries ?? []) as Array<{ id: string; name: string; organisation_id: string }>;
    const nurseryNameById = new Map(nurseryList.map((n) => [n.id, n.name]));
    const nurseryIds = nurseryId ? nurseryList.filter((n) => n.id === nurseryId).map((n) => n.id) : nurseryList.map((n) => n.id);

    if (nurseryId && nurseryIds.length === 0) {
      return NextResponse.json({ ok: false, error: "Nursery not in this organisation" }, { status: 403 });
    }

    // Expand termId -> all LA blocks in the same season+academic_year (for 3-term seasonal audit)
    let blockIds: string[] = termId ? [termId] : [];
    let termLabel: string | null = null;
    let windowStart: string | null = null;
    let windowEnd: string | null = null;

    if (termId) {
      const { data: anchor, error: anchorErr } = await admin
        .from("la_term_dates")
        .select("id, la_id, term_name, academic_year, start_date, end_date")
        .eq("id", termId)
        .maybeSingle();

      if (anchorErr || !anchor) {
        // Fallback: treat termId as-is
        termLabel = "Selected term";
      } else {
        const season = extractSeason(anchor.term_name ?? "");
        const ay = anchor.academic_year ?? null;
        termLabel = season && ay ? `${season} ${ay}` : (anchor.term_name ?? "Selected term");

        // Pull all LA blocks for the same LA + academic year, then filter to same season
        const { data: siblings } = await admin
          .from("la_term_dates")
          .select("id, term_name, start_date, end_date, academic_year")
          .eq("la_id", anchor.la_id)
          .eq("academic_year", ay)
          .order("start_date", { ascending: true });

        const sib = (siblings ?? []) as any[];
        const filtered = season
          ? sib.filter((r) => extractSeason(String(r.term_name ?? "")) === season)
          : sib;

        blockIds = Array.from(new Set(filtered.map((r) => r.id)));

        const starts = filtered.map((r) => normISODate(r.start_date)).filter(Boolean) as string[];
        const ends = filtered.map((r) => normISODate(r.end_date)).filter(Boolean) as string[];

        if (starts.length) windowStart = starts.sort()[0];
        if (ends.length) windowEnd = ends.sort().slice(-1)[0];
      }
    }

    // If we cannot derive a window, do a conservative window around "now" (still returns audit_events and child lifetime)
    const winStartTs = windowStart ? toTsStart(windowStart) : null;
    const winEndTs = windowEnd ? toTsEnd(windowEnd) : null;

    const items: AuditItem[] = [];

    // ---------- Declarations ----------
    // Include snapshot presence (don’t inline large snapshot by default)
    let declQuery = admin
      .from("child_declarations")
      .select("id, child_id, nursery_id, term_id, doc_type, status, created_at, signed_at, signed_by_name, signed_by_parent_id, snapshot")
      .in("nursery_id", nurseryIds);

    if (blockIds.length) declQuery = declQuery.in("term_id", blockIds);
    if (childId) declQuery = declQuery.eq("child_id", childId);

    const { data: decls } = await declQuery.order("created_at", { ascending: false }).limit(limit);

    const declRows = (decls ?? []) as any[];

    const childIdsFromDecls = Array.from(new Set(declRows.map((d) => d.child_id).filter(Boolean))) as string[];

    const { data: children } = childIdsFromDecls.length
      ? await admin.from("children").select("id, first_name, last_name, nursery_id").in("id", childIdsFromDecls)
      : { data: [] as any[] };

    const childById = new Map((children ?? []).map((c: any) => [c.id, c]));

    for (const d of declRows) {
      const ch = childById.get(d.child_id) ?? null;
      const childName = ch ? `${ch.first_name ?? ""} ${ch.last_name ?? ""}`.trim() || "Unnamed" : "Unknown child";
      const nName = nurseryNameById.get(d.nursery_id) ?? "Nursery";

      const signedAt = d.signed_at as string | null;
      const createdAt = d.created_at as string | null;
      const ts = signedAt || createdAt || new Date().toISOString();

      items.push({
        ts,
        category: "Declarations",
        title: `Declaration • ${String(d.status ?? "pending").toUpperCase()}`,
        subtitle: signedAt
          ? `Signed by ${d.signed_by_name ?? "—"}`
          : `Created`,
        child: { id: d.child_id, name: childName },
        nursery: { id: d.nursery_id, name: nName },
        actor: null, // parent signature is captured as signed_by_name
        source: { table: "child_declarations", id: d.id },
        details: {
          term_id: d.term_id,
          doc_type: d.doc_type ?? null,
          status: d.status ?? null,
          created_at: createdAt,
          signed_at: signedAt,
          signed_by_name: d.signed_by_name ?? null,
          signed_by_parent_id: d.signed_by_parent_id ?? null,
          has_snapshot: d.snapshot != null,
        },
      });
    }

    // ---------- Requests (term-scoped) ----------
    let reqQuery = admin
      .from("requests")
      .select("id, nursery_id, child_id, term_id, type, status, message, updated_at, created_at")
      .in("nursery_id", nurseryIds);

    if (blockIds.length) reqQuery = reqQuery.in("term_id", blockIds);
    if (childId) reqQuery = reqQuery.eq("child_id", childId);

    const { data: reqs } = await reqQuery.order("updated_at", { ascending: false }).limit(limit);
    const reqRows = (reqs ?? []) as any[];

    const childIdsFromReqs = Array.from(new Set(reqRows.map((r) => r.child_id).filter(Boolean))) as string[];
    const allChildIds = Array.from(new Set([...childIdsFromDecls, ...childIdsFromReqs]));

    // Enrich missing child map
    if (childIdsFromReqs.length) {
      const missing = childIdsFromReqs.filter((id) => !childById.has(id));
      if (missing.length) {
        const { data: moreChildren } = await admin.from("children").select("id, first_name, last_name, nursery_id").in("id", missing);
        (moreChildren ?? []).forEach((c: any) => childById.set(c.id, c));
      }
    }

    for (const r of reqRows) {
      const ch = childById.get(r.child_id) ?? null;
      const childName = ch ? `${ch.first_name ?? ""} ${ch.last_name ?? ""}`.trim() || "Unnamed" : "—";
      const nName = nurseryNameById.get(r.nursery_id) ?? "Nursery";
      const ts = (r.updated_at as string | null) || (r.created_at as string | null) || new Date().toISOString();

      items.push({
        ts,
        category: "Requests",
        title: `Request • ${String(r.type ?? "request")}`,
        subtitle: `Status: ${String(r.status ?? "open")}`,
        child: r.child_id ? { id: r.child_id, name: childName } : null,
        nursery: { id: r.nursery_id, name: nName },
        actor: null,
        source: { table: "requests", id: r.id },
        details: {
          term_id: r.term_id ?? null,
          type: r.type ?? null,
          status: r.status ?? null,
          message: r.message ?? null,
          updated_at: r.updated_at ?? null,
          created_at: r.created_at ?? null,
        },
      });
    }

    // ---------- Documents (time-window filtered) ----------
    // Only include documents related to children in scope (from decls/reqs) to keep volume sane.
    if (allChildIds.length && winStartTs && winEndTs) {
      const candidates = ["child_documents", "documents"];
      let used: string | null = null;
      let docRows: any[] = [];

      for (const t of candidates) {
        const { data, error } = await admin
          .from(t)
          .select("id, child_id, label, name, status, updated_at, created_at")
          .in("child_id", allChildIds)
          .order("updated_at", { ascending: false })
          .limit(limit * 2);

        if (!error && data) {
          used = t;
          docRows = data as any[];
          break;
        }
      }

      if (used) {
        // Filter by time window
        const filteredDocs = docRows.filter((d) => {
          const ts = (d.updated_at ?? d.created_at) as string | null;
          if (!ts) return false;
          return ts >= winStartTs && ts <= winEndTs;
        });

        for (const d of filteredDocs.slice(0, limit)) {
          const ch = childById.get(d.child_id) ?? null;
          const childName = ch ? `${ch.first_name ?? ""} ${ch.last_name ?? ""}`.trim() || "Unnamed" : "Unknown child";
          const nId = ch?.nursery_id ?? null;
          const nName = nId ? nurseryNameById.get(nId) ?? "Nursery" : "Nursery";
          const ts = (d.updated_at as string | null) || (d.created_at as string | null) || new Date().toISOString();

          items.push({
            ts,
            category: "Documents",
            title: `Document • ${String(d.label ?? d.name ?? "Document")}`,
            subtitle: `Status: ${String(d.status ?? "pending")}`,
            child: { id: d.child_id, name: childName },
            nursery: nId ? { id: nId, name: nName } : null,
            actor: null,
            source: { table: used, id: d.id },
            details: {
              status: d.status ?? null,
              updated_at: d.updated_at ?? null,
              created_at: d.created_at ?? null,
            },
          });
        }
      }
    }

    // ---------- Staff/system actions (audit_events) ----------
    if (winStartTs && winEndTs) {
      let aeQuery = admin
        .from("audit_events")
        .select("created_at, org_id, nursery_id, actor_user_id, actor_email, actor_display_name, action, entity_type, entity_id, details")
        .eq("org_id", orgId)
        .gte("created_at", winStartTs)
        .lte("created_at", winEndTs)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (nurseryId) {
        // Include nursery-specific and org-wide events
        aeQuery = aeQuery.or(`nursery_id.eq.${nurseryId},nursery_id.is.null`);
      }

      const { data: evs } = await aeQuery;
      const evRows = (evs ?? []) as any[];

      for (const ev of evRows) {
        const ts = ev.created_at as string;
        items.push({
          ts,
          category: "Staff",
          title: `Staff • ${String(ev.action ?? "action")}`,
          subtitle: ev.entity_type ? `${ev.entity_type}${ev.entity_id ? ` (${ev.entity_id})` : ""}` : null,
          child: null,
          nursery: ev.nursery_id ? { id: ev.nursery_id, name: nurseryNameById.get(ev.nursery_id) ?? "Nursery" } : null,
          actor: {
            user_id: ev.actor_user_id ?? null,
            display_name: ev.actor_display_name ?? null,
            email: ev.actor_email ?? null,
          },
          source: { table: "audit_events", id: ev.entity_id ?? null },
          details: ev.details ?? {},
        });
      }
    }

    // Sort newest first
    items.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));

    // Basic counts
    const counts = {
      declarations: items.filter((x) => x.category === "Declarations").length,
      documents: items.filter((x) => x.category === "Documents").length,
      requests: items.filter((x) => x.category === "Requests").length,
      staff: items.filter((x) => x.category === "Staff").length,
      total: items.length,
    };

    return NextResponse.json({
      ok: true,
      org_id: orgId,
      nursery_id: nurseryId,
      term: {
        anchor_term_id: termId,
        label: termLabel,
        block_ids: blockIds,
        window_start: windowStart,
        window_end: windowEnd,
      },
      counts,
      items: items.slice(0, limit),
    });
  } catch (e: any) {
    console.error("/api/org/audit GET error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Unexpected error" }, { status: 500 });
  }
}