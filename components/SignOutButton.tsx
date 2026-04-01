"use client";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SignOutButton({ variant = "default" }: { variant?: "default" | "sidebar" }) {
  const router = useRouter();

  const common: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 10,
    cursor: "pointer",
  };

  const styles: Record<string, React.CSSProperties> = {
    default: { ...common, background: "#000", color: "#fff" },
    sidebar: {
      ...common,
      width: "100%",
      background: "transparent",
      color: "#ffffff",
      border: "1px solid rgba(255,255,255,0.2)",
      textAlign: "center",
    },
  };

  return (
    <button
      onClick={async () => {
        await supabaseBrowser().auth.signOut();
        router.push("/auth/choose");
        router.refresh();
      }}
      style={styles[variant]}
    >
      Sign out
    </button>
  );
}