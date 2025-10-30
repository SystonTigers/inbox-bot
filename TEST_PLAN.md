# Inbox Bot Test Plan

## Unit Tests (GasTap-style)
| Test | Purpose |
| --- | --- |
| `Utils conversions` | Verifies boolean/number coercion and fallback behaviour. |
| `ML classifier finance detection` | Ensures keyword model flags finance-themed emails. |
| `Unsubscribe detection` | Confirms `List-Unsubscribe` parser emits both MAILTO and HTTP targets. |

> Execute via `runInboxBotTests()` in the Apps Script IDE.

## Additional Recommended Unit Coverage
- Rule parser: Gmail search vs `regex:` translation, action list synthesis, priority ordering.
- Sender overrides: `ALWAYS_ACTION` vs `NEVER_UNSUB` handling.
- Undo ledger: push/pop round-trip plus archive/inbox reversal.
- Drive exporter: mock `DriveApp` to assert year/month folder creation and de-duplication guard.

## Integration / Smoke Tests
1. **Dry-Run Backfill (>=1,000 threads)**
   - Create a containment label (e.g., `label:test-seed`) and populate sample threads.
   - Add a RULES row limiting search to that label (temporary).
   - Run `runDryRunBackfill`; validate DRYRUN labels, LOG entries (mode = DRYRUN), Dashboard counts populated.
2. **Incremental Window**
   - Send three test emails (action required, finance PDF, newsletter with List-Unsubscribe).
   - Execute `processNewMailDryRun`.
   - Confirm categories, unsub queue only lists newsletter, Drive exports deferred (dry-run).
3. **Live Attachment Export**
   - Flip `dryRun` to `FALSE` temporarily, send finance PDF under threshold.
   - Run `processNewMail`; confirm Drive `InboxBot/Receipts/YYYY/MM` contains file, LOG row notes export, undo ledger records action. Roll back via `undoLastActions` after verification.
4. **Undo Validation**
   - With live mode, label a known thread through manual RULES entry.
   - Run `undoLastActions(1)`; confirm labels/archives revert and LOG error column remains blank.
5. **Trigger Audit**
   - Use **Install Triggers**, then inspect trigger dashboard for daily/hourly/weekly entries.

## Acceptance Tests
- **Dry-run >=1,000 threads**: No destructive actions; LOG/Dashboard populated, DRYRUN labels used.
- **Backfill Resume**: Abort mid-run, re-run `runLiveBackfill`; ensure no duplicate exports/labels and cursor advances.
- **Unsubscribe Queue**: Newsletter detection inserts queue rows with `status = NEW`; no automatic sends.
- **Idempotency**: Re-run same incremental batch; labels, exports, and archives should not duplicate; LOG processed counts increment but actions remain single per thread.
- **Quarantine Policy**: When rules mark `quarantine`, thread receives `InboxBot/System/Quarantine/Trash-Candidate (7d)` label; deletion still manual and only after >=7 days.
- **Finance Exports**: PDFs land in Drive folder with logged URLs; duplicates prevented via user property guard.
- **Reply Assistant**: Queue drafts, set status to `APPROVE`, run send flow to deliver emails; set `REJECT` and run discard to ensure emails are not sent and statuses update.
- **Dashboard Metrics**: Dashboard shows today/7d/30d processed/archived/errors, plus top 20 senders.
- **Daily/Weekly Summaries**: Triggers deliver daily summary and weekly digest (verify via Gmail).

## Regression Checklist
- Run `runInboxBotTests()` after each change set.
- Execute dry-run backfill sample and review LOG for anomalies (errors column, rule names).
- Validate UNSUB_Q statuses (no unintended SENT rows).
- Confirm undo stack trimming behaviour (<=500 entries).
- Spot check Drive export permissions when updating `financeDriveRootFolderId`.
