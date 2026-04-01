// app/auth/sign-in/page.tsx
import { redirect } from "next/navigation";

export default function LegacySignInRedirect() {
  redirect("/auth/choose");
}
