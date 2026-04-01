// app/403/page.tsx
export default function NotAuthorized() {
  return (
    <div className="min-h-screen grid place-items-center p-10">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold">403 — Not authorized</h1>
        <p>You’re signed in but don’t have permission to view this page.</p>
        <div className="space-x-4">
          <a className="underline" href="/auth/sign-out">Switch account</a>
          <a className="underline" href="/">Go home</a>
        </div>
      </div>
    </div>
  );
}
