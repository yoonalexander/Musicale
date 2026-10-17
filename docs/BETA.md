# Seven-day beta record

Status: **not started**. Start only after the hosted candidate passes sign-in/vote/reload, the actual administrator can schedule, thirty forward days are playable, alerts have a real staging receipt, and the private backup/export path is verified. Seven elapsed UTC days cannot be replaced by accelerated clocks, synthetic votes or seven executions of a test.

## Participants and observation

Use private participant contact information outside Git; public records use aliases P1, P2 and P3. At least three real people independently try the site. Give new visitors only the site URL and observe without explaining the product flow; afterward record confusion and whether they discovered listening, sign-in, permanent daily choice, results and tomorrow's reset. Explain local email catchers only for local manual testing; the hosted beta uses actual delivered email.

Ask P1 to participate on seven consecutive UTC days, P2 to vote on day one, miss day two and return on day three, and P3 to independently complete the flow. This verifies legitimate continuing and reset streaks without changing timestamps or source records. Participation choices remain the listeners' own choices. Check both provider recordings in the relevant regions and feature genuine completed participation through Admin after voting closes.

| Day | Actual UTC date | Today playable | Health / readiness / buffer | Sign-in, vote, reload, profile result | Real streak observation                    | Issues / action |
| --- | --------------- | -------------- | --------------------------- | ------------------------------------- | ------------------------------------------ | --------------- |
| 1   | Pending         | Pending        | Pending                     | P1/P2/P3 independent use pending      | First-vote state pending                   | —               |
| 2   | Pending         | Pending        | Pending                     | Pending                               | P1 continues; P2 intentionally absent      | —               |
| 3   | Pending         | Pending        | Pending                     | Pending                               | P1 continues; P2 returns with reset streak | —               |
| 4   | Pending         | Pending        | Pending                     | Pending                               | P1 continues                               | —               |
| 5   | Pending         | Pending        | Pending                     | Pending                               | P1 continues                               | —               |
| 6   | Pending         | Pending        | Pending                     | Pending                               | P1 continues                               | —               |
| 7   | Pending         | Pending        | Pending                     | Pending                               | P1 reaches seven consecutive days          | —               |

If an essential product failure interrupts valid daily availability, fix it, record the incident and restart the seven-consecutive-day observation for the accepted candidate. Do not silently count an unavailable day. Changing only evidence/prose does not require discarding valid observations, but behavioral fixes require reviewing whether the affected gates must be rerun.

## Hosted acceptance before signing off

- [ ] Candidate commit, deployment date and exact migration versions recorded privately/publicly as appropriate.
- [ ] Owner and ordinary non-team user receive real email links, sign in and retain sessions.
- [ ] Ordinary user remains denied Admin; selected vote survives reload and cannot be changed or duplicated.
- [ ] Another open browser receives authoritative live rankings, preserving filters/page; measured hosted latency recorded.
- [ ] Owner imports/edits/changes availability, schedules/replaces/cancels, features completed participation, changes/restores K, reviews audit and follows recovery guidance through the interface.
- [ ] Phase 5 screen-reader, keyboard/device and new-visitor results recorded with browser/assistive-technology names.
- [ ] Safe isolated hosted staging failure triggers an actually received owner alert, then resolves after repair.
- [ ] Private backup export/off-site destination and isolated restore/auth/grant checks are verified.
- [ ] All seven real UTC days and at least three participants are recorded above; reproducible release blockers are closed.

Publish redacted outcomes, not email addresses, user IDs, session links, credentials or raw backups. Create the release tag only after these checks and the roadmap gates pass.
