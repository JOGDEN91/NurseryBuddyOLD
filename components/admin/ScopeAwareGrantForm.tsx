"use client";

import { useState } from "react";

type IdName = { id: string; name: string };

export default function ScopeAwareGrantForm({
  las,
  orgs,
  nurseries,
  users,
  action,
}: {
  las: IdName[];
  orgs: IdName[];
  nurseries: IdName[];
  users: { id: string; email: string | null }[];
  action: (formData: FormData) => void; // Server Action passed from the page
}) {
  const [scope, setScope] = useState<"PLATFORM" | "LA" | "ORG" | "NURSERY">("PLATFORM");

  return (
    <form action={action} style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <label>Email</label>
        <input
          name="email"
          list="user-emails"
          placeholder="user@example.com"
          className="border rounded p-2"
          required
        />
        <datalist id="user-emails">
          {users.map((u) => (
            <option value={u.email ?? ""} key={u.id}>
              {u.email}
            </option>
          ))}
        </datalist>
      </div>

      <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
        <div>
          <label>Role</label>
          <select name="role" className="border rounded p-2" defaultValue="ORG_ADMIN" required>
            <option value="PARENT">PARENT</option>
            <option value="STAFF">STAFF</option>
            <option value="NURSERY_MANAGER">NURSERY_MANAGER</option>
            <option value="ORG_ADMIN">ORG_ADMIN</option>
            <option value="LA_ADMIN">LA_ADMIN</option>
            <option value="AUDITOR">AUDITOR</option>
            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
          </select>
        </div>

        <div>
          <label>Scope</label>
          <select
            name="scope"
            className="border rounded p-2"
            value={scope}
            onChange={(e) => setScope(e.target.value as any)}
            required
          >
            <option value="PLATFORM">PLATFORM</option>
            <option value="LA">LA</option>
            <option value="ORG">ORG</option>
            <option value="NURSERY">NURSERY</option>
          </select>
        </div>

        <div style={{ fontSize: 12, color: "#666", alignSelf: "end" }}>
          {scope === "PLATFORM" && "Full platform access."}
          {scope === "LA" && "Pick a Local Authority."}
          {scope === "ORG" && "Pick an Organisation."}
          {scope === "NURSERY" && "Pick a Nursery."}
        </div>
      </div>

      {scope === "LA" && (
        <div>
          <label>Local Authority</label>
          <select name="la" className="border rounded p-2" required>
            <option value="">—</option>
            {las.map((l) => (
              <option value={l.id} key={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {scope === "ORG" && (
        <div>
          <label>Organisation</label>
          <select name="org" className="border rounded p-2" required>
            <option value="">—</option>
            {orgs.map((o) => (
              <option value={o.id} key={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {scope === "NURSERY" && (
        <div>
          <label>Nursery</label>
          <select name="nursery" className="border rounded p-2" required>
            <option value="">—</option>
            {nurseries.map((n) => (
              <option value={n.id} key={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <button className="rounded p-2 bg-black text-white w-max" type="submit">
        Add grant
      </button>
    </form>
  );
}
