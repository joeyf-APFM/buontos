---
title: Data contracts
summary: What a data contract is, what goes into one (schemas, quality rules, terms), and how a contract gets reviewed and approved.
tags: [data contract, contract, schema, columns, quality rules, odcs, review, approval, status]
topic: Working with data
order: 21
route: /data-contracts
---
A **data contract** is a written promise about a dataset. It says what the data looks like
(its schema and columns), how good it must be (quality rules), and how it may be used.
Producers write contracts; consumers rely on them. Nucleus follows the open ODCS standard
for contracts.

## Finding contracts

Go to **Build → Data Contracts → Explorer**. You see every contract your role can view,
with its status. Open one to see its schemas, quality rules, owner team and linked data
products. The search box in the top bar also finds contracts.

## What goes into a contract

| Part | What it holds |
|---|---|
| **Name**, **Version**, **Status** | For example "Customer Orders Contract", version 0.0.1, Draft |
| **Owner Team**, **Project**, **Domains** | Who owns it and where it belongs |
| **Purpose**, **Usage**, **Limitations** | What the data is for and what it must not be used for |
| **Schemas** | The tables or objects it describes, with their columns |
| **Quality Rules** | Checks the data must pass |
| **Linked Business Concepts** | Business terms the contract is about |
| **Linked Data Products** | Products that deliver data under this contract |

## Adding schemas

On a contract page, the **Schemas** section offers three ways to describe your data:

- **Add Schema Manually**: type the schema name and its columns yourself.
- **Infer from Catalog**: pick an existing Unity Catalog table and copy its columns.
- **Infer from Asset**: copy the structure from an asset already in Nucleus.

Each column has a **Column Name**, a **Logical Type**, and options such as **Required (NOT
NULL)** and **Primary Key**.

A contract needs at least one schema before it can go to review.

## Contract statuses

**Draft → Proposed → Under Review → Approved → Active**, then later **Deprecated →
Retired**.

- Use **Request...** on the contract page and choose **Request Data Steward Review** to send
  a draft for review. It becomes **Proposed**.
- A reviewer moves it to **Under Review**, then **Approved**, or sends it back to **Draft**.
- An approved contract can be made **Active**.

Contracts can also be deprecated straight away in an emergency.

## Using a contract in a data product

A data product's deliverables point to contracts. Only **Approved** or **Active**
contracts can be picked for a deliverable, and a product can only be published when its
contracts are approved or active. From an approved or active contract you can use
**Create Data Product** or **Link to Existing Product** under **Linked Data Products**.
See [Data products](/help/data-products).

## Who can do what with contracts

By default, Data Consumers can view contracts, Data Producers and Data Stewards can create
and edit them, and Data Governance Officers and Admins can also manage them. Data Stewards,
Data Governance Officers and Admins may approve contracts. See
[Roles and permissions](/help/roles-and-permissions#approval-rights).

To write your first contract, follow
[Walkthrough: create a data contract](/help/walkthrough-create-a-data-contract).
