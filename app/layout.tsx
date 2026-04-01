// app/layout.tsx
import "./globals.css";
import AuthListener from "@/components/AuthListener";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthListener />
        {children}
      </body>
    </html>
  );
}
