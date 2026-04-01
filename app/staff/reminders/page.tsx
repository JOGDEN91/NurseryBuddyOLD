import StaffCard from "@/components/StaffCard";
import ReminderList from "@/components/ReminderList";

export const dynamic = "force-dynamic";

export default function RemindersPage() {
  return (
    <StaffCard title="Nursery reminders">
      <ReminderList mode="nursery" />
    </StaffCard>
  );
}