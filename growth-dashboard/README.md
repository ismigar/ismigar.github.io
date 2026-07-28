# Gnosi Growth Dashboard

Private growth intelligence for the Gnosi project. The dashboard separates the
acquisition funnel from community and sponsorship outcomes, stores historical
snapshots in D1, and runs entirely on Cloudflare's free tier.

Current Worker URL:
`https://gnosi-growth-dashboard.gnosi-ismigar-growth.workers.dev`

The private static shell is published by GitHub Pages under `/dashboard/`.
It is intentionally absent from the landing navigation and marked `noindex`.
The Worker still owns OAuth and all data APIs.

## Local development

1. Install dependencies with `npm install`.
2. Copy `.dev.vars.example` to `.dev.vars` and fill only the credentials needed
   for live synchronization.
3. Apply the local D1 migration with `npm run db:migrate:local`.
4. Run the static dashboard with `npm run dev`. When the Worker API is absent,
   development mode shows clearly labelled sample data.
5. Run the complete Worker locally with
   `npx wrangler dev --local --persist-to .wrangler/state`.
6. Generate the GitHub Pages shell with `npm run build:github-pages`.

## Cloudflare setup

1. Create a free D1 database named `gnosi-growth` and replace the placeholder
   `database_id` in `wrangler.jsonc`.
2. Store `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`, `GA4_CLIENT_EMAIL`,
   `GA4_PRIVATE_KEY`, `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`,
   and a random `SESSION_SECRET` with `wrangler secret put`. Never commit them.
3. Replace the non-secret `GA4_PROPERTY_ID` placeholder.
4. Grant the GA4 service account Viewer access to the existing property.
5. Configure a GitHub Sponsors webhook at
   `/api/webhooks/github/sponsors` with the same webhook secret.
6. Create a GitHub OAuth App with callback URL
   `https://gnosi-growth-dashboard.gnosi-ismigar-growth.workers.dev/auth/callback`.
   The Worker requests only public profile access and allows only the GitHub
   login configured in `GITHUB_ALLOWED_LOGIN`.
7. Keep the dashboard and `/api/*` behind the signed session. Only
   `/auth/*`, `/go/alternativeto/*`, and the signature-verified Sponsors
   webhook are public.
8. The GitHub Pages shell starts OAuth on the Worker and receives an
   eight-hour signed session in the URL fragment. The fragment is removed
   immediately and retained only in browser session storage.
9. CORS accepts the configured `DASHBOARD_PUBLIC_URL` origin only.

The AlternativeTo listing should link to one of:

- `https://gnosi-growth-dashboard.gnosi-ismigar-growth.workers.dev/go/alternativeto/github`
- `https://gnosi-growth-dashboard.gnosi-ismigar-growth.workers.dev/go/alternativeto/releases`
- `https://gnosi-growth-dashboard.gnosi-ismigar-growth.workers.dev/go/alternativeto/sponsors`

## Data interpretation

- Redirect events measure intent.
- Release asset counter deltas measure confirmed downloads.
- GitHub traffic is snapshotted because the upstream window is fourteen days.
- The first observed release counter is a baseline, not a new download.
- No IP address or full user agent is stored.
