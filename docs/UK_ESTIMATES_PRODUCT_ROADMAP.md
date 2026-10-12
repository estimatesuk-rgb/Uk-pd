# UK Estimates | Housing Maintenance & Voids Product Roadmap
**Owner:** UK Estimates Ltd  
**Project:** estimatesuk-rgb/Uk-pd — `public/maintenance/index.html`  
**App:** https://uk-pd.estimates-uk.workers.dev/maintenance/  
**Updated:** 12 October 2026  
**Development priority:** Item 1 only, unless explicitly reprioritised.

## Status key
- **In progress:** Implementing and testing, not signed off for paying customers
- **Pilot in place:** Basic features already present but commercial acceptance outstanding
- **Planned:** Not started or only separate supporting infrastructure present
- **Released:** Passed end-to-end customer acceptance with real verified SOR data

| # | Feature | Current status | What must be delivered | Commercial benefit |
|---|---|---|---|---|
| **1** | **Intelligent SOR matching that learns** | **IN PROGRESS — ACTIVE FOCUS** | Confidence labelling; learn from user-approved SOR mappings, separately by customer/ratebook; accurately propagate truly identical activities regardless of room/sheet/page with individual quantities; flag incompatible unit/thickness/scope; bulk exact match; review unresolved and ambiguous lines; track measured matching accuracy/time | Core pay-per-job value |
| 2 | Batch pricing of multiple properties | Planned | Import property-level job packs, retain source address, consolidated pricing, separated BoQs | Paid bulk add-on |
| 3 | Advanced SMV workforce scheduling | Pilot in place (basic SMV, trade crew/day programming live) | Named teams, bank holidays, true dependencies and downtime, critical path, historical SMV v actual | Pro add-on |
| 4 | Materials take-off and merchant purchasing | Planned (cost allowances already present) | Verified recipes, units and pack sizes, vendor links/prices, POs, trade delivery scheduling | Paid materials add-on |
| 5 | Mobile surveys and operative field app | Planned | Room-based measuring, photos, dictation, work instructions and handover | Mobile add-on |
| 6 | Job completion, variations, valuations | Planned | Approved quantity changes, photo evidence, completion certificates, applications for payment | Job-control add-on |
| 7 | Task-level H&S/RAMS/COSHH | Planned for maintenance app (separate UKPD product exists) | Task-specific draft packs, asbestos prompts, competent review/approval | Compliance add-on |
| 8 | Commercial management and reporting | Planned (basic totals live) | Time-saved KPIs, job margin, SMV actual vs plan, productivity, corrections, variations, SLA | Analytics add-on |
| 9 | Council/contractor multi-tenant portal | Planned (current app stores jobs on current device/browser) | Tenant isolation, secure logins, permissions, central backups, contract-specific authorised ratebooks, billing approvals | Enterprise prerequisite |
| 10 | Usage tracking and per-job billing | Planned | Unique billable completed/approved/exported job, revisions free, invoices, credit packs, administration | Commercial launch prerequisite |

## Item 1 — technical scope and acceptance criteria

1. Never silently lose eligible lines or price wrong source rows. Every activity uses stable original sheet/row mapping and source identity. Review original and export source-row audit.
2. Identify **exact SOR code**, **verified learned equivalent**, **probable suggestions**, **low-confidence suggestions**, **unmatched**. Scores must be explainable and not fabricated precision; only safe exact/verified mappings are bulk-approvable.
3. Record explicit **human approval** (source specification normalisation, unit, contract-approved SOR code, ratebook version/identity, timestamp) locally for this pilot. Learned associations must never be taught by auto-filled lines, guesses, or an unverified manual basket rate.
4. Apply the approved mapping across identical descriptions in any room/sheet/page, while retaining each row's separate quantity, source row and progress. Never propagate across different materials, sizes, doors/fire ratings, units or construction scope.
5. For ambiguous descriptions, missing quantities/units or incompatible rates, require an estimator decision. Allow clearly labelled manual/basket values.
6. Detect corrections and conflicts, and ensure previously approved lines do not silently change when ratebooks are replaced.
7. Item is not commercially "complete" until testing real council and contractor SOR sheets produces zero wrong source-row writes, zero silent failed Add actions, 100% line-accounting, auditable unresolved counts, and a measured time saving. Build/CI passes alone are not enough.
8. Document the licensed NHF/M3 V8 source rights and commercial-use permissions before offering it to external organisations.

## Item 1 implementation log

- **12 Oct 2026 (prior):** Review paginated to 25 rows, removed old 160-line view limit; source-row audit Excel worksheet; safe exact-match action; manual/basket rates; improved Add feedback; SMV programme live.
- **12 Oct 2026 (now):** Focus on reliably remembering approved SOR selections, safe propagation to duplicates and reviewer confidence/ambiguous-match controls. Pilot app stores private uploaded ratebooks locally; do not commit proprietary rate data.
- Next: end-to-end test on representative real maintenance and void workbooks; measure time to price (including review), correction count, missed/unpriced line count and full-source tracing.

## Proposed charging model — testing, not final prices

- Current concept: **£20 + VAT per completed pricing-only job**; **£25 + VAT with basic SMV programme**.
- Price review: test £29–£39 per stand-alone completed estimate; volume/contract bands £19–£29; Pro jobs with approved SMV/advanced job planning £35–£49; larger contract pricing negotiated.
- Optional add-ons may be billed per completed job or as a separate monthly licence: advanced scheduling, multi-property batch jobs, verified materials orders, field app, variations/valuations, compliance, analytics, integrations.
- Credit rules: approval/export as billing event, **one charge per source job**, revisions and re-exports free, no bill for drafts or failed jobs; discounts based on verified volumes.
- Validate procurement budgets, licensing, enterprise hosting/support and supplier security before publishing prices.

## Reporting cadence

Send a concise **weekly Monday morning** status report and retain this document as the canonical roadmap. Each update must distinguish what actually shipped from proposed work and include test/deployment evidence, blockers and next steps. Do not declare work complete without a real-file acceptance run.
