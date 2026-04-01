"use client";

type OrgContextStripProps = {
  orgName: string;
  nurseryName?: string | null;
  termLabel?: string | null;
};

/**
 * Simple context line shown at the top of org pages.
 * Example:  Tiggers – Tetbury   Autumn 2025/26
 */
export function OrgContextStrip({
  orgName,
  nurseryName,
  termLabel,
}: OrgContextStripProps) {
  const org = orgName || "—";
  const nursery = nurseryName || "";

  return (
    <div
      style={{
        fontSize: 13,
        color: "#4B5563",
        marginBottom: 6,
        display: "flex",
        alignItems: "baseline",
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      <span style={{ fontWeight: 700 }}>
        {org}
        {nursery ? ` – ${nursery}` : ""}
      </span>
      {termLabel && (
        <span style={{ fontSize: 12, color: "#6B7280" }}>{termLabel}</span>
      )}
    </div>
  );
}