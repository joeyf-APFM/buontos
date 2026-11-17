---
title: Data products
summary: What a data product is, how to find and subscribe to one, and how products move from draft to the Marketplace.
tags: [data product, product, marketplace, subscribe, deliverable, output port, odps, publish, status]
topic: Working with data
order: 20
route: /data-products
---
A **data product** is data packaged for other people to use: a clear name, an owner team,
a description of what it is for, and one or more **deliverables** (the tables, views or
other assets it hands over). Nucleus follows the open ODPS standard for products.

## Finding data products

- **Discover → Marketplace** lists products that have been published for people to find.
  Start here if you want to use data.
- **Build → Products → All products** lists every product you can see, including drafts.
- The search box in the top bar also finds products by name and description.

Open a product to see its purpose, owner team, deliverables, linked contracts and status.

## Subscribing to a product

When a product is **Active**, its page shows **Subscribe**. Once subscribed, you receive
notifications about the product. Use **Unsubscribe** to stop.

To get access to the data itself, use **Request...** on the product page and choose
**Request Access**. See [Requesting access](/help/requesting-access#access-to-a-single-product-or-contract).

## What a product contains

| Part | What it holds |
|---|---|
| **Product Name**, **Version** | For example "Customer Orders Daily", version 0.0.1 |
| **Product Type** | Where it sits in the data value chain: Source, Source Aligned, Aggregate, Consumer Aligned or Sink |
| **Owner Team** | The team responsible for it |
| **Project**, **Domains** | Where the work belongs |
| **Purpose**, **Usage**, **Limitations** | What it is for, how to use it, and what it must not be used for |
| **Deliverables** | What it hands over; each can point to a data contract |
| **Tags**, **Consumer Groups** | For finding and for deciding who it is for |

## Product statuses

A product moves through these statuses:

**Draft → Proposed → Under Review → Approved → Active → Deprecated → Retired**

You can also park a draft in **Sandbox** while you experiment. Use **Request...** on the
product page to move it on: **Request Review** sends a draft for review (it becomes
Proposed), and **Change Status** (or **Request Status Change**, when you need approval)
moves it between the other statuses.

Your admins can attach workflows to these steps, so some steps may ask for approval or
run checks before the status changes.

## Publishing to the Marketplace

A product appears in the Marketplace once it is **published**. To publish:

- The product must be **Active**.
- Every deliverable that has a contract must point to a contract that is **Approved** or
  **Active**.
- You need Edit rights on products (by default: Data Producer, Data Steward, Data
  Governance Officer, Admin).

Then select **Publish** on the product page and pick a **Publication scope**: **Domain**,
**Organization** or **External**. For the step-by-step version, see
[Walkthrough: publish a data product](/help/walkthrough-publish-a-data-product).

## Who can do what with products

By default, Data Consumers can view products, Data Producers and Data Stewards can create
and change them, and Data Governance Officers and Admins can also manage and approve them.
See [Roles and permissions](/help/roles-and-permissions#what-each-role-can-do).
