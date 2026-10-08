# UK Principal Designers – report-generation audit

## Confirmed from source

- PD01–PD06 packages are defined in `src/main.jsx`.
- The Reports tab generates printable HTML in a popup, with a browser Print / Save PDF button. It does **not** currently generate a downloadable Word document or server-generated PDF.
- The RAMS pack creation button inserts generic placeholders such as 'AI draft required', rather than populated project-specific risk controls, COSHH data or method sequences.
- 'Analyse Project Documents' invokes the Supabase Edge Function `analyse-project-documents`. Its existence, configuration, output quality and permissions require verification; the front-end alone does not prove it works.
- Uploaded evidence is stored in the `project-files` bucket. The UI does not establish that all uploaded plans are indexed and processed by the AI.

## Required implementation sequence

1. Verify database schema, row-level security and the Edge Function in the correct Supabase project. Confirm role-based permissions before changing production data.
2. Build a secure server-side document analysis pipeline for PDFs, images and drawing metadata. Persist extracted facts with page/source references, confidence, revision and verification state. Never invent missing facts.
3. Generate structured PD01–PD06 reports from verified project data; explicitly label unverified AI proposals and outstanding design decisions.
4. Provide downloadable DOCX and PDF, versioning, issue registers and competent-person sign-off. Keep draft outputs separate from final declarations.
5. Populate RAMS, COSHH and CPP from actual scope, drawings, substances, site conditions and contractor methods. Ask targeted questions for missing inputs; do not assert a risk is controlled without evidence.
6. Add automated tests for project isolation, document uploads, missing-data prompts, role restrictions, report output, release gates and project deletion.

## Release criteria

- No report silently treats placeholders as technical approval.
- CDM 2015 Principal Designer duties and Building Regulations Principal Designer duties are distinguished.
- Construction Phase Plan remains under Principal Contractor control.
- Site-specific hazards, COSHH SDS references, emergency arrangements and residual risks are reviewable.
- Reports identify current applicable legislation, Approved Document editions and jurisdiction; no blanket assertion of compliance based only on AI.
- Preview build, tests and manual sign-off pass before promoting to production.
