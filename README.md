# UK Principal Designers Management System

Secure project-management and document-control application for UK Principal Designers Ltd.

## Core controls
- PD01-PD06 project records
- RAG risk status and individual-assessment flagging
- actions, drawings/revisions, substitutions/design changes
- technical review and competent-person approval
- document, payment, audit and handover records
- declaration release is protected server-side in Supabase

## Deployment
Production is connected from the main branch. Current app includes secure login, project registers, PD01-PD06 workflow, compliance gates, evidence uploads, technical review, documents, payments and handover controls.

## Setup
Create deployment environment variables from .env.example. Never commit secret/service-role keys.
