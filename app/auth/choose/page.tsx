// app/auth/choose/page.tsx
import Image from "next/image";
import Link from "next/link";

export default function AuthChoose() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-6"
      style={{ background: "#24364B", color: "#FFFFFF" }}
    >
      <div className="w-full max-w-md flex flex-col items-center gap-8">
        {/* Logo */}
        <div className="grid place-items-center">
          <Image
            src="/nursery-buddy-logo.png"
            alt="Nursery Buddy"
            width={220}
            height={80}
            priority
            style={{ objectFit: "contain" }}
          />
        </div>

        {/* Title */}
        <h1 className="text-xl font-semibold opacity-90">Sign in</h1>

        {/* Options */}
        <div className="w-full grid gap-3">
          <Link
            href="/auth/parent/sign-in"
            className="block rounded-xl border px-4 py-4 text-center transition hover:opacity-90"
            style={{
              borderColor: "rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.06)",
            }}
          >
            I’m a Parent / Carer
          </Link>

          <Link
            href="/auth/staff/sign-in"
            className="block rounded-xl px-4 py-4 text-center font-semibold transition hover:opacity-95"
            style={{
              background: "#4CAF78", // brand green
              color: "#FFFFFF",
            }}
          >
            Organisation / Staff
          </Link>
        </div>

        {/* Admin link */}
        <div className="text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
          Admin?{" "}
          <Link href="/admin/sign-in" className="underline" style={{ color: "#F08A00" }}>
            Go to admin sign-in
          </Link>
        </div>
      </div>
    </div>
  );
}
