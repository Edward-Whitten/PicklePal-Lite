# PicklePal Lite Supabase migration

The browser pages now use `supabase-bridge.js`, which preserves the existing tournament state shape while moving reads, realtime updates, authentication, and writes to Supabase.

## 1. Create a Supabase Free project

Create one project at https://supabase.com/dashboard. The Free plan is sufficient for occasional tournaments.

Copy the project URL and publishable/anon key into `supabase-config.js`:

```js
window.PICKLEPAL_SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
window.PICKLEPAL_SUPABASE_ANON_KEY = 'YOUR_SUPABASE_PUBLISHABLE_KEY';
```

Never put `SUPABASE_SERVICE_ROLE_KEY` in a browser file.

## 2. Apply the schema

From a machine with the Supabase CLI authenticated:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

The migration creates tournaments, private tournament-team access, score reports, audit events, RLS policies, and enables Realtime for tournament rows. Round Robin events receive an automatically generated nickname when created; players open them using that nickname and do not use player PINs.

## 3. Configure Edge Function secrets

Set the server-only secrets:

```powershell
npx supabase secrets set PICKLEPAL_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY PICKLEPAL_SESSION_SECRET=YOUR_LONG_RANDOM_SECRET
```

Deploy the API:

```powershell
npx supabase functions deploy tournament-api --no-verify-jwt
```

## 4. Verify the client

Open `index.html` through the local HTTP server. Create a test tournament, open the player portal in a second browser context, enter the same one-word code, and confirm that a state change appears in realtime.

LocalStorage remains only as a recovery snapshot. Cloud state is the source of truth after the Edge Function is deployed.

## New application setup

This is a new application with no prior tournament data, so no legacy data migration is required. Supabase is the clean source of truth from the first tournament onward. Team PIN hashes belong in `team_access`, and the public state must not contain PINs.
