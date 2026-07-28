# Gnosi Growth Dashboard

Private growth intelligence for the Gnosi project. The dashboard separates the
acquisition funnel from community and sponsorship outcomes, stores historical
snapshots in D1, and runs entirely on Cloudflare's free tier.

## Local development

1. Install dependencies with `npm install`.
2. Copy `.dev.vars.example` to `.dev.vars` and fill only the credentials needed
   for live synchronization.
3. Apply the local D1 migration with `npm run db:migrate:local`.
4. Run the static dashboard with `npm run dev`. When the Worker API is absent,
   development mode shows clearly labelled sample data.
5. Run the complete Worker locally with
   `npx wrangler dev --local --persist-to .wrangler/state`.

## Cloudflare setup

1. Create a free D1 database named `gnosi-growth` and replace the placeholder
   `database_id` in `wrangler.jsonc`.
2. Store `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`, `GA4_CLIENT_EMAIL`,
   `GA4_PRIVATE_KEY`, and `ALLOWED_EMAIL` with `wrangler secret put`. Never
   commit them.
3. Replace the non-secret `GA4_PROPERTY_ID` placeholder.
4. Grant the GA4 service account Viewer access to the existing property.
5. Configure a GitHub Sponsors webhook at
   `/api/webhooks/github/sponsors` with the same webhook secret.
6. Create a Cloudflare Access application for
   `growth.gnosi.temenosismael.org`. Use GitHub as the identity provider and
   allow only the configured account email.
7. Add Access bypass policies only for:
   - `/go/alternativeto/*`
   - `/api/webhooks/github/sponsors`
8. Keep `/api/*` and the dashboard behind Access. The Worker performs an
   additional email check for all administrative API routes.
9. Add the custom domain after the first successful Worker deployment.

The AlternativeTo listing should link to one of:

- `https://growth.gnosi.temenosismael.org/go/alternativeto/github`
- `https://growth.gnosi.temenosismael.org/go/alternativeto/releases`
- `https://growth.gnosi.temenosismael.org/go/alternativeto/sponsors`

## Data interpretation

- Redirect events measure intent.
- Release asset counter deltas measure confirmed downloads.
- GitHub traffic is snapshotted because the upstream window is fourteen days.
- The first observed release counter is a baseline, not a new download.
- No IP address or full user agent is stored.
