// app/admin/nurseries/NurseryFilters.tsx
"use client";

import React, { useMemo, useState } from "react";

export type NurseryRow = {
  id: string;
  name: string | null;
  organisation_id: string | null;
  organisation_name: string | null;
  county: string | null;
  country: string | null;
  contact_phone: string | null;
  created_at: string | null;
  status: string | null;
  active_children: number | null;
};

export default function NurseryFilters({
  initialNurseries,
  organisations,
  counties,
}: {
  initialNurseries: NurseryRow[];
  organisations: { id: string; name: string }[];
  counties: string[];
}) {
  const [q, setQ] = useState("");
  const [orgId, setOrgId] = useState<string>("");
  const [county, setCounty] = useState<string>("");
  const [sort, setSort] = useState<"alpha" | "member" | "children">("alpha");

  const filtered = useMemo(() => {
    let rows = [...initialNurseries];

    if (q.trim()) {
      const needle = q.toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.name || "").toLowerCase().includes(needle) ||
          (r.organisation_name || "").toLowerCase().includes(needle)
      );
    }
    if (orgId) rows = rows.filter((r) => r.organisation_id === orgId);
    if (county) rows = rows.filter((r) => r.county === county);

    switch (sort) {
      case "member":
        rows.sort(
          (a, b) =>
            new Date(a.created_at || 0).getTime() -
            new Date(b.created_at || 0).getTime()
        );
        break;
      case "children":
        rows.sort(
          (a, b) => (b.active_children || 0) - (a.active_children || 0)
        );
        break;
      case "alpha":
      default:
        rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }

    return rows;
  }, [q, orgId, county, sort, initialNurseries]);

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E6E4E0",
        borderRadius: 10,
        padding: 12,
      }}
    >
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}
      >
        <input
          className="border rounded p-2"
          placeholder="Search nursery or organisation…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 240 }}
        />
        <select
          className="border rounded p-2"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
        >
          <option value="">All organisations</option>
          {organisations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          className="border rounded p-2"
          value={county}
          onChange={(e) => setCounty(e.target.value)}
        >
          <option value="">All counties</option>
          {counties.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <SortButton active={sort === "alpha"} onClick={() => setSort("alpha")}>
            Sort A→Z
          </SortButton>
          <SortButton
            active={sort === "member"}
            onClick={() => setSort("member")}
          >
            Sort by member since
          </SortButton>
          <SortButton
            active={sort === "children"}
            onClick={() => setSort("children")}
          >
            Sort by active children
          </SortButton>
        </div>
      </div>

      {/* Clickable/hoverable rows */}
      <div style={{ border: "1px solid #EEE", borderRadius: 8, overflow: "hidden" }}>
        <div
          style={{
            background: "#FAFAFA",
            display: "grid",
            gridTemplateColumns:
              "1.6fr 1.2fr 0.8fr 0.8fr 0.8fr 0.6fr",
            padding: "10px 12px",
            fontWeight: 600,
          }}
        >
          <div>Nursery</div>
          <div>Organisation</div>
          <div>County</div>
          <div>Member since</div>
          <div>Active children</div>
          <div>Status</div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 14, color: "#666" }}>No results.</div>
        ) : (
          filtered.map((r) => (
            <a
              key={r.id}
              href={`/admin/nurseries/${r.id}`}
              className="hover:bg-gray-50"
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1.6fr 1.2fr 0.8fr 0.8fr 0.8fr 0.6fr",
                padding: "12px 14px",
                borderTop: "1px solid #EEE",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <strong>{r.name || "—"}</strong>
                <span style={{ fontSize: 12, color: "#666" }}>
                  {r.contact_phone || "—"}
                </span>
              </div>
              <div>{r.organisation_name || "—"}</div>
              <div>{r.county || "—"}</div>
              <div>
                {r.created_at
                  ? new Date(r.created_at).toLocaleDateString()
                  : "—"}
              </div>
              <div>{r.active_children ?? "—"}</div>
              <div>
                <StatusPill s={r.status} />
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}

function SortButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
) {
  const { active, children, ...rest } = props;
  return (
    <button
      {...rest}
      className="rounded px-3 py-2 border"
      style={{ background: active ? "#F4F4F4" : "#FFF" }}
      type="button"
    >
      {children}
    </button>
  );
}

function StatusPill({ s }: { s?: string | null }) {
  const status = (s || "ACTIVE").toUpperCase();
  const map: Record<string, string> = {
    ACTIVE: "#E7F7ED",
    PENDING: "#FFF6E5",
    ONBOARDING: "#FFF6E5",
    SUSPENDED: "#FDEAEA",
    INACTIVE: "#F2F2F2",
  };
  const col: Record<string, string> = {
    ACTIVE: "#235D3F",
    PENDING: "#7A5A12",
    ONBOARDING: "#7A5A12",
    SUSPENDED: "#7A1A1A",
    INACTIVE: "#444",
  };
  const bg = map[status] ?? "#F2F2F2";
  const fg = col[status] ?? "#333";
  return (
    <span
      style={{
        background: bg,
        color: fg,
        border: "1px solid #E5E5E5",
        borderRadius: 999,
        padding: "2px 8px",
        fontSize: 12,
      }}
    >
      {status}
    </span>
  );
}
