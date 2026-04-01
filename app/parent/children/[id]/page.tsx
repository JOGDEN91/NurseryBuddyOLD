import ChildClient from "./ChildClient";

export const dynamic = "force-dynamic";

export default function ChildPage({ params }: { params: { id: string } }) {
  return <ChildClient childId={params.id} />;
}
