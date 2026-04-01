# Phase 2 — Auth (email magic link) + route protection

This adds:
- `/auth/sign-in` — send magic link
- `/auth/callback` — exchanges the code for a session
- `/account` — shows current user and a Sign out button
- `middleware.ts` — protects `/parent/*` and `/staff/*`

## 1) Prereqs
- Phase 1 completed with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set.
- In Supabase Auth settings → Providers → Email: enable Magic Links.

## 2) Add files
Copy these files into your project root.

## 3) Run
```bash
npm run dev
```
Visit `/auth/sign-in`, enter your email. The magic link will redirect to `/auth/callback` which sets the session, then to `/account`.

## Notes
- Locally, the redirect target is derived from `window.location.origin`, so no extra env is required.
- The middleware redirects unauthenticated users hitting `/parent/*` or `/staff/*` to `/auth/sign-in`.
