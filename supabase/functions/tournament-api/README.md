# tournament-api

This Edge Function is the trusted boundary for PicklePal Lite. It verifies admin/player PINs, creates short-lived signed role sessions, writes public state with the service role, accepts team-scoped score reports, and records audit events.

Required secrets:

- `PICKLEPAL_SERVICE_ROLE_KEY`
- `PICKLEPAL_SESSION_SECRET`

Deploy with:

```powershell
npx supabase functions deploy tournament-api --no-verify-jwt
```

The function deliberately does not expose private PIN hashes in `public_state`.
