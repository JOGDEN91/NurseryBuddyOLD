# Phase 4 — Role-aware dashboards + home redirect

What this adds:
- `lib/profile.ts` helper to get the current user's app_profile (server-side)
- Home (`/`) smart redirect:
    - staff  -> /staff/dashboard
    - parent -> /parent/dashboard
    - not signed in -> /auth/sign-in
    - signed in but missing profile -> /account/profile
- Clean dashboard pages that read your profile and greet you

## Install
Unzip into your project root (it only adds/updates a few files).
No package.json changes.

## Test
- Visit `/` and confirm it redirects based on your role
- Visit `/parent/dashboard` and `/staff/dashboard`
