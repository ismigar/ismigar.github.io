# Gnosi Growth Dashboard

Private growth intelligence for the Gnosi project. The dashboard separates the
independent discovery and distribution signals from community and sponsorship
outcomes, stores historical snapshots in D1, and runs entirely on Cloudflare's
free tier. It is localized in Catalan, Spanish, and English.

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

## Marketplace submission broker

The Worker also exposes `POST /api/marketplace/submissions` for the Gnosi
backend. Store a dedicated `MARKETPLACE_SUBMISSION_TOKEN` with
`wrangler secret put`, and point Gnosi at the endpoint with
`GNOSI_MARKETPLACE_SUBMISSION_URL` plus the matching
`GNOSI_MARKETPLACE_SUBMISSION_TOKEN`.

Uploaded packages remain private as bounded D1 chunks. Metadata, downloads, and
review state are available only through OAuth-protected moderation endpoints.
Approval records human review but never signs or publishes the package; the
official release workflow remains the only signing boundary.

The AlternativeTo listing should link to one of:

- `https://gnosi-growth-dashboard.gnosi-ismigar-growth.workers.dev/go/alternativeto/github`
- `https://gnosi-growth-dashboard.gnosi-ismigar-growth.workers.dev/go/alternativeto/releases`
- `https://gnosi-growth-dashboard.gnosi-ismigar-growth.workers.dev/go/alternativeto/sponsors`

AlternativeTo does not provide an official metrics API and blocks scheduled
Worker fetches. Update its public likes, comments, reviews, and rating through
the authenticated dashboard form. The source health explicitly labels this as
a manual snapshot. Redirect clicks and GitHub referrer traffic remain automatic
because those signals are collected by Gnosi and GitHub respectively.

## Data interpretation

- Redirect events measure intent.
- `desktop_download_click` measures visits from the landing CTA to the platform
  chooser; `installer_download_click` measures a platform-specific asset click.
  Neither is treated as a confirmed download.
- GitHub traffic, redirects, and release downloads use different attribution
  models and windows. They are a journey overview, not a conversion funnel.
- Release asset counter deltas measure confirmed asset downloads, not installs
  or people.
- Desktop installers are counted separately from Word/LibreOffice/Web Clipper
  connectors, updater metadata, and other release artifacts.
- The daily download series and headline use installer assets only.
- GitHub traffic is snapshotted because the upstream window is fourteen days.
- The first observed release counter is a baseline, not a new download.
- No IP address or full user agent is stored.

## Response compatibility

The static shell normalizes dashboard responses before rendering. A Worker
response from the previous contract that omits `journey` is reconstructed from
the available download and AlternativeTo fields, while unrelated or incomplete
error payloads produce the explicit error screen. Never pass unchecked API JSON
directly into the React state: a staggered Pages/Worker deployment must not turn
the private dashboard into a blank page.
