import StaffCard from "@/components/StaffCard";
import StaffDocRequests from "@/components/StaffDocRequests";

export const dynamic = "force-dynamic";

export default function RequestsPage() {
  return (
    <StaffCard title="Document requests">
      <StaffDocRequests />
    </StaffCard>
  );
}