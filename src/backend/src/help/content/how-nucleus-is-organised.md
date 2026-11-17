---
title: How Nucleus is organised
summary: The main things Nucleus keeps track of (domains, teams, projects, contracts, products, concepts) and how they fit together.
tags: [concepts, glossary, domain, team, project, contract, product, asset, overview]
topic: Basics
order: 2
---
Nucleus keeps track of a small set of things. Once you know them, every screen makes
more sense.

## The building blocks

| Thing | What it is | Example |
|---|---|---|
| **Domain** | A business area that owns data. Domains can sit inside other domains. | Sales, with Sales Analytics inside it |
| **Team** | A group of people (single users or directory groups) who do the work. | Sales Data Team |
| **Project** | A piece of work that one or more teams share. | Customer 360 |
| **Asset** | Something real in your data platform: a table, view, dashboard, model or API. | the `sales.orders` table |
| **Data contract** | A written promise about a dataset: its columns, quality rules and terms of use. | Customer Orders Contract |
| **Data product** | A package of data offered to other people, built on one or more contracts. | Customer Orders Daily |
| **Concept** | A business term from your organisation's vocabulary. | Customer, Order |

## How they connect

- A **domain** groups teams, contracts and products that belong to one business area.
- A **team** owns contracts and products (the **Owner Team** field), and can be linked to
  one or more domains.
- A **project** brings teams together. When you create a contract or product, you can only
  pick projects you are a member of.
- A **data product** delivers data through **deliverables**. Each deliverable can point to a
  **data contract** that describes exactly what it delivers.
- **Concepts** are linked to contracts, products and other items so people can find data
  by business meaning, not only by table name. See
  [Business glossary and semantic links](/help/glossary-and-semantic-links).

## Lifecycles: draft to active

Contracts and products move through statuses. The usual path is:

**Draft → Proposed → Under Review → Approved → Active**, and later **Deprecated →
Retired**.

- **Draft**: you are still writing it. Only people with edit rights can change it.
- **Proposed / Under Review**: you asked for a review and a reviewer is looking at it.
- **Approved**: the reviewer agreed. It can now be made active.
- **Active**: in use. Active products can be published to the **Marketplace**.

Products also have a **Sandbox** status for experiments. Who may approve each step is set
by your admins (see [Roles and permissions](/help/roles-and-permissions#approval-rights)).

## Roles decide what you can do

Every person gets one or more **app roles**, such as Data Consumer or Data Producer. A role
sets, for each area of the app, whether you can see it, change it, or manage it. See
[Roles and permissions](/help/roles-and-permissions).
