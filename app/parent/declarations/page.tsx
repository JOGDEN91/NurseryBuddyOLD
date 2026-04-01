// app/parent/declarations/page.tsx
export const dynamic = "force-dynamic";

import ParentDeclarationsClient from "./ParentDeclarationsClient";

export default function ParentDeclarationsPage() {
  return <ParentDeclarationsClient />;
}