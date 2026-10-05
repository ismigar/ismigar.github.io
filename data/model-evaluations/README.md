# Gnosi public work-sample bank

This repository publishes the versioned, original work samples used by Gnosi and
reviewed observations from volunteers. It starts **empty**, with no fabricated
model results. Publishing this directory requires merging its PR into `main`;
GitHub Pages then serves `index.json` at:

`https://gnosi.temenosismael.org/data/model-evaluations/index.json`

Gnosi reads this public file without API keys, cookies, account identifiers,
vault data or model calls. It caches a validated copy for offline use. Nothing
is uploaded automatically. The existing private growth-dashboard Worker is
unrelated and receives no model-test data.

## Contributing a result

1. In Gnosi, run the public work samples for an active model with an explicit
   budget and authorization. The samples use provider-default reasoning, an
   output limit of 1024 tokens and no business tools or personal bot context.
2. Review any open-ended deliverables. Open **Prepare a public-bank
   contribution**, inspect the export and download the JSON. This does not send
   it anywhere. Review the whole file before choosing to publish it: it contains
   model/provider identifiers, public-sample responses, timestamps, latency,
   costs (with their source) and verdicts. Agent/run identities, vault paths,
   credentials, review notes and personal source documents are omitted.
3. Fork this repository, then run:

   ```sh
   python scripts/model_evaluations.py --import-file /path/to/export.json
   ```

4. Submit a PR containing the new `submissions/<content-hash>.json`. Do not
   fabricate rows, rename another contribution, upload traces, or paste keys.
   Reused local/shared cases are not independent new observations and are
   excluded from exports. Old runs without recorded inference settings cannot
   be exported. Custom endpoints and unsupported transports stay local.
5. A maintainer inspects the outputs and associates the PR's GitHub author with
   an entry in `attestations.json`. The entry has **exactly** `contributor`,
   `review_url` (this repository's PR URL) and `approved_cases` (IDs of
   open-ended deliverables the maintainer actually reviewed). A submission
   does not choose its own public contributor identity or approve itself.
6. The maintainer regenerates and commits the index:

   ```sh
   python scripts/model_evaluations.py
   python scripts/model_evaluations.py --check
   python -m unittest discover -s tests -v
   ```

   CI rejects unreviewed submissions, private/unknown fields, wrong digests,
   changed fixtures/protocols, unsupported inference parameters, duplicate IDs,
   future dates, forged automatic verdicts and stale generated indexes. The
   validator never executes model output or imports a model SDK.

Initial exportable transports are the standard OpenRouter, OpenAI, DeepSeek and
Mistral endpoints supported by Gnosi's bounded OpenAI-compatible diagnostic
client. Other transports can be added with explicit, equivalent protocols.
Provider means the configured gateway; an unpinned gateway can use different
upstream deployments. This bank does not verify a vendor's internal routing or
cryptographically certify that a volunteer executed the reported model.

## Reuse and limits

Gnosi compares the **exact provider, model ID, fixture version and recorded
inference parameters**. The public protocol identifies the bounded client and
validator revisions, canonical API endpoint, LangChain OpenAI SDK version, default reasoning knobs and
output limit. The versioned suite includes prompts, authored sources, expected
data and required reviews; bank content never replaces the app's own prompts.
The current validator requires bare JSON; fenced JSON is a formatting-contract
failure. Passing an automatic check is not an approval of open-ended quality.

For each case, reuse needs the latest observation from **at least two different
reviewed GitHub contributors**, with no disagreement or inconclusive latest
attempt. Human-review cases also need accepted local reviews and maintainer
approval in the attestation. More observations from one person do not satisfy
this rule. A contributor's newer observation supersedes their older one.
Community disagreement triggers a local check rather than excluding a model.
Local evidence has priority. Users can disable shared reuse or explicitly
repeat the cases. Withdrawal or loss of consensus invalidates saved copies of
shared evidence when the updated bank is available.

Costs and latency are descriptive observations, not a quote for another user.
Reported, estimated and unknown costs remain distinct. A timeout, cancellation
or truncated response is inconclusive. A bank is an accumulated reference,
not proof of complete-book comprehension or successful production-tool use.
Samples remain available as they age; Gnosi flags old observations. Changing
fixture/protocol revisions prevents reuse. Vendor models can change behind an
ID, so age and independent local checking still matter.

The whole index is bounded to 4 MB and 1000 contributions. The cache is normally
refreshed at most every six hours, failed requests are throttled, and the UI
provides manual refresh. An invalid/unavailable index leaves local testing
available and falls back to the last validated copy. Reaching the size limit
requires a reviewed future archival/sharding change, not silently dropping rows.

The portable contract is copied from
`Gnosi/backend/services/public_evaluation_contract.py`. Keep both reviewed
copies equivalent when changing the protocol, update fixtures deliberately,
and bump the client/validator revision when their meaning changes.
