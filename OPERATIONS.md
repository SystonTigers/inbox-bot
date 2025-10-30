# Inbox Bot Operations Guide

## Standard Runbooks

### Timeouts / Max Runtime
- **Symptom**: Execution stops mid-run; LOG sheet shows partial batch.
- **Remediation**: Increase `maxRuntimeMin` or lower `batchSize` in CONFIG.
- **Resume**: Re-run the same command; backfill/incremental cursors persist for idempotent replay.

### Backfill Cursor Reset
- **Symptom**: Backfill reports completion but older mail remains unprocessed.
- **Command**: Run `resetInboxBotBackfillCursor` (script editor) then re-trigger `runLiveBackfill`.
- **Note**: Avoid editing `INBOX_BOT_BACKFILL_CURSOR` manually via PropertiesService.

### Incremental Cursor Stuck
- **Symptom**: Incremental passes return zero threads every time.
- **Command**: Execute `resetInboxBotIncrementalCursor`, verify CONFIG `searchWindow`, then re-run `processNewMail`.

### Rate Limit / 429 Errors
- **Typical Causes**: High volume or concurrent manual runs.
- **Mitigation**: Lower `batchSize`, lengthen `Utilities.sleep` intervals if custom code is added, and stagger manual runs outside trigger windows.

### Undo Flow
- **Scenario**: Mislabeling or unintended archive in live mode.
- **Steps**: Menu -> **Inbox Bot -> Undo last N actions** -> provide count. Verify LOG entries for undo to ensure labels restored and threads returned to inbox when needed.

### Unsubscribe Review Workflow
- **Weekly Digest**: Monday digest email contains pending unsubscribes (`status = NEW`).
- **Manual Review**: Open `UNSUB_Q`, confirm sender handling is not `NEVER_UNSUB`, set `status` to `APPROVED` prior to manual action.
- **Post-Action Logging**: After executing mailto/HTTP unsubscribe, set `status = SENT`, increment `attempts`, fill `lastError` on failure, timestamp `lastTriedAt`.

### Reply Approval Flow
- **Queue Drafts**: Run **Queue Reply Drafts (Needs Approval)**. Drafts are logged in `REPLY_Q` with `status = PENDING`.
- **Approve**: Set `status = APPROVE` for drafts you want to send; optionally set `status = REJECT` for drafts you do not need.
- **Send**: Run **Send Approved Drafts**. Drafts with `status = APPROVE` send, gain `Reply/Sent by Assistant` label, and status -> `SENT`.
- **Discard**: Run **Discard Rejected Drafts** to remove `Reply/Needs Approval` label and mark `status = REJECTED`.
- **Errors**: Rows moved to `ERROR` should be reviewed (draft missing or Gmail send failure). Adjust and retry.

### Quarantine Purge
- **Policy**: Label `InboxBot/System/Quarantine/Trash-Candidate (7d)` only marks items; deletion is manual.
- **Routine**: Weekly review label contents, ensure message age >= configured `quarantineDays` and no user activity, then delete manually if policy allows.

### Attachment Export Issues
- Verify CONFIG `financeDriveRootFolderId` points to a valid folder (bootstrap populates automatically).
- Ensure PDFs are under `sizeThresholdMB`; adjust upward if legitimate receipts exceed the limit.
- Check LOG for `Exported X attachments`; absence indicates filter conditions or size constraints blocked export.

### Dashboard Refresh
- Dashboard updates automatically post-run. To force a refresh without processing mail, run `refreshInboxBotDashboardSnapshot`.

### Trigger Drift
- Inspect **Extensions -> Apps Script -> Triggers**. Use **Install Triggers** menu item to reinstall defaults:
  - Daily 02:00 `processNewMail`
  - Hourly `processNewMail`
  - Daily 21:00 `sendInboxBotDailySummary`
  - Weekly Monday 07:00 `runInboxBotWeeklyMaintenance`

### Logs & Audit Retention
- LOG sheet is append-only; archive by copying data to an `ARCHIVE` sheet before clearing older rows if needed.
- Daily summary/weekly digest recipients default to the script owner (`Session.getActiveUser()`). Adjust recipients by editing `logging.gs`.

## Flowchart - If Something Breaks
```text
Start
 ↓
Check LOG sheet for recent errors?
 ├─ Yes → Inspect error → Fix cause → Re-run
 └─ No  → Verify CONFIG & cursors
        ↓
        Reset cursor? (Backfill/Incremental)
        ├─ Yes → Run reset helper → Retry
        └─ No  → Check GAS logs for quotas/timeouts → Tune `batchSize`/`maxRuntimeMin` → Retry
```
