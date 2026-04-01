# Phase 5 — Reminders MVP
Minimal reminders you can create, list, mark done, and delete.
Uses **app_reminders** table we already created.

## 1) Apply the small SQL patch (adds staff read policy)
Run `supabase/migrations/phase5_reminders_policy.sql` in Supabase SQL editor.

## 2) Drop these files into your project root
- app/api/reminders/route.ts          (GET, POST)
- app/api/reminders/[id]/route.ts     (PATCH, DELETE)
- lib/reminders.ts                     (server helpers)
- components/ReminderList.tsx          (client list + actions)
- app/parent/dashboard/page.tsx        (updated to show your reminders)
- app/staff/dashboard/page.tsx         (updated to show nursery reminders)

## 3) Run
npm run dev
- Parent dashboard shows YOUR reminders
- Staff dashboard shows nursery-scoped reminders

## Notes
- RLS prevents cross-nursery access.
- Staff can create reminders for anyone in their nursery.
- Parents create reminders for themselves only (for now).
