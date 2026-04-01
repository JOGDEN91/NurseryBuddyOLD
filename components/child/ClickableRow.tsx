"use client";

import { useRouter } from "next/navigation";
import React from "react";

/**
 * Wrap table rows to open the Child modal.
 * Usage:
 *   <ClickableRow childId={row.child_id}>
 *     <td>…</td>
 *     …
 *   </ClickableRow>
 */
export default function ClickableRow({
  childId,
  children,
}: {
  childId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      onClick={() => {
        const q = new URLSearchParams(window.location.search);
        q.set("child", childId);
        router.replace(`${window.location.pathname}?${q.toString()}`);
      }}
      style={{ cursor: "pointer" }}
    >
      {children}
    </tr>
  );
}
