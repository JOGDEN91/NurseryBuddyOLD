export default function ParentSettingsPage(){
  return (
    <div style={{ display:"grid", gap:10 }}>
      <div style={{ fontWeight:800 }}>Account & Settings</div>
      <div style={{ border:"1px solid #E6E4E0", borderRadius:12, background:"#fff", padding:12 }}>
        Privacy, password, login details. (We’ll hook Supabase auth UI/flows here.)
      </div>
    </div>
  );
}
