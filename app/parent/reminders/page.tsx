import ReminderList from "@/components/reminders/ReminderList";

const cardStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E6E4E0",
  borderRadius: 10,
  padding: 16,
};

export default function ParentRemindersPage() {
  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>My reminders</div>
      <ReminderList mode="self" readOnly />
    </div>
  );
}