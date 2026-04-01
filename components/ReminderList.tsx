"use client";

import { useEffect, useMemo, useState } from "react";

type Reminder = {
  id: string;
  title: string;
  notes: string | null;
  status: "pending" | "done";
  due_at: string; // ISO
  creator_id: string;
  assignee_id: string;
  source?: string | null;
};

export default function ReminderList({
  mode,
  readOnly = false,
}: {
  mode: "self" | "nursery";
  readOnly?: boolean;
}) {
  const [items, setItems] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reminders", {
        cache: "no-store",
        credentials: "include", // <<< IMPORTANT: send cookies
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to load");
      setItems(body.items || []);
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function createReminder() {
    if (readOnly || !newTitle.trim()) return;
    const res = await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // <<< send cookies
      body: JSON.stringify({ title: newTitle }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return alert(body?.error || "Create failed");
    setNewTitle("");
    load();
  }

  async function markDone(id: string) {
    if (readOnly) return;
    const res = await fetch(`/api/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // <<< send cookies
      body: JSON.stringify({ status: "done" }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return alert(body?.error || "Update failed");
    load();
  }

  async function remove(id: string) {
    if (readOnly) return;
    const res = await fetch(`/api/reminders/${id}`, {
      method: "DELETE",
      credentials: "include", // <<< send cookies
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return alert(body?.error || "Delete failed");
    load();
  }

  // ---------- helpers for grouping / relative time
  function startOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  const todayStart = startOfDay(new Date());

  function ymd(d: Date) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  const rtf = useMemo(() => new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" }), []);
  function relTime(target: Date) {
    const now = new Date();
    const diffMs = target.getTime() - now.getTime();
    const abs = Math.abs(diffMs);
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (abs < hour) return rtf.format(Math.round(diffMs / minute), "minute");
    if (abs < day) return rtf.format(Math.round(diffMs / hour), "hour");
    return rtf.format(Math.round(diffMs / day), "day");
  }

  type GroupKey = "overdue" | "today" | "upcoming";
  const grouped = useMemo(() => {
    const g: Record<GroupKey, Reminder[]> = { overdue: [], today: [], upcoming: [] };
    for (const r of items) {
      const due = new Date(r.due_at);
      const dueStart = startOfDay(due);
      if (dueStart < todayStart) g.overdue.push(r);
      else if (ymd(dueStart) === ymd(todayStart)) g.today.push(r);
      else g.upcoming.push(r);
    }
    g.overdue.sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at));
    g.today.sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at));
    g.upcoming.sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at));
    return g;
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  function StatusBadge({ status }: { status: Reminder["status"] }) {
    const style: React.CSSProperties =
      status === "done"
        ? { background: "#DCFCE7", color: "#166534", border: "1px solid #86EFAC" }
        : { background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" };
    return (
      <span style={{ ...style, fontSize: 12, padding: "2px 8px", borderRadius: 999 }}>
        {status}
      </span>
    );
  }

  function Section({ title, items }: { title: string; items: Reminder[] }) {
    if (!items.length) return null;
    return (
      <div>
        <h4 style={{ margin: "16px 0 8px" }}>{title}</h4>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {items.map((r) => {
            const due = new Date(r.due_at);
            const dim = r.status === "done" ? 0.6 : 1;
            const isOverdue = startOfDay(due) < todayStart && r.status !== "done";
            return (
              <li
                key={r.id}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 8,
                  padding: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  opacity: dim,
                  background: isOverdue ? "#FEF2F2" : "white",
                }}
              >
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <b>{r.title}</b>
                    <StatusBadge status={r.status} />
                  </div>
                  <div style={{ opacity: 0.75, fontSize: 12 }}>
                    Due {relTime(due)} · {due.toLocaleString()}
                    {r.source ? ` · ${r.source}` : ""}
                  </div>
                  {r.notes && <div style={{ opacity: 0.85, fontSize: 12, marginTop: 4 }}>{r.notes}</div>}
                </div>
                {!readOnly && (
                  <div style={{ display: "flex", gap: 8 }}>
                    {r.status !== "done" && (
                      <button onClick={() => markDone(r.id)} style={{ padding: "6px 10px", borderRadius: 6 }}>
                        Mark done
                      </button>
                    )}
                    <button onClick={() => remove(r.id)} style={{ padding: "6px 10px", borderRadius: 6 }}>
                      Delete
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>{mode === "self" ? "My Reminders" : "Nursery Reminders"}</h3>

      {!readOnly && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New reminder title"
            style={{ flex: 1, padding: 8, border: "1px solid #e5e7eb", borderRadius: 8 }}
          />
          <button
            onClick={createReminder}
            style={{ padding: "8px 12px", borderRadius: 8, background: "black", color: "white" }}
          >
            Add
          </button>
        </div>
      )}

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && !error && items.length === 0 && <p style={{ opacity: 0.7 }}>No reminders.</p>}

      <Section title="Overdue" items={grouped.overdue} />
      <Section title="Today" items={grouped.today} />
      <Section title="Upcoming" items={grouped.upcoming} />
    </section>
  );
}
