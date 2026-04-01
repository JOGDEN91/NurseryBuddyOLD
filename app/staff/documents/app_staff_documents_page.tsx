import StaffCard from "@/components/StaffCard";
import FileList from "@/components/FileList";

export const dynamic = "force-dynamic";

export default function DocumentsPage() {
  return (
    <StaffCard title="Nursery documents">
      <FileList allowDelete />
    </StaffCard>
  );
}