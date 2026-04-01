// app/org/nursery/overview/TermChildrenSummary.tsx
import StaffCard from "@/components/StaffCard";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import StartingChildrenStatusTableClient from "./StartingChildrenStatusTableClient";

type Props = {
  nurseryId: string;
  termLabel: string;
  termBlockIds: string[];
  laStartIso: string; // YYYY-MM-DD or ISO
  laEndIso: string;   // YYYY-MM-DD or ISO
  prevLaStartIso?: string | null;
};

type ChildRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  start_date: string | null;
  end_date: string | null;
  claim_working_parent: boolean | null;
  claim_disadvantaged2: boolean | null;
};

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

function toDate(d?: string | null): Date | null {
  if (!d) return null;
  const x = new Date(d);
  return isNaN(x.getTime()) ? null : x;
}

function fmt(d?: string | null) {
  const x = toDate(d);
  return x ? x.toLocaleDateString("en-GB") : "—";
}

function betweenInclusive(d: Date, start: Date, end: Date) {
  const t = d.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function monthsBetween(dobIso?: string | null, refIso?: string | null): number {
  if (!dobIso || !refIso) return -1;
  const d = new Date(dobIso);
  const r = new Date(refIso);
  if (isNaN(d.getTime()) || isNaN(r.getTime())) return -1;
  let y = r.getFullYear() - d.getFullYear();
  let m = r.getMonth() - d.getMonth();
  if (r.getDate() < d.getDate()) m -= 1;
  if (m < 0) {
    y -= 1;
    m += 12;
  }
  return y * 12 + m;
}

function computeEntitlements(
  flags: { WP: boolean; D2: boolean },
  dobIso: string | null,
  termStartIso: string
): { pills: string[]; hours: 0 | 15 | 30 } {
  const ageM = monthsBetween(dobIso, termStartIso);
  if (ageM < 0) return { pills: [], hours: 0 };

  const { WP, D2 } = flags;
  const pills: string[] = [];

  // outside EYFS entitlement range (rough)
  if (ageM < 9 || ageM >= 60) return { pills, hours: 0 };

  // Under 3, WP-only: show WP30 (per your existing logic)
  if (ageM < 36 && WP && !D2) {
    pills.push("WP30");
    return { pills, hours: 30 };
  }

  // 9–23 months
  if (ageM < 24) {
    if (WP) pills.push("WP15", "WP15"); // 30h total
  }
  // 24–35 months (age 2)
  else if (ageM < 36) {
    if (D2 && WP) pills.push("D215", "WP15"); // stack to 30h
    else if (D2) pills.push("D215");
  }
  // 36–59 months (age 3–4)
  else {
    pills.push("U15");
    if (WP) pills.push("WP15");
  }

  const capped = pills.slice(0, 2);
  return {
    pills: capped,
    hours: (capped.length * 15) as 0 | 15 | 30,
  };
}

function pillsKey(pills: string[]) {
  if (!pills || pills.length === 0) return "—";
  return pills.join(" + ");
}

export default async function TermChildrenSummary({
  nurseryId,
  termLabel,
  laStartIso,
  laEndIso,
  prevLaStartIso = null,
  termBlockIds,
}: Props) {
  const supabase = getSupabaseServer();

  const laStart = toDate(laStartIso);
  const laEnd = toDate(laEndIso);

  if (!laStart || !laEnd) {
    return (
      <StaffCard title="Term insights" noStretch>
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          Could not resolve term date range.
        </div>
      </StaffCard>
    );
  }

  // NOTE: assumes children table has start_date and end_date columns.
  // If yours are named differently, tell me the column names and I’ll adjust.
  const { data: children, error } = await supabase
    .from("children")
    .select(
      "id, first_name, last_name, date_of_birth, start_date, end_date, claim_working_parent, claim_disadvantaged2"
    )
    .eq("nursery_id", nurseryId)
    .order("last_name", { ascending: true });

  if (error) {
    return (
      <StaffCard title={`Term insights — ${termLabel}`} noStretch>
        <div style={{ fontSize: 13, color: "#8A1F1F" }}>
          Failed to load children: {error.message}
        </div>
      </StaffCard>
    );
  }

  const list = (children ?? []) as ChildRow[];

  const starting = list.filter((c) => {
    const d = toDate(c.start_date);
    return d ? betweenInclusive(d, laStart, laEnd) : false;
  });

  const leaving = list.filter((c) => {
    const d = toDate(c.end_date);
    return d ? betweenInclusive(d, laStart, laEnd) : false;
  });

  // Funding changes: compare entitlements at previous term start vs this term start.
  // This focuses on age-driven changes (your examples: turning 3, losing D2, gaining U15).
  const changes =
    prevLaStartIso && toDate(prevLaStartIso)
      ? list
          .map((c) => {
            const flags = {
              WP: !!c.claim_working_parent,
              D2: !!c.claim_disadvantaged2,
            };

            const prev = computeEntitlements(flags, c.date_of_birth, prevLaStartIso);
            const next = computeEntitlements(flags, c.date_of_birth, laStartIso);

            const prevKey = pillsKey(prev.pills);
            const nextKey = pillsKey(next.pills);

            if (prevKey === nextKey) return null;

            // basic reason tags
            const prevAgeM = monthsBetween(c.date_of_birth, prevLaStartIso);
            const nextAgeM = monthsBetween(c.date_of_birth, laStartIso);
            let reason = "Eligibility change";
            if (prevAgeM >= 0 && nextAgeM >= 0) {
              if (prevAgeM < 36 && nextAgeM >= 36) reason = "Turns 3 (Universal begins)";
              if (prevAgeM >= 24 && prevAgeM < 36 && nextAgeM >= 36 && flags.D2)
                reason = "Turns 3 (D2 ends)";
            }

            return {
              id: c.id,
              name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Unnamed",
              dob: c.date_of_birth,
              from: prevKey,
              to: nextKey,
              reason,
            };
          })
          .filter(Boolean) as Array<{
          id: string;
          name: string;
          dob: string | null;
          from: string;
          to: string;
          reason: string;
        }>
      : [];

  // --- Render ---
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          fontSize: 18,
          fontWeight: 800, 
          color: "#24364B",
          marginTop: 2,
          paddingLeft: 16,
        }}
      >
        <b>Movements in {termLabel}</b>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        <StaffCard title="Children starting this term" noStretch>
           {/* @ts-expect-error Server/Client boundary */}
          <StartingChildrenStatusTableClient
            nurseryId={nurseryId}
            termBlockIds={termBlockIds}
            children={starting.map((c) => ({
              id: c.id,
              name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Unnamed",
              start_date: c.start_date,
            }))}
          />
        </StaffCard>

        <StaffCard title="Children leaving this term" noStretch>
          {leaving.length === 0 ? (
            <div style={{ fontSize: 13, opacity: 0.7 }}>None.</div>
          ) : (
            <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
              {leaving.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Unnamed"}
                  </div>
                  <div style={{ opacity: 0.7 }}>{fmt(c.end_date)}</div>
                </div>
              ))}
            </div>
          )}
        </StaffCard>
      </div>

      <StaffCard title="Funding changes this term" noStretch>
        {!prevLaStartIso ? (
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Not enough term history to compute changes.
          </div>
        ) : changes.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            No funding eligibility changes detected at term start.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #EEE" }}>
                  <th style={{ padding: "8px 6px" }}>Child</th>
                  <th style={{ padding: "8px 6px" }}>DOB</th>
                  <th style={{ padding: "8px 6px" }}>From</th>
                  <th style={{ padding: "8px 6px" }}>To</th>
                  <th style={{ padding: "8px 6px" }}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #F2F1EE" }}>
                    <td style={{ padding: "8px 6px", fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: "8px 6px", opacity: 0.8 }}>{fmt(r.dob)}</td>
                    <td style={{ padding: "8px 6px" }}>{r.from}</td>
                    <td style={{ padding: "8px 6px" }}>{r.to}</td>
                    <td style={{ padding: "8px 6px", opacity: 0.85 }}>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StaffCard>
    </div>
  );
}