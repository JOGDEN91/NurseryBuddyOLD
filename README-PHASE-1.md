# Phase 1 — Supabase wiring (no auth yet)

This add-on wires Supabase into your Phase 0 Next.js app (App Router).
It adds server/browser clients and a simple health page to confirm the env & client load.

## 1) Install deps
In your project root:
```bash
npm install @supabase/supabase-js @supabase/ssr
```

## 2) Create/collect env values
In the Supabase Dashboard (or an existing project), grab:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Copy `.env.local.example` to `.env.local` and fill in the two values.

## 3) Add files
Copy the contents of this zip into your project root so it creates:
- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `app/supabase/health/page.tsx`
- `.env.local.example`

## 4) Run dev
```bash
npm run dev
```
Visit: `http://localhost:3000/supabase/health`

You should see:
- URL detected ✅
- anon key loaded ✅
- server client created ✅
- auth.getUser() returned null ✅ (expected until we add auth)

If you see an error, check the env and restart `npm run dev`.
