# Gmail Inbox Bot

Production-grade Gmail triage implemented entirely in Google Apps Script, orchestrated through a Google Sheet control plane with rule-first classification, optional ML fallback, safe unsubscribe review, and full auditability.

## First-Run Checklist
1. Create Google Sheet `Inbox Bot Config`.
2. Extensions -> Apps Script; enable manifest; paste **all files** below.
3. Run `bootstrapInboxBotSheets()`; approve scopes.
4. Open CONFIG: confirm `dryRun=TRUE`, `labelPrefix=DRYRUN/`, `batchSize=50`, `searchWindow=newer_than:3y`.
5. Open RULES: confirm starter rules.
6. Menu -> **Run Dry-Run Backfill** -> verify DRYRUN labels in Gmail.
7. Menu -> **Queue Reply Drafts (Needs Approval)** -> check **REPLY_Q**, set some rows to `APPROVE`.
8. Menu -> **Send Approved Drafts** -> verify they send.
9. Flip `dryRun=FALSE` when happy -> **Run Live Backfill**.
10. Menu -> **Install Triggers**.

## Menu Map
- Run Dry-Run Backfill -> `runDryRunBackfill`
- Run Live Backfill -> `runLiveBackfill`
- Process New Mail -> `processNewMail`
- Process New Mail (Dry-Run) -> `processNewMailDryRun`
- Review Unsubscribes -> `reviewUnsubs`
- Undo last N actions -> `undoLastActions`
- Install Triggers -> `installInboxBotTriggers`
- Open Dashboard -> `openDashboard`
- Bootstrap Sheets -> `bootstrapInboxBotSheets`
- Queue Reply Drafts (Needs Approval) -> `queueRepliesForApproval`
- Send Approved Drafts -> `sendApprovedDrafts`
- Discard Rejected Drafts -> `discardRejectedDrafts`

Helpers exposed via script editor:
- `resetInboxBotBackfillCursor`
- `resetInboxBotIncrementalCursor`
- `refreshInboxBotDashboardSnapshot`
- `sendInboxBotDailySummary`
- `sendInboxBotWeeklyDigest`
- `queueRepliesForApproval`
- `sendApprovedDrafts`
- `discardRejectedDrafts`

## Key Features
- **Rules-first classification** (ordered RULES tab) with heuristics + optional keyword ML fallback.
- **Thread-level actions**: custom labels, archive-by-category, star/pin, quarantine, Drive exports.
- **Dry-run safety**: DRYRUN/ prefixed labels, zero destructive operations until enabled.
- **Undo**: script-level ledger allows reverting the last N live actions.
- **Backfill + incremental**: resumable oldest-first backfill and sliding-window incremental processing.
- **Unsubscribe queue**: `List-Unsubscribe` detections logged for human approval; no automatic sending.
- **Finance exports**: PDFs routed to Drive `InboxBot/Receipts/YYYY/MM` (configurable root ID).
- **Reply Assistant**: Drafts suggested replies, queues in REPLY_Q, and waits for approval before sending.
- **Observability**: structured LOG sheet, Dashboard counts (today/7d/30d), top senders, daily summary, weekly digest.

## Control Sheet Tabs
- **CONFIG**: master switches (`dryRun`, `archiveAfterLabel`, `enableML`, `enableUnsub`, `batchSize`, `maxRuntimeMin`, `sizeThresholdMB`, `quarantineDays`, `labelPrefix`, `searchWindow`, `archiveCategories`, `starCategories`, `financeDriveRootFolderId`).
- **RULES**: `ENABLED | PRIORITY | QUERY | CATEGORY | ACTIONS`; executed in ascending priority before heuristics/ML.
- **SENDERS**: `SENDER_PATTERN | HANDLING (ALWAYS_ACTION/NEVER_UNSUB/DEFAULT) | NOTES` for overrides.
- **LOG**: `timestamp | mode | operation | rule | processed | archived | errors | batchId`.
- **UNSUB_Q**: `sender | method | target | status | attempts | lastError | lastTriedAt`.
- **DASHBOARD**: auto-populated summary + charts (refreshes after each run or `refreshInboxBotDashboardSnapshot`).
- **REPLY_Q**: approval queue for reply drafts (`timestamp | threadId | draftId | to | subject | template | preview | status`).

## Safety Checklist
- Keep `dryRun = TRUE` until rules label correctly and LOG is clean.
- Verify DRYRUN-prefixed labels are removed once switching to live.
- Monitor LOG `errors` column; investigate before rerunning.
- Quarantine label `InboxBot/System/Quarantine/Trash-Candidate (7d)` is informational until deletion is explicitly enabled.
- Use `undoLastActions` immediately if a rule misfires during live mode.
- Review UNSUB_Q and REPLY_Q before executing unsubscribes or sending replies.

## Flowchart - If Something Breaks
Start  
 ↓  
Check LOG sheet for recent errors?  
 ├─ Yes → Inspect error → Fix cause → Re-run  
 └─ No  → Verify CONFIG & cursors  
        ↓  
        Reset cursor? (Backfill/Incremental)  
        ├─ Yes → Run reset helper → Retry  
        └─ No  → Check GAS logs for quotas/timeouts → Tune `batchSize`/`maxRuntimeMin` → Retry

## Setup Options
### Sheet-Bound
1. Open the control spreadsheet -> **Extensions -> Apps Script**.
2. Paste project files (or `clasp pull`).
3. Run `bootstrapInboxBotSheets`.
4. Authorize scopes (Gmail modify/read, Drive, Sheets, Properties, Script, Mail).

### `clasp`
1. `npm install -g @google/clasp` & `clasp login`.
2. `clasp create --type standalone --title "Inbox Bot"` (or `--parent <spreadsheetId>` if binding immediately).
3. Copy repository contents into the clasp project directory.
4. `clasp push`, open editor (`clasp open`), set Script ID on the spreadsheet (File -> Project properties).
5. Run `bootstrapInboxBotSheets`.

## Trigger Plan
- Daily 02:00 -> `processNewMail` (live incremental).
- Hourly -> `processNewMail` (light incremental top-up).
- Daily 21:00 -> `sendInboxBotDailySummary`.
- Weekly Monday 07:00 -> `runInboxBotWeeklyMaintenance` (refresh dashboard + send digest/unsub suggestions).

## README -> Assumptions
- Control spreadsheet remains linked via bootstrap-set script property.
- Gmail Advanced Service can be disabled; the bot falls back to time-window incremental searches.
- Attachment exports obey Drive quotas and `sizeThresholdMB`.
- Gmail system category labels remain intact; bot only adds custom labels.
- GasTap-style lightweight tests (`runInboxBotTests`) are sufficient validation.
- No permanent deletes occur unless quarantine plus explicit enablement is configured.
