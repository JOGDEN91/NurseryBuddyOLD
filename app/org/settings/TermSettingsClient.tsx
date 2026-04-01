"use client";

import React, { useEffect, useMemo, useState } from "react";

type Props = {
  nurseries: Array<{ id: string; name: string }>;
};

type BlockItem = {
  id: string; // la_term_dates.id
  term_name: string;
  academic_year: string | null;
  start_date: string | null;
  end_date: string | null;
  nursery_start_date: string | null;
  nursery_end_date: string | null;
  provider_deadline_at: string | null;
  portal_opens_at: string | null;
  portal_closes_at: string | null;
  enabled: boolean;
};

type BlockLite = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
};

type SeasonRow = {
  key: string; // e.g. "2025::Autumn"
  name: string; // e.g. "Autumn 2025"
  season: string;
  yearLabel: string;
  la_start_date: string | null;
  la_end_date: string | null;
  nursery_start_date: string | null;
  nursery_end_date: string | null;
  provider_deadline_at: string | null;
  portal_opens_at: string | null;
  portal_closes_at: string | null;
  block_ids: string[];
  blocks: BlockLite[];
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E6E4E0",
  borderRadius: 10,
  padding: 12,
};
const subtle: React.CSSProperties = { fontSize: 12, color: "#6C7A89" };
const btnEdit: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #4CAF78",
  background: "#4CAF78",
  color: "#fff",
  fontWeight: 700,
  textDecoration: "none",
  fontSize: 12,
  display: "inline-block",
};
const inputCss: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid #DADADA",
  background: "#fff",
  fontSize: 13,
};

function fmtDate(d?: string | null) {
  return d ? new Date(d).toLocaleDateString("en-GB") : "—";
}
function fmtDateTime(d?: string | null) {
  return d ? new Date(d).toLocaleString("en-GB") : "—";
}
function toInputLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
function fromInputLocal(local: string) {
  if (!local) return null;
  const d = new Date(local);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
}
function inferSeason(
  name?: string | null
): "Autumn" | "Spring" | "Summer" | "Unknown" {
  if (!name) return "Unknown";
  const lower = name.toLowerCase();
  if (lower.includes("autumn")) return "Autumn";
  if (lower.includes("spring")) return "Spring";
  if (lower.includes("summer")) return "Summer";
  return "Unknown";
}

export default function TermSettingsClient({ nurseries }: Props) {
  const [mode, setMode] = useState<"organisation" | "nursery">("organisation");
  const [nurseryId, setNurseryId] = useState<string | null>(
    nurseries[0]?.id ?? null
  );

  const [rows, setRows] = useState<SeasonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  // Modal state
  const [editingRow, setEditingRow] = useState<SeasonRow | null>(null);
  const [editStart, setEditStart] = useState<string>("");
  const [editEnd, setEditEnd] = useState<string>("");
  const [editOpen, setEditOpen] = useState<string>("");
  const [editClose, setEditClose] = useState<string>("");
  const [editDeadline, setEditDeadline] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const selectedNurseryName = useMemo(
    () => nurseries.find((n) => n.id === nurseryId)?.name ?? "",
    [nurseries, nurseryId]
  );

  // follow scope from SettingsClient (org/nursery + current nurseryId)
  useEffect(() => {
    const handler = (e: Event) => {
      const det = (e as CustomEvent).detail || {};
      const nextMode =
        (det.mode as "organisation" | "nursery") || "organisation";
      const nextNurseryId = (det.nurseryId as string | null) ?? null;
      setMode(nextMode);
      setNurseryId(nextNurseryId);
    };
    window.addEventListener("org-settings-scope", handler as EventListener);
    return () =>
      window.removeEventListener(
        "org-settings-scope",
        handler as EventListener
      );
  }, []);

  async function loadRows(currMode = mode, currNurseryId = nurseryId) {
    if (currMode !== "nursery" || !currNurseryId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setBanner(null);
    try {
      const url = new URL("/api/nursery-term-settings", window.location.origin);
      url.searchParams.set("nurseryId", currNurseryId);
      const res = await fetch(url.toString(), {
        cache: "no-store",
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Failed to load term settings");

      const blocks = (j.items ?? []) as BlockItem[];
      const seasons = groupBlocksIntoSeasons(blocks);
      setRows(seasons);
    } catch (e: any) {
      setBanner(e?.message || "Failed to load term settings");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, nurseryId]);

  function openEdit(row: SeasonRow) {
    setEditingRow(row);
    setModalError(null);
    setEditStart(row.nursery_start_date ?? "");
    setEditEnd(row.nursery_end_date ?? "");
    setEditOpen(row.portal_opens_at ?? "");
    setEditClose(row.portal_closes_at ?? "");
    setEditDeadline(row.provider_deadline_at ?? "");
  }

  function closeEdit() {
    setEditingRow(null);
    setModalError(null);
    setSaving(false);
  }

      async function saveEdit() {
    if (!nurseryId || !editingRow) return;
    setSaving(true);
    setModalError(null);

    try {
      // build one body per underlying LA block (Term1, Term2, etc.)
      const payloads = editingRow.block_ids.map((id) => ({
        nursery_id: nurseryId,
        la_term_date_id: id,
        nursery_start_date: editStart || null,      // "YYYY-MM-DD" or null
        nursery_end_date: editEnd || null,          // "YYYY-MM-DD" or null
        portal_opens_at: editOpen || null,          // "YYYY-MM-DD" or null
        portal_closes_at: editClose || null,        // "YYYY-MM-DD" or null
        provider_deadline_at: editDeadline || null, // "YYYY-MM-DD" or null
      }));

      const results = await Promise.all(
        payloads.map((body) =>
          fetch("/api/nursery-term-settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            cache: "no-store",
            body: JSON.stringify(body),
          }).then(async (res) => ({
            ok: res.ok,
            json: await res.json().catch(() => ({})),
          }))
        )
      );

      const failed = results.find((r) => !r.ok);
      if (failed) {
        throw new Error(failed.json?.error || "One or more saves failed");
      }

      await loadRows("nursery", nurseryId);
      closeEdit();
      setBanner("Term settings saved.");
    } catch (e: any) {
      setModalError(e?.message || "Save failed");
      setSaving(false);
    }
  }

  return (
    <>
      <div style={{ ...card, display: "grid", gap: 12 }}>
        <div
          style={{
            fontWeight: 800,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Term dates &amp; nursery settings</span>
          <span style={subtle}>
            {mode === "organisation"
              ? "Organisation scope"
              : `Nursery: ${selectedNurseryName || "—"}`}
          </span>
        </div>

        {banner && (
          <div
            style={{
              background: "#FFF8E6",
              border: "1px solid #F2D27A",
              color: "#6A4A0C",
              padding: 8,
              borderRadius: 8,
            }}
          >
            {banner}
          </div>
        )}

        {mode === "organisation" && (
          <div style={{ ...subtle }}>
            Local Authorities define term blocks in{" "}
            <b>Autumn, Spring and Summer</b>. Switch to <b>Nursery</b> scope to
            view seasonal terms and open the full <b>term edit card</b>.
          </div>
        )}

        {mode === "nursery" && !nurseryId && (
          <div
            style={{
              background: "#FFF8E6",
              border: "1px solid #F2D27A",
              color: "#6A4A0C",
              padding: 8,
              borderRadius: 8,
            }}
          >
            Select a nursery in the Settings header to view term settings.
          </div>
        )}

        {mode === "nursery" && nurseryId && (
          <>
            <div style={{ ...subtle, marginTop: -4 }}>
              Each row is a <b>seasonal term</b> (Autumn, Spring, Summer) built
              from the LA&rsquo;s Term 1/2, 3/4, 5/6 blocks. LA dates and blocks
              are fixed; use the <b>Edit</b> button to adjust nursery term
              dates, portal windows and provider deadlines in a dedicated term
              editor.
            </div>

            {loading ? (
              <div style={{ opacity: 0.7 }}>Loading…</div>
            ) : rows.length === 0 ? (
              <div style={{ opacity: 0.7 }}>
                No LA term dates found for this nursery&apos;s local authority.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 12,
                  }}
                >
                  <thead style={{ background: "#FAFAFA" }}>
                    <tr>
                      <Th style={{ minWidth: 190 }}>Seasonal term</Th>
                      <Th style={{ minWidth: 230 }}>
                        LA dates &amp; term blocks
                      </Th>
                      <Th style={{ minWidth: 170 }}>
                        Nursery term dates (start / end)
                      </Th>
                      <Th style={{ minWidth: 170 }}>
                        Portal opens (nursery)
                      </Th>
                      <Th style={{ minWidth: 170 }}>
                        Portal closes (nursery)
                      </Th>
                      <Th style={{ minWidth: 170 }}>Provider deadline</Th>
                      <Th style={{ width: 90 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.key}
                        style={{ borderTop: "1px solid #F3F3F3" }}
                      >
                        <Td>
                          <div style={{ fontWeight: 600 }}>{r.name}</div>
                          <div style={{ opacity: 0.7, marginTop: 2 }}>
                            ({r.season} • {r.yearLabel})
                          </div>
                        </Td>
                        <Td>
                          <div>
                            <b>{fmtDate(r.la_start_date)}</b> →{" "}
                            <b>{fmtDate(r.la_end_date)}</b>
                          </div>
                          {r.blocks.length > 0 && (
                            <div
                              style={{
                                marginTop: 4,
                                fontSize: 14,
                                paddingLeft: 6,
                                borderLeft: "2px solid #E0DED8",
                                display: "grid",
                                gap: 2,
                              }}
                            >
                              {r.blocks.map((b) => (
                                <div key={b.id}>
                                  <span style={{ fontWeight: 600 }}>
                                    {b.name}
                                  </span>
                                  : {fmtDate(b.start_date)} →{" "}
                                  {fmtDate(b.end_date)}
                                </div>
                              ))}
                            </div>
                          )}
                        </Td>
                        <Td>
                          <div>
                            {fmtDate(r.nursery_start_date)} →{" "}
                            {fmtDate(r.nursery_end_date)}
                          </div>
                        </Td>
                        <Td>{fmtDate(r.portal_opens_at)}</Td>
                        <Td>{fmtDate(r.portal_closes_at)}</Td>
                        <Td>{fmtDate(r.provider_deadline_at)}</Td>
                        <Td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            style={btnEdit}
                            onClick={() => openEdit(r)}
                          >
                            Edit
                          </button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {editingRow && (
        <>
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
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
                width: "min(900px, 100%)",
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
                  Edit term — {editingRow.name}
                </div>
                <button
                  type="button"
                  onClick={closeEdit}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: "1px solid #E5E7EB",
                    background: "#fff",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>

              <div
                style={{
                  padding: 16,
                  display: "grid",
                  gap: 16,
                }}
              >
                {/* LA & nursery dates overview */}
                <div
                  style={{
                    border: "1px solid #EEE",
                    borderRadius: 10,
                    padding: 12,
                    display: "grid",
                    gap: 8,
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
                      fontSize: 13,
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
                        <b>{fmtDate(editingRow.la_start_date)}</b> →{" "}
                        <b>{fmtDate(editingRow.la_end_date)}</b>
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
                        Nursery term dates
                      </div>
                      <div>
                        <b>{fmtDate(editStart || editingRow.nursery_start_date)}</b>{" "}
                        →{" "}
                        <b>{fmtDate(editEnd || editingRow.nursery_end_date)}</b>
                      </div>
                    </div>
                  </div>
                  {editingRow.blocks.length > 0 && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: 8,
                        borderRadius: 8,
                        background: "#F6F4EF",
                        fontSize: 12,
                      }}
                    >
                      {editingRow.blocks.map((b) => (
                        <div key={b.id}>
                          <span style={{ fontWeight: 600 }}>{b.name}</span>:{" "}
                          {fmtDate(b.start_date)} → {fmtDate(b.end_date)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Editable fields */}
                <div
                  style={{
                    border: "1px solid #EEE",
                    borderRadius: 10,
                    padding: 12,
                    display: "grid",
                    gap: 12,
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>
                    Nursery term dates &amp; deadlines
                  </div>

                  {/* Nursery term dates */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                    }}
                  >
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ opacity: 0.8 }}>Nursery Term Start</span>
                      <input
                        type="date"
                        style={inputCss}
                        value={editStart}
                        onChange={(e) => setEditStart(e.target.value)}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ opacity: 0.8 }}>Nursery Term End</span>
                      <input
                        type="date"
                        style={inputCss}
                        value={editEnd}
                        onChange={(e) => setEditEnd(e.target.value)}
                      />
                    </label>
                  </div>

                  {/* Portal + provider deadlines */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                      gap: 8,
                    }}
                  >
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ opacity: 0.8 }}>Portal Opens</span>
                      <input
                        type="date"
                        style={inputCss}
                        value={editOpen}
                        onChange={(e) => setEditOpen(e.target.value)}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ opacity: 0.8 }}>Portal Closes</span>
                      <input
                        type="date"
                        style={inputCss}
                        value={editClose}
                        onChange={(e) => setEditClose(e.target.value)}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ opacity: 0.8 }}>Provider Deadline</span>
                      <input
                        type="date"
                        style={inputCss}
                        value={editDeadline}
                        onChange={(e) => setEditDeadline(e.target.value)}
                      />
                    </label>
                  </div>

                  {modalError && (
                    <div
                      style={{
                        color: "#8A1F1F",
                        fontSize: 12,
                        marginTop: 4,
                      }}
                    >
                      {modalError}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 8,
                      marginTop: 8,
                    }}
                  >
                    <button
                      type="button"
                      onClick={closeEdit}
                      style={{
                        ...btnEdit,
                        background: "#fff",
                        color: "#24364B",
                        borderColor: "#DADADA",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={saving}
                      style={btnEdit}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ---------- table helpers ---------- */
function Th({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "8px 10px",
        borderBottom: "1px solid #EEE",
        fontWeight: 600,
        ...style,
      }}
    >
      {children}
    </th>
  );
}
function Td({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return <td style={{ padding: "8px 10px", ...style }}>{children}</td>;
}

/* ---------- grouping: 6 LA blocks → seasonal rows ---------- */

function groupBlocksIntoSeasons(blocks: BlockItem[]): SeasonRow[] {
  if (!blocks || blocks.length === 0) return [];

  const sorted = [...blocks].sort((a, b) => {
    const aStart = a.start_date ? new Date(a.start_date).getTime() : 0;
    const bStart = b.start_date ? new Date(b.start_date).getTime() : 0;
    return aStart - bStart;
  });

  type Group = {
    season: string;
    yearLabel: string;
    la_start_date: string | null;
    la_end_date: string | null;
    nursery_start_date: string | null;
    nursery_end_date: string | null;
    provider_deadline_at: string | null;
    portal_opens_at: string | null;
    portal_closes_at: string | null;
    block_ids: string[];
    blocks: BlockLite[];
  };

  const groups = new Map<string, Group>();

  for (const b of sorted) {
    const season = inferSeason(b.term_name);
    const acYear = b.academic_year || "";

    let yearLabel = "";
    const m = acYear.match(/(\d{4})/);
    if (m) {
      yearLabel = m[1];
    } else if (b.start_date) {
      yearLabel = String(new Date(b.start_date).getFullYear());
    }

    const key = `${yearLabel || acYear}::${season}`;

    const start = b.start_date ? new Date(b.start_date) : null;
    const end = b.end_date ? new Date(b.end_date) : null;

    const blockLite: BlockLite = {
      id: b.id,
      name: b.term_name,
      start_date: b.start_date,
      end_date: b.end_date,
    };

    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        season,
        yearLabel: yearLabel || acYear || "",
        la_start_date: start
          ? start.toISOString().slice(0, 10)
          : b.start_date,
        la_end_date: end ? end.toISOString().slice(0, 10) : b.end_date,
        nursery_start_date: b.nursery_start_date,
        nursery_end_date: b.nursery_end_date,
        provider_deadline_at: b.provider_deadline_at,
        portal_opens_at: b.portal_opens_at,
        portal_closes_at: b.portal_closes_at,
        block_ids: [b.id],
        blocks: [blockLite],
      });
    } else {
      const blockIds = [...existing.block_ids, b.id];
      const blocksLite = [...existing.blocks, blockLite];

      const startDates = [
        existing.la_start_date,
        start ? start.toISOString().slice(0, 10) : b.start_date,
      ].filter(Boolean) as string[];
      const endDates = [
        existing.la_end_date,
        end ? end.toISOString().slice(0, 10) : b.end_date,
      ].filter(Boolean) as string[];

      const minStart =
        startDates.length > 0
          ? startDates.reduce((min, val) =>
              new Date(val) < new Date(min) ? val : min
            )
          : existing.la_start_date;
      const maxEnd =
        endDates.length > 0
          ? endDates.reduce((max, val) =>
              new Date(val) > new Date(max) ? val : max
            )
          : existing.la_end_date;

      groups.set(key, {
        season: existing.season,
        yearLabel: existing.yearLabel,
        la_start_date: minStart,
        la_end_date: maxEnd,
        nursery_start_date:
          b.nursery_start_date ?? existing.nursery_start_date,
        nursery_end_date: b.nursery_end_date ?? existing.nursery_end_date,
        provider_deadline_at:
          b.provider_deadline_at ?? existing.provider_deadline_at,
        portal_opens_at:
          b.portal_opens_at ?? existing.portal_opens_at,
        portal_closes_at:
          b.portal_closes_at ?? existing.portal_closes_at,
        block_ids: blockIds,
        blocks: blocksLite,
      });
    }
  }

  const result: SeasonRow[] = Array.from(groups.entries()).map(
    ([key, g]) => ({
      key,
      name: `${g.season === "Unknown" ? "Term" : g.season} ${
        g.yearLabel || ""
      }`.trim(),
      season: g.season,
      yearLabel: g.yearLabel || "",
      la_start_date: g.la_start_date,
      la_end_date: g.la_end_date,
      nursery_start_date: g.nursery_start_date,
      nursery_end_date: g.nursery_end_date,
      provider_deadline_at: g.provider_deadline_at,
      portal_opens_at: g.portal_opens_at,
      portal_closes_at: g.portal_closes_at,
      block_ids: g.block_ids,
      blocks: g.blocks,
    })
  );

  return result.sort((a, b) => {
    const aStart = a.la_start_date
      ? new Date(a.la_start_date).getTime()
      : 0;
    const bStart = b.la_start_date
      ? new Date(b.la_start_date).getTime()
      : 0;
    return aStart - bStart;
  });
}