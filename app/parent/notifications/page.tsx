export default function ParentNotificationsPage(){
  return (
    <div style={{ display:"grid", gap:10 }}>
      <div style={{ fontWeight:800 }}>Notifications</div>
      <div style={{ border:"1px solid #E6E4E0", borderRadius:12, background:"#fff", padding:12 }}>
        Requests, upcoming changes, code expiry reminders, nursery assignment, etc.
      </div>
    </div>
  );
}
