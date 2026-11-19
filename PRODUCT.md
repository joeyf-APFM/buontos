# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three personas, confirmed as equally important; none is secondary:

- **Data producers** build and release data contracts and data products.
- **Data consumers** (analysts and other business users) discover, understand and subscribe to data products.
- **Governance and stewards** maintain domains and business glossaries, review assets, and oversee compliance.

Admins have read/write access to everything. The UI shows different features by group membership, and the Home page adapts to the persona (consumers get a marketplace-style discovery surface; producers get create/continue draft actions).

## Product Purpose

Nucleus is APFM's fork of Ontos (Databricks Labs): a data governance and management platform delivered as a Databricks App on Unity Catalog. It lets teams organize, govern and deliver data products following Data Mesh principles, using the ODCS (data contracts) and ODPS (data products) standards.

The current effort is a UX adaptation of the fork. Its confirmed goal is to **simplify workflows and navigation**: cut steps and surface the common paths for each persona. A Phase 0 baseline analysis (usability baseline, fork inventory, upstream sync, status table) is committed under `docs/` and is the evidence base for that work.

## Positioning

One governed surface that ties technical Databricks assets to formal contracts, business glossary concepts and compliance checks, with a data product lifecycle that runs from co-designed draft contract through release, subscription and ongoing compliance verification.

## Operating Context

- Runs as a Databricks App; users reach it through their Databricks identity and directory groups.
- Data product lifecycle: producer and consumer co-design a draft contract; producer enriches and releases it; producer builds a data product whose output ports reference the contract; consumer subscribes; background jobs verify compliance and notify stakeholders of violations.
- Local development runs in a dev container with a mock admin user (`localdev`).

## Capabilities and Constraints

- Core areas: Data Contracts, Data Products, Assets and ontology-driven Asset Explorer, Business Glossaries and concepts, Compliance, Data Asset Reviews, Workflows, Entitlements, Master Data Management, Catalog Commander, Settings (roles, tags, teams, projects, domains).
- Frontend: React and TypeScript on Vite with React Router; backend: FastAPI.
- **Upstream mergeability is binding.** Changes must stay mergeable from Ontos. Internal identifiers (`ONTOS_*` environment variables, the `ontos-ontology` taxonomy, module names) keep the upstream name.
- Not yet decided: the specific navigation and workflow changes. Phase 0 evidence informs them; none are confirmed.

## Brand Commitments

Nucleus is the product name, shown as APFM's fork of Ontos; attribution to Ontos (© Databricks, Inc.) is required by the license (see `LICENSE.txt` and `NOTICE`). No other brand commitments were stated.

## Evidence on Hand

- Phase 0 baseline analysis and evidence notes (`docs/`, commit `2f73c023`).
- User journey, lifecycle, persona and gap-analysis documents in `docs/user-journeys/`.
- A running local instance at `localhost:3000` with seeded data.
- No usage analytics or user research data have been confirmed; do not invent any.

## Product Principles

- Serve all three personas; a simplification for one must not break another's path.
- Shorten the common paths first: creating and releasing contracts and products, finding and subscribing to products, and reviewing assets.
- Keep the fork mergeable: prefer changes that can sit alongside upstream code.
- Show each person what their role needs; hide the rest rather than explain it.

## Accessibility & Inclusion

No product-specific standard has been set. Not confirmed as WCAG AA.
