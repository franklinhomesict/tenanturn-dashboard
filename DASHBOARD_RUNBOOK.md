# TenanTurn Executive Dashboard — Refresh Runbook

## Current implementation — September 30, 2026

This section supersedes the older static-refresh instructions below.

- Entry point: `src/AuditedDashboard.jsx`; shared calculations: `src/auditedLedger.js`.
- Live feed: `api/dashboard.js`. Every connection is fully paginated, counted, and checked for duplicate IDs. All eight source collections are reread after loading to reject changes during refresh. Approved order histories must load.
- Never edit a cached total or run the old build-time source patch scripts. `npm run build` runs regression checks and builds the actual checked-in source without rewriting it.
- Sales includes every approved customer order, including additional approved proposals on the same job, by its actual approval timestamp in America/Chicago. Separately evidenced additional scope is included once. Per the owner’s September 30 policy, net sales also include evidenced price increases, reductions and credits in their recognition period; full customer payment can establish acceptance of added scope. Invoice issue dates and progress balances never create a new sale.
- `approvalEvidence.js` contains individual audited scope decisions with source references. `evidenceFingerprints.js` detects changes to those source facts. These are not monthly totals. Formalized scope is deduplicated against the original decision. Missing or changed evidence is flagged and excluded.
- Future invoice-only added scopes with explicit dated approval notes are recognized automatically. Other new invoice-only scopes require review rather than guessed approval dates.
- Draft and denied invoices and bills are excluded. Pending and approved financial documents are issued ledger activity. Billing uses invoice issue date, not approval/payment date.
- Production excludes explicitly at-cost pass-through revenue and cost. Recorded job costs include fees. MR and CS share scope classifications; split results must conserve the company totals.
- Whole-job completion requires actual completion/close evidence. Paying one vendor bill does not prove completion.
- Projections are labeled as estimates even when the underlying records reconcile. Open economics are provisional. Closed recorded job profit is distinct from the subset passing implemented checks. Neither is company net profit or safe owner draw.
- Reviews retain their severity. Missing PM attribution, unresolved scope IDs, cost/commitment differences, and unclear stages cannot be relabeled housekeeping to obtain a green badge.
- Receipt policy: materials charged to 316 or another owner/manager account are reference-only on TenanTurn invoices, with zero price/due and no TenanTurn cost. Attach the receipt for their owner-account matching. If an existing nonzero invoice charge was collected, retain and flag that real mismatch until its resolution is documented. Do not overwrite historical cash or assume a repayment.
- `scopeReconciliation.js` validates original source fingerprints before matching progress/replacement invoice lines to original approved scopes. `priceAdjustmentEvidence.js` validates repricing and combined-scope decomposition. Original document values remain intact.
- Balanced unapplied customer funds are explicitly shown as held customer credits, excluded from sales and profit. A missing allocation or inconsistent payment balance blocks financial figures.
- No independent bank feed exists. Never label recorded JobTread cash as bank-confirmed cash.
- Every successful refresh has a timestamp. Failed or incomplete refreshes retain the prior timestamp and show an error. Data older than five minutes is stale. Financial figures are withheld on a failed refresh or stale source.
- Run `npm run build`. Reconcile the actual source fixture outside the public repository, including sales table sum, pending/draft/denied treatment, and MR + CS invariants. Never commit customer records, grant keys, or the private audit fixture.
- Verify a READY Vercel production deployment and the production API plus browser cards. A successful frontend build alone is not verification. Preview currently lacks the production JobTread credential and correctly reports a source error.

## Purpose
This file is the handoff for future ChatGPT sessions. Read this **before refreshing or changing dashboard data** so the operating logic does not have to be reconstructed.

## Live app
- Public URL: https://tenanturn.vercel.app
- Current dashboard lineage: v17
- Vercel project: `tenanturn-dashboard`
- GitHub repo: `franklinhomesict/tenanturn-estimator`
- Default branch: `main`
- Frontend: Vite + React
- Main dashboard file: `src/App.jsx`
- Browser title: `TenanTurn Executive Dashboard`
- Logo: TenanTurn logo from JobTread organization record
- GitHub `main` auto-deploys to Vercel production.

## Source of truth
**JobTread is the source of truth for operating and financial dashboard data.**

Do not refresh the dashboard from an old spreadsheet, previous dashboard snapshot, prior ChatGPT numbers, or memory. Always query JobTread live first.

## Critical TenanTurn operating rules
1. **Draft invoices are placeholders only.** They are not A/R, not billing queue, not evidence a job is ready to bill, and do not affect financial stage until actually issued.
2. **Pending Bid** = price sent; waiting for customer yes/no.
3. **Backlog** = approved job with no vendor/work-order assignment yet.
4. A **work order/vendor assignment is the first assignment signal**.
5. **Assigned / Not Started** = vendor assigned but no reliable evidence work has actually started.
6. **WIP** = work that has actually started and remains unfinished/unbilled. Verify start using work orders plus logs, comments, messages, photos, or other communication. Vendors may work without interacting with JobTread.
7. **Complete / Billed** = invoice actually sent.
8. **Paid** = payment received.
9. Large phased jobs may contain paid/billed portions and WIP at the same time. Only unfinished/unbilled work remains WIP.
10. Approved change orders on an active started job are WIP. If approved before any work begins, follow backlog/assigned logic until actual start.
11. **Pass-through reimbursements are not performance revenue and not performance cost.** Remove them from both sides of profitability calculations.
12. **Deposits/prepayments before work is performed are unearned customer cash**, not earned revenue/profit until work is performed.
13. Roofing and other contractor services belong in company totals but should be broken out separately from Make Ready work.
14. Blu, Blu 2, and SB are normal paying customers. Keep **billing account** separate from **work source/referral source** when JobTread notes identify the source.
15. A denied/revised proposal version is not automatically a lost job. A **true lost job** requires final communication/outcome showing the customer chose another option, declined, or otherwise did not proceed.
16. For vendor capacity, use **assignment/work-order date → done date** as cycle length. Do not infer actual days worked from log frequency. Calculate billable dollars generated over elapsed normal five-day workweek.
17. Profit terminology: **Job Profit = earned revenue − vendor labor − payment/Instant Pay fees − other true job costs.** Do not call this company net profit unless complete overhead has been included.
18. Track historical Instant Pay fees separately. Instant Pay is currently off.

## Refresh procedure
When Ian asks to “refresh,” “pull fresh data,” “update the dashboard,” or similar:

1. Query live JobTread data for the current reporting period and prior comparison period.
2. Rebuild current stages from source evidence:
   - Pending Bids
   - Backlog
   - Assigned / Not Started
   - WIP
   - Sent & Unpaid A/R
   - Paid
3. Ignore draft invoices when determining stage or A/R.
4. Review logs/comments/messages/photos where needed to distinguish assigned work from actual WIP.
5. Reconcile paid invoices:
   - remove reimbursements from revenue and cost
   - exclude unearned deposits/prepayments
   - include real production/vendor cost
   - include verified payment/Instant Pay fees
6. Reconcile cash separately from earned performance. Cash In/Out is not the same as earned revenue/profit.
7. Re-check true lost jobs from actual outcome notes/communication.
8. Re-check vendor assignment and completion dates before capacity calculations.
9. Surface data-integrity exceptions explicitly instead of forcing uncertain records into a category.
10. Cross-check totals before editing the app. If something does not reconcile, investigate rather than guessing.
11. Update `src/App.jsx` with the newly verified dataset and dates.
12. Commit to `main`; Vercel should auto-deploy.
13. Verify production deployment is READY and confirm https://tenanturn.vercel.app loads after deployment.

## Accuracy standard
This dashboard is used to make real business decisions. **Never carry forward a number merely because it appeared in a prior version.** Re-query and re-verify live JobTread records. When evidence is incomplete, under-count or label it uncertain rather than manufacture precision.

## Known caution from v17
The first deployed React conversion of v17 contained a mismatch involving the Minneapolis prepayment: display text said the prepayment was excluded while some displayed totals still embedded it. Therefore, **do not treat the current static financial values in `src/App.jsx` as authoritative for the next refresh.** Recalculate them from live JobTread.

## Dashboard design intent
The app should let Ian and Brandon quickly answer:
- What is coming in?
- What has been won but not assigned?
- What is assigned but not started?
- What work is actually in progress?
- What has been billed and is unpaid?
- What is making money?
- Where are margin, capacity, collection, or data-quality problems?

Keep the interface executive-level and concise. Let the app do the talking; avoid excessive explanatory copy.
