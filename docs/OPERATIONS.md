# Musicale operations

Prepared October 16, 2026. Owner: the project owner, using the private administrator identity established in Phase 2. The code and local rehearsals below do not establish hosted sign-in, an active alert recipient, or an off-site production backup. See PHASE_6.md for actual verification status.

## Weekly editorial routine

Once per week, sign into `/admin`, confirm today is playable, and replenish to thirty consecutive playable future UTC days. Fourteen is the minimum alert threshold; thirty provides room for a missed weekly session. Review the actual queue's variety report, open provider links in the audience's region, and replace repeated, disconnected or unavailable pairs. Do not silently replace a day with recorded votes. Keep the letter artwork unless image permission is established.

Use the individual editor for small changes, JSON/CSV imports for batches, and the future replacement selector for schedule changes. Cancelling a future day creates a hole: immediately replace it, then verify the consecutive buffer. Feature real completed participation; never fabricate votes to fill the archive. The starter button preserves existing days and does not guarantee an old queue becomes diverse.

## Health and alerts

- `/api/health`: database/catalog query connectivity, independent of today's editorial readiness.
- `/api/readiness`: server UTC day, whether today's pair is playable, valid days in the next thirty, and the **consecutive** playable future buffer. HTTP 200 requires today's pair plus at least fourteen future days; attention/unavailable/preview returns 503. No future choices, account identities or private counts are returned. Responses are not cached.
- Readiness checks database metadata and configured external links; it cannot certify regional playback or email sign-in. Check those during the weekly session and beta.

The repository workflow `monitor.yml` checks both endpoints hourly at minute 17. GitHub schedules can be delayed; this is not an uptime SLA. Missing today, fewer than fourteen consecutive future days, a failed database read, malformed response or connectivity failure sends an actionable Resend email. A continuing incident can produce one message per run, up to twenty-four per day, sharing the account's email allowance with sign-in. Review delivery logs and fix the incident promptly; add persistent incident deduplication if this repetition becomes a problem.

Hosted activation is deliberately off by default. After deploying the readiness route and migration, set repository variable `MUSICALE_MONITOR_URL` to the canonical HTTPS origin; store the exact owner's address in secret `MUSICALE_ALERT_EMAIL` and a domain-restricted sending key in secret `RESEND_API_KEY`. Set variable `MUSICALE_MONITOR_ENABLED=true` only when configured. Keys must never be frontend variables or committed files. A missing/failed provider request fails the workflow and does not claim delivery.

Before activation, run a safe missing-day/low-buffer failure against an isolated **hosted staging** environment using the same notification destination. Confirm the actual email arrives, contains the expected diagnosis and response path, and resolves after repair. Provider acceptance or mocked/local delivery alone is insufficient. Retain only a redacted date/condition/receipt result. Do not cancel production content for this test. Monitor setup and the delivery receipt remain release gates until recorded.

## Incident response

| Symptom                                  | Response                                                                                                                                                                                                                                                                      | Verify                                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Missing or cancelled today               | Check UTC day and today's Admin entry. Restore a legitimate playable pair through scheduling where allowed. An already-active immutable date can require trusted owner repair; inspect existing votes first. Preserve any recorded selection and explain any unavailable day. | Today renders; readiness reports playable; a legitimate user can vote.                                  |
| Future buffer low                        | Queue thirty days, replace cancelled/unavailable days and inspect variety. The first gap ends the buffer even when later dates exist.                                                                                                                                         | Readiness buffer is at least fourteen; preferably thirty.                                               |
| Provider unavailable                     | Mark the song unavailable. Replace affected future pairs with verified playable songs. Preserve recorded votes; do not rewrite an active voted pair.                                                                                                                          | Provider opens in the relevant region; Today/future buffer recovers.                                    |
| Email or callback failure                | Check Resend delivery, Supabase SMTP, exact site/callback and the specific safe auth error. Request a fresh link in the same browser. Do not log tokens or guess that an instantly failing link expired. Continue Phase 2's hosted investigation.                             | A non-team person signs in, stays denied Admin, votes and reloads.                                      |
| Rankings inconsistent                    | Stop new writes through a reviewed maintenance deployment before investigation. Inspect source votes, events and activity. Use Admin reconstruction only when immutable source records agree.                                                                                 | All derived ratings/counters/snapshots match; historical K factors and source records remain unchanged. |
| Missing/corrupt source votes or accounts | Use a verified database backup in an isolated target; ranking reconstruction cannot recover deleted source data. Reconcile auth and grants before any cutover.                                                                                                                | Source row equality, identities, RLS and duplicate-vote checks pass.                                    |
| Failed migration                         | Preserve its transaction error and schema state privately. Do not reset hosted data or rewrite applied migrations. Determine which versions committed, restore into staging and validate a forward repair.                                                                    | Ordered tracking and schema agree; database/application tests pass.                                     |
| Failed deployment                        | Roll back to the previously verified compatible application commit. Check applied schema versions first: an old application may not support a new RPC contract. Do not drop data to match an old build.                                                                       | Database health, readiness, non-team sign-in/vote and live ranking smoke pass.                          |

No maintenance switch is claimed to exist in the current product. Before a destructive hosted restore, prepare and review the exact maintenance/cutover deployment. Do not rely on a browser notice to prevent direct RPC writes. If a consistent source snapshot cannot be obtained, keep writes disabled until the owner has a verified recovery path.

## Backup policy and rehearsal

Musicale's recorded Supabase plan is Free, last observed October 1; the current account plan has not been re-inspected in Phase 6. Supabase's [backup guide](https://supabase.com/docs/guides/platform/backups) recommends CLI exports for Free projects; downloadable automatic backups are not a Free-plan assurance. No paid upgrade is required by this implementation.

Target policy: export before schema/deployment changes and at least daily during beta. Retain seven daily copies plus the last pre-release copy in encrypted storage outside the database host, accessible only to the owner. Record timestamps and restore results. This is a proposed maximum twenty-four-hour data-loss window for daily exports, not a proven current backup service or recovery-time guarantee. Until an off-site destination and actual dated export are recorded, the policy is not operationally complete.

Follow Supabase's [current CLI backup/restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Obtain database connection information privately from Dashboard > Connect; use a direct connection or session pooler, not a transaction pooler. Supply secrets via a private environment, not chat or Git. Export **roles, schema and data**, plus migration history separately. A schema-only `db dump` is not a backup of votes or accounts. The default schema dump excludes managed schemas; the data export must include Auth rows, and custom auth triggers/policies need separate preservation. Review CLI dry-run exclusions before using it on the actual project.

```sh
npx supabase db dump --db-url "$OLD_DB_URL" -f roles.sql --role-only
npx supabase db dump --db-url "$OLD_DB_URL" -f schema.sql
npx supabase db dump --db-url "$OLD_DB_URL" -f data.sql --use-copy --data-only
npx supabase db dump --db-url "$OLD_DB_URL" -f history-schema.sql --schema supabase_migrations
npx supabase db dump --db-url "$OLD_DB_URL" -f history-data.sql --schema supabase_migrations --data-only --use-copy
```

Keep all exports private and encrypted; they contain identities and possibly credentials/session data. Never upload them as public CI artifacts. A hosted target already supplies managed roles/schemas: follow the linked platform procedure rather than replacing them with a local schema wholesale. Reconcile role passwords/memberships, object ownership, default privileges, custom auth triggers and table/function grants. Restore into an isolated target first, abort on SQL errors, compare source rows and schema, then test ordinary and administrator access. Re-enable **songs-only** Realtime and check schema tracking. Where Vault or column encryption exists, follow the provider's encryption-root-key instructions; a raw logical copy alone may be insufficient.

Auth users, identities, password hashes and account IDs must remain consistent with profiles and votes. Email/provider settings, SMTP credentials, callback allowlists and project signing keys are separate operational configuration. A new project's key differs: invalidate imported sessions and require fresh sign-in; do not assume old bearer tokens will work. Musicale includes four authorized audio assets in its Git/deployment bundle; preserve that bundle and its attribution/provenance files alongside database exports. It has no Supabase Storage objects. If Storage is added later, a database backup contains metadata rather than the object files.

The local rehearsal is reproducible after browser tests create actual local accounts and votes:

```powershell
$env:MUSICALE_LOCAL_WORKDIR='tmp/phase6-local'
npm run test:ui
npm run test:restore
```

`restore-rehearsal.mjs` refuses hosted backends, exports public/Auth/migration/legacy schemas plus extension definitions into an ignored private file, restores a uniquely named disposable local database, compares all selected table rows and authorization metadata, tests restored account isolation/duplicate rejection, and reconciles the songs-only publication. It compares source rows again and drops only its owned restore database. Existing managed cluster roles are reused. Restoration uses the existing local `supabase_admin` role to preserve managed Auth ownership; this does not grant or change any role in production. Only the empty default public schema in the disposable target is removed before restoration. Schema comparisons omit the intentionally different database name, while retaining every grant and owner. This is an actual local logical restore, not a demonstrated hosted disaster recovery or off-site backup.

## Deployment and cutover

1. Identify the exact candidate commit, previous compatible build and production migration versions. Leave read-only previews isolated.
2. Resolve Phase 2's hosted sign-in defect and establish the real administrator. Preserve source data and take the reviewed private backup above.
3. Apply only unapplied ordered migrations to isolated staging, through 0016 for the integrated stack (catalog 0010, operations 0011; inspect applied history before reconciling an older parallel operations 0010). Never reset a hosted project. Validate grants, RLS, migration tracking and the songs-only publication.
4. Deploy the same candidate to staging. Test email delivery/sign-in, ordinary-user denial, a legitimate vote/reload/profile, UTC state, live cross-browser updates, editorial scheduling and readiness. Rehearse a safe alert and verify its actual receipt.
5. After staging acceptance and owner approval of the concrete change, apply unapplied production migrations, then promote the compatible application. Verify both health endpoints, real owner/non-team use and the thirty-day queue. Record the exact commit and version list.
6. Activate monitoring only after its production endpoint and secrets are configured. Begin the seven actual UTC-day beta record with at least three real participants. Do not issue a release tag before the roadmap gates pass.
