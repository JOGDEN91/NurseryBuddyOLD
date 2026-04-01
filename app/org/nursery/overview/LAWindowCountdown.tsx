"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  targetIso?: string | null;
  label?: string; // "Opens in" | "Closes in" | "Next window opens in"
  /** How often to update (ms). Set to 1000 for live seconds; 30000 for lighter updates. */
  tickMs?: number;
};

function diffParts(to: Date) {
  const now = new Date();
  const ms = Math.max(0, +to - +now);
  const minutes = Math.floor(ms / (1000 * 60));
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes - days * 24 * 60) / 60);
  const mins = minutes % 60;
  return { days, hours, mins, done: ms <= 0 };
}

export default function LAWindowCountdown({
  targetIso,
  label = "Opens in",
  tickMs = 1000, // <-- live by default; change to 30000 if you prefer lighter updates
}: Props) {
  const target = useMemo(() => (targetIso ? new Date(targetIso) : null), [targetIso]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setTick((n) => n + 1), Math.max(250, tickMs));
    return () => clearInterval(id);
  }, [target, tickMs]);

  if (!target) return null;

  const { days, hours, mins, done } = diffParts(target);
  // If already passed, let the server decide the next target; client just hides in that case.
  if (done) return null;

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        alignContent: "start",
        height: "100%",
      }}
    >
      <div style={{ fontWeight: 800, color: "#24364B" }}>{label}</div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0,1fr))",
          gap: 10,
        }}
        // force re-render on tick without changing layout
        data-tick={tick}
      >
        {[
          { v: days, k: "Days" },
          { v: hours, k: "Hours" },
          { v: mins, k: "Minutes" },
        ].map(({ v, k }) => (
          <div
            key={k}
            style={{
              border: "1px solid #EAE7E2",
              borderRadius: 14,
              padding: "10px 12px",
              textAlign: "center",
              background: "#FBFAF8",
              boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, color: "#24364B" }}>
              {String(v).padStart(2, "0")}
            </div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                color: "#6C7A89",
              }}
            >
              {k}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, color: "#6C7A89" }}>
        Target: {target.toLocaleString("en-GB")}
      </div>
    </div>
  );
}
