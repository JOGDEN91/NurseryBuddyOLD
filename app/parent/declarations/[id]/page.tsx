// app/parent/declarations/[id]/page.tsx
export const dynamic = "force-dynamic";

import DeclarationClient from "./DeclarationClient";

export default function ParentDeclarationPage({
  params,
}: {
  params: { id: string };
}) {
  return <DeclarationClient declarationId={params.id} />;
}