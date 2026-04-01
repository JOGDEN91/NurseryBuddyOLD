# Phase 3 — Clean Reset with Isolated Tables (no more conflicts)

To avoid clashes with any existing `profiles/reminders/files/children` objects in your DB, this phase:
- Creates brand-new tables: **app_profiles**, **app_reminders**, **app_files**
- Adds safe RLS on those tables only
- Auto-creates an app_profiles row for new users
- Updates the app pages to use **app_profiles**

## 1) Apply this SQL in Supabase (no drops, no conflicts)
Open the SQL editor and run the contents of `supabase/migrations/phase3_clean_isolated.sql`

## 2) Add the updated pages
Copy the `app/...` files from this zip into your project.
- `/supabase/me` now reads from app_profiles
- `/account/profile` updates app_profiles

## 3) Restart dev
npm run dev

## 4) Make yourself staff (dev only)
Copy your user id from `/supabase/me`, then run:
```sql
update public.app_profiles
set role = 'staff', nursery_id = coalesce(nursery_id, gen_random_uuid())
where id = '<YOUR_AUTH_USER_ID>';
```

## Notes
- We avoided enums to keep migrations smooth: `role text check in ('parent','staff') default 'parent'`.
- Later (Phase 6/7) we'll point reminders/files features to **app_reminders**/**app_files**.
