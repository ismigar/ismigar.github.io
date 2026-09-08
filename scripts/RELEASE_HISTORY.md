# Public release history

The three `changelog*.html` pages are the public version history used by Gnosi's
Control Center. The `#v<version>` fragments link to individual releases. GitHub
Pages serves this repository at its existing custom domain as well as handling
the `ismigar.github.io` entry point.

`sync_release_history.py --source ../Gnosi` refreshes the static snapshot and all
three pages using the local Gnosi catalog and the public GitHub release list.
Without `--source`, it reads Gnosi's upstream `main`. Only actual published app
releases are included; drafts, unreleased catalog entries and plugin packages are
excluded. Missing historical notes retain a link to the original release.

On page load, `release-history.mjs` checks for added or removed public versions.
If the set changes, it reads the canonical notes for the visitor's language and
refreshes the list. API limits, offline access or unavailable upstream data leave
the static history readable. No versioned installer filenames are guessed.

Run `python3 scripts/sync_release_history.py --check`, the Python tests, and
`node --test tests/release-history.test.mjs` before publishing the site. The
existing site-quality workflow performs these checks without network access.
