"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import StaffCard from "@/components/StaffCard";

type Nursery = { id: string; name: string };

type Person = {
  user_id: string;
  email: string;
  name: string;
  first_name: string;
  surname: string;
  status: "Invited" | "Active" | "Disabled";
  lastActive: string;
  grants: Array<{ id: string; user_id: string; role: string; nursery_id: string | null; created_at: string }>;
};

type ActivityRow = {
  created_at: string;
  action: string;
  actor_display_name: string | null;
  actor_email: string | null;
  entity_type: string;
  entity_id: string | null;
  details: any;
};

function stop(e: any) {
  e.preventDefault();
  e.stopPropagation();
}

function roleLabel(r: string) {
  return String(r || "").toUpperCase();
}

function TextInput(props: any) {
  return (
    <input
      {...props}
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid #DADADA",
        background: "#fff",
        ...(props.style ?? {}),
      }}
    />
  );
}

function Select(props: any) {
  return (
    <select
      {...props}
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid #DADADA",
        background: "#fff",
        ...(props.style ?? {}),
      }}
    />
  );
}

function GreenButton({ children, onClick, type = "button", disabled = false }: any) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid #4CAF78",
        background: disabled ? "#9AD3B0" : "#4CAF78",
        color: "#fff",
        fontWeight: 900,
        whiteSpace: "nowrap",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

/** Minimal modal */
function Modal({
  open,
  title,
  onClose,
  children,
  width = 980,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: any;
  width?: number;
}) {
  if (!open) return null;
  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: 12,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: width,
          background: "#fff",
          borderRadius: 14,
          border: "1px solid #E6E4E0",
          boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid #EEE",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 900 }}>{title}</div>
          <button
            onClick={onClose}
            style={{ border: "1px solid #DADADA", background: "#fff", borderRadius: 10, padding: "6px 10px" }}
          >
            Close
          </button>
        </div>
        <div style={{ padding: 14 }}>{children}</div>
      </div>
    </div>
  );
}

function Tabs({
  value,
  onChange,
  tabs,
}: {
  value: string;
  onChange: (v: string) => void;
  tabs: Array<{ key: string; label: string }>;
}) {
  return (
    <div style={{ display: "flex", gap: 8, borderBottom: "1px solid #EEE", paddingBottom: 10, marginBottom: 10 }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            border: "1px solid #DADADA",
            background: value === t.key ? "#111827" : "#fff",
            color: value === t.key ? "#fff" : "#111827",
            borderRadius: 999,
            padding: "6px 10px",
            fontWeight: 800,
            fontSize: 12,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function nurserySummary(grants: Person["grants"], nurseryMap: Record<string, string>) {
  if (!grants || grants.length === 0) return "—";
  // If any org-wide grant exists (nursery_id null) treat as all nurseries.
  if (grants.some((g) => !g.nursery_id)) return "All nurseries";
  const ids = Array.from(new Set(grants.map((g) => g.nursery_id).filter(Boolean) as string[]));
  if (ids.length === 0) return "—";
  return ids.map((id) => nurseryMap[id] ?? id).join(", ");
}

function AccessSummary({
  grants,
  nurseryMap,
}: {
  grants: Person["grants"];
  nurseryMap: Record<string, string>;
}) {
  const s = grants
    .map((g) => `${g.role}${g.nursery_id ? ` @ ${nurseryMap[g.nursery_id] ?? g.nursery_id}` : ""}`)
    .join(", ");
  return <span style={{ opacity: 0.9 }}>{s || "—"}</span>;
}

/** Nursery picker: supports All vs multiple nurseries */
function MultiNurseryPicker({
  role,
  nurseries,
  valueAll,
  onChangeAll,
  selectedIds,
  onAdd,
  onRemove,
}: {
  role: string;
  nurseries: Nursery[];
  valueAll: boolean;
  onChangeAll: (v: boolean) => void;
  selectedIds: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const isOrgAdmin = roleLabel(role) === "ORG_ADMIN";
  const canMulti = roleLabel(role) === "NURSERY_MANAGER";

  if (isOrgAdmin) {
    return (
      <div style={{ display: "grid", gap: 6 }}>
        <label style={{ fontSize: 12, opacity: 0.7 }}>Nursery scope</label>
        <Select disabled value="__all__">
          <option value="__all__">All nurseries</option>
        </Select>
        <div style={{ fontSize: 11, color: "#6B7280" }}>ORG_ADMIN access is always org-wide.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <label style={{ fontSize: 12, opacity: 0.7 }}>Nursery scope</label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={valueAll} onChange={(e) => onChangeAll(e.target.checked)} />
          All nurseries
        </label>
      </div>

      {!valueAll && (
        <div style={{ display: "grid", gap: 8 }}>
          {!canMulti && (
            <div style={{ fontSize: 11, color: "#6B7280" }}>
              Multi-nursery assignment is enabled for NURSERY_MANAGER.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Select
              defaultValue=""
              onChange={(e: any) => {
                const id = String(e.target.value || "");
                if (id) {
                  onAdd(id);
                  e.target.value = "";
                }
              }}
              style={{ minWidth: 260 }}
            >
              <option value="">Select a nursery…</option>
              {nurseries.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </Select>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Select a nursery to add. Duplicate selections are ignored.
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {selectedIds.map((id) => (
                <div
                  key={id}
                  style={{
                    border: "1px solid #EEE",
                    background: "#fff",
                    borderRadius: 999,
                    padding: "6px 10px",
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 800 }}>{nurseries.find((n) => n.id === id)?.name ?? id}</span>
                  <button
                    onClick={() => onRemove(id)}
                    style={{
                      border: "1px solid #DADADA",
                      background: "#fff",
                      borderRadius: 999,
                      padding: "2px 6px",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedIds.length === 0 && (
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              No nurseries selected. Add at least one nursery, or choose “All nurseries”.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function StaffClient({
  orgId,
  nurseries,
  nurseryMap,
  people,
  allRoles,
}: {
  orgId: string;
  nurseries: Nursery[];
  nurseryMap: Record<string, string>;
  people: Person[];
  allRoles: string[];
}) {
  const router = useRouter();

  // Filters
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [nurseryFilter, setNurseryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Invite modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirst, setInviteFirst] = useState("");
  const [inviteSurname, setInviteSurname] = useState("");
  const [inviteRole, setInviteRole] = useState("NURSERY_MANAGER");
  const [inviteAllNurseries, setInviteAllNurseries] = useState(true);
  const [inviteNurseryIds, setInviteNurseryIds] = useState<string[]>([]);
  const [inviteBusy, setInviteBusy] = useState(false);

  // Person modal state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<"data" | "activity">("data");
  const [activityBusy, setActivityBusy] = useState(false);
  const [activity, setActivity] = useState<{ last_sign_in_at: string | null; created_at: string | null; events: ActivityRow[] } | null>(null);

  const selectedPerson = useMemo(() => people.find((p) => p.user_id === selectedUserId) ?? null, [people, selectedUserId]);

  const summary = useMemo(() => {
    const distinctPeople = people.length;
    const totalGrants = people.reduce((acc, p) => acc + p.grants.length, 0);
    const invitedCount = people.filter((p) => p.status === "Invited").length;
    const activeCount = people.filter((p) => p.status === "Active").length;
    return { distinctPeople, totalGrants, invitedCount, activeCount };
  }, [people]);

  const filteredPeople = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return people.filter((p) => {
      const matchesQ =
        !qq ||
        (p.email ?? "").toLowerCase().includes(qq) ||
        (p.user_id ?? "").toLowerCase().includes(qq) ||
        (p.name ?? "").toLowerCase().includes(qq);

      const matchesRole = !roleFilter || p.grants.some((g) => g.role === roleFilter);
      const matchesNursery = !nurseryFilter || p.grants.some((g) => String(g.nursery_id ?? "") === nurseryFilter);
      const matchesStatus = !statusFilter || p.status === statusFilter;

      return matchesQ && matchesRole && matchesNursery && matchesStatus;
    });
  }, [people, q, roleFilter, nurseryFilter, statusFilter]);

  // Enforce scope rule when inviteRole changes
  useEffect(() => {
    if (roleLabel(inviteRole) === "ORG_ADMIN") {
      setInviteAllNurseries(true);
      setInviteNurseryIds([]);
    }
  }, [inviteRole]);

  async function doInvite() {
    const role = roleLabel(inviteRole);
    if (!inviteEmail.trim()) return;

    const all = role === "ORG_ADMIN" ? true : inviteAllNurseries;
    const nursery_ids = all ? [] : Array.from(new Set(inviteNurseryIds));

    setInviteBusy(true);
    try {
      const res = await fetch("/api/org/staff/invite", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          first_name: inviteFirst.trim() || undefined,
          surname: inviteSurname.trim() || undefined,
          role,
          nursery_ids,
          nursery_id: nursery_ids.length === 1 ? nursery_ids[0] : undefined,
        }),
        credentials: "include",
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        alert(j?.error ?? "Invite failed");
        return;
      }

      setInviteOpen(false);
      setInviteEmail("");
      setInviteFirst("");
      setInviteSurname("");
      setInviteRole("NURSERY_MANAGER");
      setInviteAllNurseries(true);
      setInviteNurseryIds([]);
      router.refresh();
    } finally {
      setInviteBusy(false);
    }
  }

  async function fetchActivity(userId: string) {
    setActivityBusy(true);
    try {
      const res = await fetch(`/api/org/staff/activity?user_id=${encodeURIComponent(userId)}`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        setActivity(null);
        return;
      }
      setActivity(j);
    } finally {
      setActivityBusy(false);
    }
  }

  useEffect(() => {
    if (selectedUserId && tab === "activity") fetchActivity(selectedUserId);
  }, [selectedUserId, tab]);

  async function updateName(userId: string, first_name: string, surname: string) {
    const res = await fetch("/api/org/staff/user/update-name", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ user_id: userId, first_name, surname }),
      credentials: "include",
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j?.ok === false) alert(j?.error ?? "Update failed");
    else router.refresh();
  }

  async function updateEmail(userId: string, email: string) {
    const res = await fetch("/api/org/staff/user/update-email", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ user_id: userId, email }),
      credentials: "include",
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j?.ok === false) alert(j?.error ?? "Email update failed");
    else {
      if (selectedUserId && tab === "activity") fetchActivity(selectedUserId);
      router.refresh();
    }
  }

  async function sendReset(userId: string) {
    const res = await fetch("/api/org/staff/send-password-reset", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ user_id: userId }),
      credentials: "include",
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j?.ok === false) alert(j?.error ?? "Reset failed");
    else {
      if (selectedUserId && tab === "activity") fetchActivity(selectedUserId);
      router.refresh();
    }
  }

  async function revokeGrant(grantId: string) {
    const res = await fetch("/api/org/staff/grant/revoke", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ grant_id: grantId }),
      credentials: "include",
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j?.ok === false) alert(j?.error ?? "Revoke failed");
    else {
      if (selectedUserId && tab === "activity") fetchActivity(selectedUserId);
      router.refresh();
    }
  }

  async function updateGrant(grantId: string, role: string, nursery_id: string | null) {
    const res = await fetch("/api/org/staff/grant/update", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ grant_id: grantId, role, nursery_id: nursery_id ?? "" }),
      credentials: "include",
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j?.ok === false) alert(j?.error ?? "Update failed");
    else {
      if (selectedUserId && tab === "activity") fetchActivity(selectedUserId);
      router.refresh();
    }
  }

  // Add grant (multi-nursery)
  const [addRole, setAddRole] = useState("NURSERY_MANAGER");
  const [addAll, setAddAll] = useState(true);
  const [addNurseryIds, setAddNurseryIds] = useState<string[]>([]);
  const [addBusy, setAddBusy] = useState(false);

  useEffect(() => {
    if (roleLabel(addRole) === "ORG_ADMIN") {
      setAddAll(true);
      setAddNurseryIds([]);
    }
  }, [addRole]);

  async function addGrant(userId: string) {
    const role = roleLabel(addRole);
    const all = role === "ORG_ADMIN" ? true : addAll;
    const nursery_ids = all ? [] : Array.from(new Set(addNurseryIds));
    if (!all && nursery_ids.length === 0) {
      alert("Select at least one nursery or choose All nurseries.");
      return;
    }

    setAddBusy(true);
    try {
      const res = await fetch("/api/org/staff/grant/add", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ user_id: userId, role, nursery_ids }),
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) alert(j?.error ?? "Add grant failed");
      else {
        setAddRole("NURSERY_MANAGER");
        setAddAll(true);
        setAddNurseryIds([]);
        if (selectedUserId && tab === "activity") fetchActivity(selectedUserId);
        router.refresh();
      }
    } finally {
      setAddBusy(false);
    }
  }

  // Email edit state in modal
  const [emailDraft, setEmailDraft] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  useEffect(() => {
    if (selectedPerson) setEmailDraft(selectedPerson.email || "");
  }, [selectedPerson?.user_id]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <StaffCard title="Staff & Access">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #EEE" }}>
            People: <b>{summary.distinctPeople}</b>
          </div>
          <div style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #EEE" }}>
            Grants: <b>{summary.totalGrants}</b>
          </div>
          <div style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #EEE" }}>
            Active: <b>{summary.activeCount}</b>
          </div>
          <div style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #EEE" }}>
            Invited: <b>{summary.invitedCount}</b>
          </div>
        </div>
      </StaffCard>

      <StaffCard title="People & access">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <TextInput value={q} onChange={(e: any) => setQ(e.target.value)} placeholder="Search name, email or user id…" style={{ minWidth: 260 }} />

          <Select value={roleFilter} onChange={(e: any) => setRoleFilter(e.target.value)}>
            <option value="">All roles</option>
            {allRoles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>

          <Select value={nurseryFilter} onChange={(e: any) => setNurseryFilter(e.target.value)}>
            <option value="">All nurseries</option>
            {nurseries.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </Select>

          <Select value={statusFilter} onChange={(e: any) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="Invited">Invited</option>
            <option value="Active">Active</option>
            <option value="Disabled">Disabled</option>
          </Select>

          <button
            onClick={() => {}}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #DADADA", background: "#fff" }}
          >
            Apply
          </button>

          <GreenButton onClick={() => setInviteOpen(true)}>Invite User</GreenButton>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Person</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Status</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Nursery</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Access</th>
                <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #EEE" }}>Quick actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPeople.map((p) => {
                const primary = p.name || p.email;

                return (
                  <tr
                    key={p.user_id}
                    onClick={() => {
                      setSelectedUserId(p.user_id);
                      setTab("data");
                      setActivity(null);
                    }}
                    style={{ borderTop: "1px solid #F2F1EE", verticalAlign: "top", cursor: "pointer" }}
                    title="Click to view/edit"
                  >
                    <td style={{ padding: 10 }}>
                      <div style={{ fontWeight: 900 }}>{primary}</div>
                      <div style={{ fontSize: 12, opacity: 0.85 }}>{p.email}</div>
                      <div style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.7 }}>{p.user_id}</div>
                    </td>

                    <td style={{ padding: 10 }}>
                      <div style={{ fontWeight: 900 }}>{p.status}</div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>Last active: {p.lastActive}</div>
                    </td>

                    <td style={{ padding: 10 }}>
                      <div style={{ fontSize: 13, opacity: 0.9 }}>{nurserySummary(p.grants, nurseryMap)}</div>
                    </td>

                    <td style={{ padding: 10 }}>
                      <AccessSummary grants={p.grants} nurseryMap={nurseryMap} />
                    </td>

                    <td style={{ padding: 10 }}>
                      <button
                        onClick={(e: any) => {
                          stop(e);
                          sendReset(p.user_id);
                        }}
                        style={{ border: "1px solid #DADADA", padding: "6px 10px", borderRadius: 8, background: "#fff" }}
                      >
                        Send password reset
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredPeople.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 10, opacity: 0.7 }}>
                    No staff match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </StaffCard>

      {/* Invite modal */}
      <Modal open={inviteOpen} title="Invite user" onClose={() => setInviteOpen(false)} width={740}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>Work email</label>
            <TextInput value={inviteEmail} onChange={(e: any) => setInviteEmail(e.target.value)} placeholder="email@domain.com" />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: 6, flex: "1 1 240px" }}>
              <label style={{ fontSize: 12, opacity: 0.7 }}>First name (optional)</label>
              <TextInput value={inviteFirst} onChange={(e: any) => setInviteFirst(e.target.value)} placeholder="First name" />
            </div>
            <div style={{ display: "grid", gap: 6, flex: "1 1 240px" }}>
              <label style={{ fontSize: 12, opacity: 0.7 }}>Surname (optional)</label>
              <TextInput value={inviteSurname} onChange={(e: any) => setInviteSurname(e.target.value)} placeholder="Surname" />
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>Role</label>
            <Select value={inviteRole} onChange={(e: any) => setInviteRole(e.target.value)}>
              {Array.from(new Set(["ORG_ADMIN", "NURSERY_MANAGER", "STAFF", ...allRoles])).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </div>

          <MultiNurseryPicker
            role={inviteRole}
            nurseries={nurseries}
            valueAll={inviteAllNurseries}
            onChangeAll={(v) => {
              setInviteAllNurseries(v);
              if (v) setInviteNurseryIds([]);
            }}
            selectedIds={inviteNurseryIds}
            onAdd={(id) => setInviteNurseryIds((prev) => (prev.includes(id) ? prev : [...prev, id]))}
            onRemove={(id) => setInviteNurseryIds((prev) => prev.filter((x) => x !== id))}
          />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              onClick={() => setInviteOpen(false)}
              style={{ border: "1px solid #DADADA", background: "#fff", borderRadius: 8, padding: "8px 12px" }}
              disabled={inviteBusy}
            >
              Cancel
            </button>
            <GreenButton onClick={doInvite} type="button" disabled={inviteBusy}>
              {inviteBusy ? "Inviting…" : "Invite User"}
            </GreenButton>
          </div>
        </div>
      </Modal>

      {/* Person modal */}
      <Modal
        open={!!selectedPerson}
        title={selectedPerson ? (selectedPerson.name || selectedPerson.email) : "User"}
        onClose={() => setSelectedUserId(null)}
        width={980}
      >
        {!selectedPerson ? null : (
          <>
            <Tabs
              value={tab}
              onChange={(v) => setTab(v as any)}
              tabs={[
                { key: "data", label: "Data" },
                { key: "activity", label: "Activity log" },
              ]}
            />

            {tab === "data" && (
              <div style={{ display: "grid", gap: 14 }}>
                {/* Identity */}
                <div style={{ border: "1px solid #EEE", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
                  <div style={{ fontWeight: 900 }}>Identity</div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>User ID</div>
                    <div style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.9 }}>{selectedPerson.user_id}</div>
                  </div>

                  {/* Email edit */}
                  <div style={{ display: "grid", gap: 6 }}>
                    <label style={{ fontSize: 12, opacity: 0.7 }}>Email</label>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <TextInput
                        value={emailDraft}
                        onChange={(e: any) => setEmailDraft(e.target.value)}
                        placeholder="email@domain.com"
                        style={{ minWidth: 320 }}
                      />
                      <GreenButton
                        disabled={emailBusy || !emailDraft.trim() || emailDraft.trim().toLowerCase() === (selectedPerson.email || "").toLowerCase()}
                        onClick={async () => {
                          const next = emailDraft.trim().toLowerCase();
                          if (!next) return;
                          setEmailBusy(true);
                          try {
                            await updateEmail(selectedPerson.user_id, next);
                          } finally {
                            setEmailBusy(false);
                          }
                        }}
                      >
                        {emailBusy ? "Saving…" : "Save email"}
                      </GreenButton>
                      <div style={{ fontSize: 11, color: "#6B7280" }}>
                        Use this for rebrands or email changes; user records and grants remain unchanged.
                      </div>
                    </div>
                  </div>

                  {/* Name edit */}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "grid", gap: 6, flex: "1 1 220px" }}>
                      <label style={{ fontSize: 12, opacity: 0.7 }}>First name</label>
                      <TextInput
                        defaultValue={selectedPerson.first_name}
                        onBlur={(e: any) => {
                          const first = String(e.target.value || "").trim();
                          updateName(selectedPerson.user_id, first, selectedPerson.surname);
                        }}
                      />
                    </div>
                    <div style={{ display: "grid", gap: 6, flex: "1 1 220px" }}>
                      <label style={{ fontSize: 12, opacity: 0.7 }}>Surname</label>
                      <TextInput
                        defaultValue={selectedPerson.surname}
                        onBlur={(e: any) => {
                          const sur = String(e.target.value || "").trim();
                          updateName(selectedPerson.user_id, selectedPerson.first_name, sur);
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      onClick={() => sendReset(selectedPerson.user_id)}
                      style={{ border: "1px solid #DADADA", background: "#fff", borderRadius: 8, padding: "8px 12px" }}
                    >
                      Send password reset
                    </button>
                  </div>
                </div>

                {/* Grants */}
                <div style={{ border: "1px solid #EEE", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
                  <div style={{ fontWeight: 900 }}>Access grants</div>

                  {selectedPerson.grants.length === 0 ? (
                    <div style={{ opacity: 0.7 }}>No grants found.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {selectedPerson.grants.map((g) => {
                        const isOrgAdmin = roleLabel(g.role) === "ORG_ADMIN";
                        return (
                          <div key={g.id} style={{ border: "1px solid #EEE", borderRadius: 10, padding: 10, background: "#fff" }}>
                            <div style={{ fontSize: 12, opacity: 0.75 }}>
                              Granted: {new Date(g.created_at).toLocaleString("en-GB")}
                            </div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                              <Select
                                defaultValue={g.role}
                                onChange={(e: any) => {
                                  const nextRole = roleLabel(e.target.value);
                                  const nextNursery = nextRole === "ORG_ADMIN" ? null : g.nursery_id;
                                  updateGrant(g.id, nextRole, nextNursery);
                                }}
                              >
                                {Array.from(new Set(["ORG_ADMIN", "NURSERY_MANAGER", "STAFF", ...allRoles])).map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </Select>

                              <Select
                                disabled={isOrgAdmin}
                                defaultValue={g.nursery_id ?? ""}
                                onChange={(e: any) => {
                                  const v = String(e.target.value || "");
                                  updateGrant(g.id, roleLabel(g.role), v ? v : null);
                                }}
                              >
                                <option value="">All nurseries</option>
                                {nurseries.map((n) => (
                                  <option key={n.id} value={n.id}>
                                    {n.name}
                                  </option>
                                ))}
                              </Select>

                              <button
                                onClick={() => revokeGrant(g.id)}
                                style={{
                                  border: "1px solid #E53935",
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  background: "#fff",
                                  color: "#E53935",
                                  fontWeight: 800,
                                }}
                              >
                                Remove grant
                              </button>
                            </div>

                            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                              Scope: {g.nursery_id ? (nurseryMap[g.nursery_id] ?? g.nursery_id) : "All nurseries"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add grant */}
                  <div style={{ borderTop: "1px solid #EEE", paddingTop: 12, display: "grid", gap: 10 }}>
                    <div style={{ fontWeight: 900, fontSize: 13 }}>Add grant</div>

                    <div style={{ display: "grid", gap: 6 }}>
                      <label style={{ fontSize: 12, opacity: 0.7 }}>Role</label>
                      <Select value={addRole} onChange={(e: any) => setAddRole(e.target.value)}>
                        {Array.from(new Set(["ORG_ADMIN", "NURSERY_MANAGER", "STAFF", ...allRoles])).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <MultiNurseryPicker
                      role={addRole}
                      nurseries={nurseries}
                      valueAll={addAll}
                      onChangeAll={(v) => {
                        setAddAll(v);
                        if (v) setAddNurseryIds([]);
                      }}
                      selectedIds={addNurseryIds}
                      onAdd={(id) => setAddNurseryIds((prev) => (prev.includes(id) ? prev : [...prev, id]))}
                      onRemove={(id) => setAddNurseryIds((prev) => prev.filter((x) => x !== id))}
                    />

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <GreenButton onClick={() => addGrant(selectedPerson.user_id)} type="button" disabled={addBusy}>
                        {addBusy ? "Adding…" : "Add grant"}
                      </GreenButton>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === "activity" && (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ border: "1px solid #EEE", borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Logins</div>
                  {activityBusy && !activity ? (
                    <div style={{ opacity: 0.7 }}>Loading…</div>
                  ) : (
                    <div style={{ fontSize: 13, opacity: 0.85 }}>
                      <div>
                        Last sign-in:{" "}
                        <b>{activity?.last_sign_in_at ? new Date(activity.last_sign_in_at).toLocaleString("en-GB") : "Never"}</b>
                      </div>
                      <div>
                        Account created:{" "}
                        <b>{activity?.created_at ? new Date(activity.created_at).toLocaleString("en-GB") : "—"}</b>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, color: "#6B7280" }}>
                        Supabase Auth provides last sign-in timestamp; full login history is not available unless you store auth log events separately.
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ border: "1px solid #EEE", borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Key actions</div>
                  {activityBusy && !activity ? (
                    <div style={{ opacity: 0.7 }}>Loading…</div>
                  ) : !activity || activity.events.length === 0 ? (
                    <div style={{ opacity: 0.7 }}>No audit events found for this user.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {activity.events.map((ev, idx) => (
                        <div key={idx} style={{ border: "1px solid #EEE", borderRadius: 10, padding: 10, background: "#fff" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                            <div style={{ fontWeight: 900 }}>{ev.action}</div>
                            <div style={{ fontSize: 12, opacity: 0.75 }}>{new Date(ev.created_at).toLocaleString("en-GB")}</div>
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                            Actor: <b>{ev.actor_display_name || ev.actor_email || "—"}</b>
                          </div>
                          {ev.details ? (
                            <pre
                              style={{
                                marginTop: 8,
                                fontSize: 12,
                                opacity: 0.85,
                                background: "#FAFAFA",
                                border: "1px solid #EEE",
                                borderRadius: 10,
                                padding: 10,
                                overflowX: "auto",
                              }}
                            >
                              {JSON.stringify(ev.details, null, 2)}
                            </pre>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}