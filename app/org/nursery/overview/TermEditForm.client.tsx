"use client";

import * as React from "react";
import type { Term } from "./page";

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
function fromLocalInput(local: string) {
  if (!local) return "";
  const d = new Date(local);
  // normalise to ISO (UTC-like) so backend stores consistently
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
}

function canEdit(term: Term | null) {
  if (!term) return false;
  if (!term.end_date) return true; // future
  const now = new Date();
  return now <= new Date(term.end_date); // editable until term has passed
}

export default function TermEditFormClient({ term }: { term: Term }) {
  const [editing, setEditing] = React.useState(false);

  const [provider, setProvider] = React.useState(
    term.provider_deadline ? toLocalInput(term.provider_deadline) : ""
  );
  const [open, setOpen] = React.useState(
    term.la_portal_open ? toLocalInput(term.la_portal_open) : ""
  );
  const [close, setClose] = React.useState(
    term.la_portal_close ? toLocalInput(term.la_portal_close) : ""
  );

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const allowEdit = canEdit(term);

  const save = async (payload: any) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/nursery-term-settings", {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? "Failed to save.");
      } else {
        window.location.href = "/org/nursery/overview";
      }
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  const onSave = () => {
    const laTermId = (term as any).la_term_date_id ?? term.id;
    const body = {
      nursery_id: term.nursery_id,
      la_term_date_id: laTermId,
      provider_deadline_at: provider ? fromLocalInput(provider) : null,
      portal_opens_at: open ? fromLocalInput(open) : null,
      portal_closes_at: close ? fromLocalInput(close) : null,
    };
    save(body);
  };

  if (!allowEdit) {
    // Past term: read-only display
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,minmax(0,1fr))",
          gap: 8,
        }}
      >
        <Field
          label="Provider deadline"
          value={term.provider_deadline}
        />
        <Field label="LA opens" value={term.la_portal_open} />
        <Field label="LA closes" value={term.la_portal_close} />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {!editing ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,minmax(0,1fr))",
              gap: 8,
            }}
          >
            <Field
              label="Provider deadline"
              value={term.provider_deadline}
            />
            <Field label="LA opens" value={term.la_portal_open} />
            <Field label="LA closes" value={term.la_portal_close} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={() => setEditing(true)}
              className="hover:opacity-80"
              style={{
                padding: "6px 10px",
                border: "1px solid #E5E7EB",
                borderRadius: 999,
                background: "#FBFAF8",
                fontWeight: 700,
              }}
            >
              Edit deadlines
            </button>
          </div>
          {error && (
            <div style={{ color: "#8A1F1F", fontSize: 12 }}>{error}</div>
          )}
        </>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,minmax(0,1fr))",
              gap: 8,
            }}
          >
            <LabeledDateTime
              label="Provider deadline"
              value={provider}
              onChange={setProvider}
            />
            <LabeledDateTime
              label="LA opens"
              value={open}
              onChange={setOpen}
            />
            <LabeledDateTime
              label="LA closes"
              value={close}
              onChange={setClose}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={onSave}
              disabled={saving}
              className="hover:opacity-90"
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: "#111827",
                color: "white",
                fontWeight: 800,
              }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setProvider(
                  term.provider_deadline
                    ? toLocalInput(term.provider_deadline)
                    : ""
                );
                setOpen(
                  term.la_portal_open
                    ? toLocalInput(term.la_portal_open)
                    : ""
                );
                setClose(
                  term.la_portal_close
                    ? toLocalInput(term.la_portal_close)
                    : ""
                );
                setError(null);
              }}
              className="hover:opacity-80"
              style={{
                padding: "6px 10px",
                border: "1px solid #E5E7EB",
                borderRadius: 999,
                background: "#FBFAF8",
                fontWeight: 700,
              }}
            >
              Cancel
            </button>
          </div>
          {error && (
            <div style={{ color: "#8A1F1F", fontSize: 12 }}>{error}</div>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ opacity: 0.7 }}>{label}</div>
      <div>
        <b>{value ? new Date(value).toLocaleString("en-GB") : "—"}</b>
      </div>
    </div>
  );
}

function LabeledDateTime({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
      <span style={{ opacity: 0.8 }}>{label}</span>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid #DADADA",
          background: "#fff",
        }}
      />
    </label>
  );
}
