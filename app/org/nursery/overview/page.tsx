// app/org/nursery/overview/page.tsx
import StaffCard from "@/components/StaffCard";
import { getCurrentUserAndProfile } from "@/lib/profile";
// import ReminderList from "@/components/ReminderList"; // removed
import FileList from "@/components/FileList";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import LAWindowCountdown from "./LAWindowCountdown";
import TermEditFormClient from "./TermEditForm.client";
import OverviewNotificationsClient from "./OverviewNotificationsClient";
import OverviewMessagesSnippetClient from "./OverviewMessagesSnippetClient";
import TermDeclarationStatusBar from "./TermDeclarationStatusBar";
import TermChildrenSummary from "./TermChildrenSummary";
import PreviousTermsClient from "./PreviousTerms.client";

export const dynamic = "force-dynamic";

/* ---------------------------------------------
   Supabase (Server Component)
--------------------------------------------- */
function getSupabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );
}

/* ---------------------------------------------
   Types & helpers
--------------------------------------------- */

type TermLite = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
};

export type Term = {
  id: string;
  nursery_id: string;

  name: string;
  season?: string | null;
  year?: number | null;

  // overall term dates (season or block)
  start_date: string | null;
  end_date: string | null;

  // LA block dates
  la_start_date?: string | null;
  la_end_date?: string | null;

  // nursery dates (for now: same as LA until we add overrides)
  nursery_start_date?: string | null;
  nursery_end_date?: string | null;

  // nursery config bits
  provider_deadline: string | null;
  la_portal_open: string | null;
  la_portal_close: string | null;

  nursery_weeks?: number | null;
  la_weeks?: number | null;

  la_term_date_id?: string | null;
  nursery_term_settings_id?: string | null;

  // for 3-term structure: the underlying LA blocks
  blocks?: TermLite[];
};

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB") : "—";

function inferSeason(name?: string | null): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (
    lower.includes("autumn") ||
    lower.includes("term 1") ||
    lower.includes("term 2")
  )
    return "Autumn";
  if (
    lower.includes("spring") ||
    lower.includes("term 3") ||
    lower.includes("term 4")
  )
    return "Spring";
  if (
    lower.includes("summer") ||
    lower.includes("term 5") ||
    lower.includes("term 6")
  )
    return "Summer";
  return null;
}

function clean(v: unknown) {
  const s = String(v ?? "").trim();
  return s.length ? s : "";
}

function deriveDisplayName(authUser: any, profile: any) {
  // Prefer Auth user_metadata (canonical)
  const meta = authUser?.user_metadata ?? authUser?.raw_user_meta_data ?? {};

  const first =
    clean(meta.first_name) ||
    clean(meta.given_name) ||
    clean(meta.firstName) ||
    clean(profile?.first_name) ||
    clean(profile?.given_name);

  const sur =
    clean(meta.surname) ||
    clean(meta.last_name) ||
    clean(meta.family_name) ||
    clean(meta.lastName) ||
    clean(profile?.surname) ||
    clean(profile?.last_name) ||
    clean(profile?.family_name);

  const full = `${first} ${sur}`.trim();

  // Only fall back to profile.display_name, then email.
  return full || clean(profile?.display_name) || clean(authUser?.email) || "—";
}

/* ---------------------------------------------
   Resolve nursery + LA + term structure
--------------------------------------------- */

type NurseryContext = {
  nurseryId: string | null;
  laId: string | null;
  laName: string | null;
  orgName: string | null;
  nurseryName: string | null;
  termStructure: "3" | "6";
};

async function getEffectiveNurseryContext(
  userId?: string | null
): Promise<NurseryContext> {
  const supabase = getSupabaseServer();

  const empty: NurseryContext = {
    nurseryId: null,
    laId: null,
    laName: null,
    orgName: null,
    nurseryName: null,
    termStructure: "6",
  };

  if (!userId) return empty;

  const { data: prof } = await supabase
    .from("profiles")
    .select("id, nursery_id, organisation_id")
    .eq("id", userId)
    .maybeSingle();

  async function ctxFromNurseryRow(nursery: any | null): Promise<NurseryContext> {
    if (!nursery) return empty;

    const org =
      nursery.organisation_id
        ? (
            await supabase
              .from("organisations")
              .select("id, name")
              .eq("id", nursery.organisation_id)
              .maybeSingle()
          ).data
        : null;

    const la =
      nursery.la_id
        ? (
            await supabase
              .from("local_authorities")
              .select("id, name")
              .eq("id", nursery.la_id)
              .maybeSingle()
          ).data
        : null;

    const rawStructure = (nursery.term_structure as string | null) ?? "6";
    const termStructure: "3" | "6" =
      rawStructure === "3" || rawStructure === "6" ? rawStructure : "6";

    return {
      nurseryId: nursery.id as string,
      laId: (nursery.la_id as string | null) ?? null,
      laName: la?.name ?? null,
      orgName: org?.name ?? null,
      nurseryName: nursery.name ?? null,
      termStructure,
    };
  }

  // 1) nursery on profile
  if (prof?.nursery_id) {
    const { data: nursery } = await supabase
      .from("nurseries")
      .select("id, name, organisation_id, la_id, term_structure")
      .eq("id", prof.nursery_id)
      .maybeSingle();

    return ctxFromNurseryRow(nursery);
  }

  // 2) via grants
  const { data: grants } = await supabase
    .from("role_grants")
    .select("role, org_id, nursery_id")
    .eq("user_id", userId);

  const upper = (s: string | null | undefined) => (s ?? "").toUpperCase();

  const nurseryGrant =
    (grants ?? []).find(
      (g: any) => g.nursery_id && upper(g.role) === "NURSERY_MANAGER"
    ) ||
    (grants ?? []).find((g: any) => g.nursery_id);

  if (nurseryGrant?.nursery_id) {
    const { data: nursery } = await supabase
      .from("nurseries")
      .select("id, name, organisation_id, la_id, term_structure")
      .eq("id", nurseryGrant.nursery_id)
      .maybeSingle();

    return ctxFromNurseryRow(nursery);
  }

  // 3) ORG_ADMIN → first nursery
  const orgAdminGrant = (grants ?? []).find(
    (g: any) => upper(g.role) === "ORG_ADMIN" && g.org_id
  );
  if (!orgAdminGrant?.org_id) return empty;

  const orgId = orgAdminGrant.org_id as string;

  const { data: list } = await supabase
    .from("nurseries")
    .select("id, name, organisation_id, la_id, term_structure")
    .eq("organisation_id", orgId)
    .order("name", { ascending: true });

  const first = (list ?? [])[0] || null;

  return ctxFromNurseryRow(first);
}

/* ---------------------------------------------
   Terms fetch — LA blocks + nursery settings,
   grouped 3 vs 6 based on nursery.term_structure
--------------------------------------------- */

const EMPTY_TERMS = {
  current: null as Term | null,
  next: null as Term | null,
  past: [] as Term[],
  upcoming: [] as Term[],
};

async function fetchTermsForNursery(
  nurseryId: string | null,
  laId: string | null,
  termStructure: "3" | "6"
) {
  if (!nurseryId || !laId) return EMPTY_TERMS;

  const supabase = getSupabaseServer();

  // 1) LA term blocks
  const { data: laTerms, error: laError } = await supabase
    .from("la_term_dates")
    .select("id, term_name, start_date, end_date, academic_year")
    .eq("la_id", laId)
    .order("start_date", { ascending: true });

  if (laError) {
    console.error("la_term_dates select error:", laError);
    return EMPTY_TERMS;
  }

  if (!laTerms || laTerms.length === 0) {
    return EMPTY_TERMS;
  }

  // 2) Nursery settings for those blocks
  const { data: settings, error: settingsError } = await supabase
    .from("nursery_term_settings")
    .select(
      "id, nursery_id, la_term_date_id, enabled, invoice_mode, stretch_mode, stretch_weeks, internal_label, provider_deadline_at, portal_opens_at, portal_closes_at"
    )
    .eq("nursery_id", nurseryId);

  if (settingsError) {
    console.error("nursery_term_settings select error:", settingsError);
  }

  const settingsByLaId = new Map<string, any>();
  (settings ?? []).forEach((s: any) => {
    if (s.la_term_date_id) settingsByLaId.set(s.la_term_date_id, s);
  });

  // 3) Per-block terms (Term 1..Term 6 style)
  const blockTerms: Term[] = (laTerms ?? []).map((t: any) => {
    const s = settingsByLaId.get(t.id) ?? null;
    const start = (t.start_date as string | null) ?? null;
    const end = (t.end_date as string | null) ?? null;

    const baseName =
      (s?.internal_label as string | null) ??
      (t.term_name as string | null) ??
      "Term";

    const season = inferSeason(baseName);

    let year: number | null = null;
    if (typeof t.academic_year === "string") {
      const m = t.academic_year.match(/(\d{4})/);
      if (m) year = Number(m[1]);
    } else if (start) {
      year = new Date(start).getFullYear();
    }

    return {
      id: t.id as string,
      nursery_id: nurseryId,

      name: baseName,
      season,
      year,

      start_date: start,
      end_date: end,

      la_start_date: start,
      la_end_date: end,

      nursery_start_date: start,
      nursery_end_date: end,
      nursery_weeks: (s?.stretch_weeks as number | null) ?? null,

      la_weeks: null,

      provider_deadline:
        (s?.provider_deadline_at as string | null) ?? null,
      la_portal_open: (s?.portal_opens_at as string | null) ?? null,
      la_portal_close: (s?.portal_closes_at as string | null) ?? null,

      la_term_date_id: t.id as string,
      nursery_term_settings_id: (s?.id as string | null) ?? null,

      blocks: [
        {
          id: t.id as string,
          name: baseName,
          start_date: start ?? "",
          end_date: end ?? "",
        },
      ],
    } as Term;
  });

  // If nursery wants the raw 6 blocks, we're done
  if (termStructure === "6") {
    const now = new Date();
    const all = blockTerms;

    const current =
      all.find(
        (t) =>
          t.start_date &&
          t.end_date &&
          new Date(t.start_date) <= now &&
          now <= new Date(t.end_date)
      ) ?? null;

    const upcoming = all.filter(
      (t) => t.start_date && new Date(t.start_date) > now
    );
    const past = all
      .filter((t) => t.end_date && new Date(t.end_date) < now)
      .reverse();

    const next = current
      ? upcoming[0] ?? null
      : all.find(
          (t) => t.start_date && new Date(t.start_date) >= now
        ) ?? null;

    return { current, next, past, upcoming };
  }

  // 4) Group into 3 seasons (Autumn / Spring / Summer)
  type Group = { term: Term; blocks: TermLite[] };

  const groups = new Map<string, Group>();

  const sortedBlocks = [...blockTerms].sort((a, b) => {
    const aStart = a.start_date ? new Date(a.start_date).getTime() : 0;
    const bStart = b.start_date ? new Date(b.start_date).getTime() : 0;
    return aStart - bStart;
  });

  for (const b of sortedBlocks) {
    const season = b.season ?? inferSeason(b.name) ?? "Unknown";
    const yearKey =
      b.year !== null && b.year !== undefined
        ? String(b.year)
        : b.start_date
        ? String(new Date(b.start_date).getFullYear())
        : "Unknown";
    const key = `${yearKey}::${season}`;

    const blk =
      (b.blocks && b.blocks[0]) || {
        id: b.la_term_date_id ?? b.id,
        name: b.name,
        start_date: b.start_date ?? "",
        end_date: b.end_date ?? "",
      };

    const existing = groups.get(key);
    if (!existing) {
      const name = `${season} ${yearKey}`;
      groups.set(key, {
        term: {
          ...b,
          id: `${b.nursery_id ?? "nursery"}::${key}`,
          name,
          season,
          year: Number(yearKey) || b.year || null,
          blocks: [blk],
        },
        blocks: [blk],
      });
    } else {
      const nextBlocks = [...existing.blocks, blk];

      const startDates = nextBlocks
        .map((x) => x.start_date)
        .filter(Boolean)
        .map((d) => new Date(d));
      const endDates = nextBlocks
        .map((x) => x.end_date)
        .filter(Boolean)
        .map((d) => new Date(d));

      const minStart =
        startDates.length > 0
          ? new Date(Math.min(...startDates.map((d) => d.getTime())))
          : null;
      const maxEnd =
        endDates.length > 0
          ? new Date(Math.max(...endDates.map((d) => d.getTime())))
          : null;

      groups.set(key, {
        term: {
          ...existing.term,
          start_date: minStart
            ? minStart.toISOString().slice(0, 10)
            : existing.term.start_date,
          end_date: maxEnd
            ? maxEnd.toISOString().slice(0, 10)
            : existing.term.end_date,
          la_start_date: minStart
            ? minStart.toISOString().slice(0, 10)
            : existing.term.la_start_date,
          la_end_date: maxEnd
            ? maxEnd.toISOString().slice(0, 10)
            : existing.term.la_end_date,
          blocks: nextBlocks,
        },
        blocks: nextBlocks,
      });
    }
  }

  const seasonTerms: Term[] = Array.from(groups.values())
    .map((g) => g.term)
    .sort((a, b) => {
      const aStart = a.start_date ? new Date(a.start_date).getTime() : 0;
      const bStart = b.start_date ? new Date(b.start_date).getTime() : 0;
      return aStart - bStart;
    });

  const now = new Date();

  const current =
    seasonTerms.find(
      (t) =>
        t.start_date &&
        t.end_date &&
        new Date(t.start_date) <= now &&
        now <= new Date(t.end_date)
    ) ?? null;

  const upcoming = seasonTerms.filter(
    (t) => t.start_date && new Date(t.start_date) > now
  );

  const past = seasonTerms
    .filter((t) => t.end_date && new Date(t.end_date) < now)
    .reverse();

  const next = current
    ? upcoming[0] ?? null
    : seasonTerms.find(
        (t) => t.start_date && new Date(t.start_date) >= now
      ) ?? null;

  return { current, next, past, upcoming };
}

/* ---------------------------------------------
   UI bits — Term cards, LA window, links
--------------------------------------------- */

function TermLinks({
  nurseryId,
  termAnchorId,
}: {
  nurseryId?: string | null;
  termAnchorId?: string | null;
}) {
  const href =
    nurseryId && termAnchorId
      ? `/org/audit?nursery_id=${encodeURIComponent(nurseryId)}&term_id=${encodeURIComponent(termAnchorId)}`
      : "/org/audit";

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
      <a className="underline" href="/org/funding">
        Funding
      </a>
      <a className="underline" href="/org/documents">
        Documents
      </a>
      <a className="underline" href={href}>
        Audit
      </a>
    </div>
  );
}

function TermCard({
  title,
  term,
  structure,
}: {
  title: string;
  term: Term | null;
  structure: "3" | "6";
}) {
  if (!term) {
    return (
      <StaffCard title={title}>
        <div style={{ fontSize: 13, opacity: 0.7 }}>No term set.</div>
        <TermLinks />
      </StaffCard>
    );
  }

  const baseYear =
    term.year ??
    (term.start_date ? new Date(term.start_date).getFullYear() : undefined);
  const headerYear = baseYear ? ` ${baseYear}` : "";

  let headerLabel = term.name;
  if (structure === "3") {
    const season = term.season ?? inferSeason(term.name) ?? term.name;
    headerLabel = `${season}${headerYear}`;
  } else {
    headerLabel = `${term.name}${headerYear}`;
  }

  const blocks = term.blocks ?? [];

  const laStart = term.la_start_date ?? term.start_date;
  const laEnd = term.la_end_date ?? term.end_date;

  const nurseryStart = term.nursery_start_date ?? laStart;
  const nurseryEnd = term.nursery_end_date ?? laEnd;

  const termBlockIds =
    (term.blocks?.map((b) => b.id) ??
      [term.la_term_date_id ?? term.id]).filter(Boolean) as string[];

  const auditAnchorId =
    (term.blocks?.[0]?.id ?? term.la_term_date_id ?? term.id) as string;

  const cardTitle = `${title} — ${headerLabel}`;

  return (
    <StaffCard title={cardTitle}>
      <div style={{ display: "grid", gap: 12 }}>
        <TermDeclarationStatusBar
          nurseryId={term.nursery_id}
          termBlockIds={termBlockIds}
          height={6}
        />

        <div
          style={{
            background: "#F6F4EF",
            borderRadius: 8,
            padding: 10,
            display: "grid",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              opacity: 0.7,
              fontWeight: 700,
            }}
          >
            LA dates
          </div>

          <div style={{ display: "grid", gap: 4, fontSize: 12 }}>
            {structure === "3" && blocks.length > 0 ? (
              blocks.map((b) => (
                <div key={b.id}>
                  <span style={{ fontWeight: 600 }}>{b.name}</span>:{" "}
                  {fmtDate(b.start_date)} → {fmtDate(b.end_date)}
                </div>
              ))
            ) : (
              <div>
                <span style={{ fontWeight: 600 }}>{term.name}</span>:{" "}
                {fmtDate(laStart)} → {fmtDate(laEnd)}
              </div>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 12,
              marginTop: 6,
              fontSize: 12,
            }}
          >
            <div>
              <div style={{ opacity: 0.7, fontSize: 11 }}>Portal opens</div>
              <div>
                <b>{fmtDate(term.la_portal_open)}</b>
              </div>
            </div>
            <div>
              <div style={{ opacity: 0.7, fontSize: 11 }}>Portal closes</div>
              <div>
                <b>{fmtDate(term.la_portal_close)}</b>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              opacity: 0.7,
              fontWeight: 700,
            }}
          >
            Nursery dates
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 12,
              fontSize: 13,
            }}
          >
            <div>
              <div style={{ opacity: 0.7, fontSize: 11 }}>Nursery term</div>
              <div>
                <b>{fmtDate(nurseryStart)}</b> → <b>{fmtDate(nurseryEnd)}</b>
              </div>
            </div>

            <div>
              <div style={{ opacity: 0.7, fontSize: 11 }}>Provider deadline</div>
              <div>
                <b>{fmtDate(term.provider_deadline)}</b>
              </div>
            </div>
          </div>
        </div>

        <TermLinks nurseryId={term.nursery_id} termAnchorId={auditAnchorId} />
      </div>
    </StaffCard>
  );
}

function LAWindowCard({ current, next }: { current: Term | null; next: Term | null }) {
  const now = new Date();
  const choice = (() => {
    if (current?.la_portal_open && new Date(current.la_portal_open) > now) {
      return { targetIso: new Date(current.la_portal_open).toISOString(), label: "LA Portal opens in" };
    }
    if (
      current?.la_portal_open &&
      current?.la_portal_close &&
      new Date(current.la_portal_open) <= now &&
      now < new Date(current.la_portal_close)
    ) {
      return { targetIso: new Date(current.la_portal_close).toISOString(), label: "LA Portal closes in" };
    }
    if (next?.la_portal_open && new Date(next.la_portal_open) > now) {
      return { targetIso: new Date(next.la_portal_open).toISOString(), label: "Next LA window opens in" };
    }
    return null;
  })();
  if (!choice?.targetIso) return null;
  return (
    <StaffCard title="LA Portal window" noStretch>
      <LAWindowCountdown targetIso={choice.targetIso} label={choice.label} />
    </StaffCard>
  );
}

function rankRole(role: string) {
  const r = String(role ?? "").toUpperCase();
  if (r === "ORG_ADMIN") return 300;
  if (r === "NURSERY_MANAGER") return 200;
  if (r === "STAFF") return 100;
  return 10;
}


/* ---------------------------------------------
   Page component
--------------------------------------------- */

export default async function OverviewPage({
  searchParams,
}: {
  searchParams?: { [k: string]: string | string[] | undefined };
}) {
  const editTermId =
    typeof searchParams?.editTermId === "string"
      ? searchParams.editTermId
      : null;

    const supabase = getSupabaseServer();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const { user, profile } = await getCurrentUserAndProfile();
  const { nurseryId, laId, laName, orgName, nurseryName, termStructure } =
    await getEffectiveNurseryContext((authUser?.id ?? user?.id) || null);

  let effectiveRole: string | null = null;
  let displayName: string = deriveDisplayName(authUser ?? user, profile);

  const uid = authUser?.id ?? user?.id ?? null;

  if (uid) {
    // Determine orgId for filtering ORG_ADMIN grants when possible
    let orgId: string | null = null;
    if (nurseryId) {
      const { data: nurseryRow } = await supabase
        .from("nurseries")
        .select("organisation_id")
        .eq("id", nurseryId)
        .maybeSingle();
      orgId = (nurseryRow?.organisation_id as string | null) ?? null;
    }

    const { data: grants } = await supabase
      .from("role_grants")
      .select("role, org_id, nursery_id")
      .eq("user_id", uid);

    // ... keep the rest unchanged

    const relevant = (grants ?? []).filter((g: any) => {
      // If we can resolve orgId, keep grants for that org; also keep nursery-specific grants for the resolved nursery
      if (orgId && g.org_id === orgId) return true;
      if (nurseryId && g.nursery_id === nurseryId) return true;
      // Fallback: keep ORG_ADMIN grants even if org not resolved
      if (String(g.role ?? "").toUpperCase() === "ORG_ADMIN") return true;
      return false;
    });

    if (relevant.length > 0) {
      effectiveRole = relevant
        .map((g: any) => String(g.role ?? "").toUpperCase())
        .sort((a, b) => rankRole(b) - rankRole(a))[0] ?? null;
    }
  }

  const terms = await fetchTermsForNursery(
    nurseryId,
    laId,
    termStructure ?? "6"
  );

  const termIdParam =
    typeof searchParams?.term_id === "string" ? searchParams.term_id : null;

  const allTerms: Term[] = [
    ...(terms.current ? [terms.current] : []),
    ...(terms.next ? [terms.next] : []),
    ...terms.upcoming,
    ...terms.past,
  ];

  const selectedTerm =
    (termIdParam
      ? allTerms.find(
          (t) =>
            t.id === termIdParam ||
            t.la_term_date_id === termIdParam ||
            (t.blocks ?? []).some((b) => b.id === termIdParam)
        )
      : null) ??
    terms.current ??
    terms.next ??
    null;

  const sortedByStart = [...allTerms].sort((a, b) => {
    const aStart = a.la_start_date ?? a.start_date ?? "";
    const bStart = b.la_start_date ?? b.start_date ?? "";
    return new Date(aStart).getTime() - new Date(bStart).getTime();
  });

  const idx = selectedTerm
    ? sortedByStart.findIndex((t) => t.id === selectedTerm.id)
    : -1;

  const prevTerm = idx > 0 ? sortedByStart[idx - 1] : null;

  const selLaStart =
    selectedTerm?.la_start_date ?? selectedTerm?.start_date ?? null;
  const selLaEnd =
    selectedTerm?.la_end_date ?? selectedTerm?.end_date ?? null;
  const prevLaStart =
    prevTerm?.la_start_date ?? prevTerm?.start_date ?? null;

  return (
    <div
      style={{
        display: "grid",
        gap: 16,
        gridTemplateColumns: "1fr 380px",
        position: "relative",
      }}
    >
      {/* LEFT */}
      <div style={{ display: "grid", gap: 16 }}>
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "1fr 360px",
            alignItems: "stretch",
          }}
        >
          <StaffCard title="Staff info" variant="compact" noStretch>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "max-content 1fr",
                rowGap: 6,
                columnGap: 12,
                fontSize: 14,
                lineHeight: 1.2,
              }}
            >
              <div style={{ opacity: 0.7 }}>Signed in</div>
              <div>
                <b>{user?.email ?? "—"}</b>
              </div>

              <div style={{ opacity: 0.7 }}>Role</div>
              <div>{effectiveRole ?? profile?.role ?? "—"}</div>

              <div style={{ opacity: 0.7 }}>Display name</div>
              <div>{displayName ?? profile?.display_name ?? "—"}</div>

              <div style={{ opacity: 0.7 }}>Organisation / Nursery</div>
              <div>
                {orgName && nurseryName
                  ? `${orgName} - ${nurseryName}`
                  : nurseryName ?? "—"}
              </div>

              <div style={{ opacity: 0.7 }}>Local authority</div>
              <div>{laName ?? "—"}</div>

              <div style={{ opacity: 0.7 }}>Term structure</div>
              <div>
                {termStructure === "3"
                  ? "3 terms (seasons)"
                  : "6 terms (blocks)"}
              </div>
            </div>
          </StaffCard>

          {LAWindowCard({
            current: terms.current,
            next: terms.next,
          })}
        </div>

        {/* Current / Next cards */}
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "1fr 1fr",
          }}
        >
          <TermCard
            title="Current term"
            term={terms.current}
            structure={termStructure}
          />
          <TermCard
            title="Next term"
            term={terms.next}
            structure={termStructure}
          />
        </div>

        {/* Previous terms */}
        {/* @ts-expect-error Server/Client boundary */}
          <PreviousTermsClient past={terms.past} nurseryId={nurseryId!} />

        {selectedTerm && selLaStart && selLaEnd && nurseryId && (
          <TermChildrenSummary
            nurseryId={nurseryId}
            termLabel={selectedTerm.name}
            laStartIso={selLaStart}
            laEndIso={selLaEnd}
            prevLaStartIso={prevLaStart}
            termBlockIds={
              ((selectedTerm.blocks?.map((b) => b.id) ??
                [selectedTerm.la_term_date_id ?? selectedTerm.id]) as string[]).filter(Boolean)
            }
          />
        )}

        {/* Documents */}
        <StaffCard title="Documents" noStretch>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                To be approved
              </div>
              <FileList status="pending" limit={5} compactEmpty />
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                Still outstanding
              </div>
              <FileList status="requested" limit={5} compactEmpty />
              <div style={{ height: 8 }} />
              <FileList status="review" limit={5} compactEmpty />
            </div>
            <div>
              <a href="/org/documents" style={{ textDecoration: "underline" }}>
                Open Documents
              </a>
            </div>
          </div>
        </StaffCard>
      </div>

      {/* RIGHT */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          alignItems: "stretch",
        }}
      >
        <div style={{ width: "100%" }}>
          <StaffCard title="Notifications" noStretch>
            {/* @ts-expect-error Server/Client boundary */}
            <OverviewNotificationsClient />
          </StaffCard>
        </div>

        <div style={{ width: "100%" }}>
          <StaffCard title="Messages" noStretch>
            {/* @ts-expect-error Server/Client boundary */}
            <OverviewMessagesSnippetClient />
          </StaffCard>
        </div>
      </div>

      {/* --- Edit Term modal (query-driven) --- */}
      {(() => {
        const allTerms: Term[] = [
          ...(terms.current ? [terms.current] : []),
          ...(terms.next ? [terms.next] : []),
          ...terms.upcoming,
          ...terms.past,
        ];
        const termToEdit =
          allTerms.find((t) => t.id === editTermId) ?? null;
        const showEditModal = !!termToEdit;
        if (!showEditModal || !termToEdit) return null;

        return (
          <>
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.4)",
                zIndex: 80,
              }}
            />
            <div
              style={{
                position: "fixed",
                inset: 0,
                display: "grid",
                placeItems: "center",
                zIndex: 81,
                padding: 16,
              }}
            >
              <div
                style={{
                  width: "min(960px, 100%)",
                  maxHeight: "90vh",
                  overflow: "auto",
                  background: "#fff",
                  border: "1px solid #E6E4E0",
                  borderRadius: 12,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.20)",
                  display: "grid",
                  gridTemplateRows: "auto 1fr",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    borderBottom: "1px solid #EEE",
                  }}
                >
                  <div style={{ fontWeight: 800 }}>
                    Edit term — {termToEdit.name}
                  </div>
                  <a
                    href="/org/nursery/overview"
                    aria-label="Close"
                    style={{
                      display: "inline-flex",
                      width: 32,
                      height: 32,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 8,
                      border: "1px solid #E5E7EB",
                      background: "#fff",
                      color: "#24364B",
                      textDecoration: "none",
                      fontWeight: 800,
                    }}
                  >
                    ×
                  </a>
                </div>

                <div style={{ padding: 16, display: "grid", gap: 16 }}>
                  <div
                    style={{
                      border: "1px solid #EEE",
                      borderRadius: 10,
                      padding: 12,
                      display: "grid",
                      gap: 8,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                      Dates overview
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                        gap: 12,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            opacity: 0.7,
                          }}
                        >
                          LA dates
                        </div>
                        <div>
                          <b>
                            {fmtDate(
                              termToEdit.la_start_date ?? termToEdit.start_date
                            )}
                          </b>{" "}
                          →{" "}
                          <b>
                            {fmtDate(
                              termToEdit.la_end_date ?? termToEdit.end_date
                            )}
                          </b>
                        </div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            opacity: 0.7,
                          }}
                        >
                          Nursery dates
                        </div>
                        <div>
                          <b>
                            {fmtDate(
                              termToEdit.nursery_start_date ??
                                termToEdit.la_start_date ??
                                termToEdit.start_date
                            )}
                          </b>{" "}
                          →{" "}
                          <b>
                            {fmtDate(
                              termToEdit.nursery_end_date ??
                                termToEdit.la_end_date ??
                                termToEdit.end_date
                            )}
                          </b>
                        </div>
                      </div>
                    </div>

                    {termToEdit.blocks && termToEdit.blocks.length > 0 && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: 8,
                          borderRadius: 8,
                          background: "#F6F4EF",
                        }}
                      >
                        {termToEdit.blocks.map((b) => (
                          <div key={b.id}>
                            <span style={{ fontWeight: 600 }}>{b.name}</span>
                            : {fmtDate(b.start_date)} → {fmtDate(b.end_date)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      border: "1px solid #EEE",
                      borderRadius: 10,
                      padding: 12,
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>
                      Nursery deadlines &amp; LA window
                    </div>
                    {/* @ts-expect-error Server/Client boundary */}
                    <TermEditFormClient term={termToEdit} />
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}