---
title: "Walkthrough: create a data contract"
summary: Step by step, write a Customer Orders contract with one schema and three columns, then send it for review and get it approved.
tags: [walkthrough, tutorial, data contract, schema, columns, review, example]
topic: Walkthroughs
order: 31
route: /data-contracts
roles: [Data Producer, Data Steward]
---
This walkthrough writes a contract for a customer orders table. At the end you have a
contract named **Customer Orders Contract** with one schema, sent for review and approved.

## Before you start

- You need Edit rights on contracts. By default Data Producer, Data Steward, Data
  Governance Officer and Admin have them. See
  [Roles and permissions](/help/roles-and-permissions#what-each-role-can-do).
- It helps to have a team and project to own the contract. If you have none, see
  [Walkthrough: set up a domain, team and project](/help/walkthrough-set-up-a-domain-team-and-project).

## Step 1: create the contract

1. In the side menu, open **Build → Data Contracts → New Contract** (or open **Explorer**
   and select **New Contract**). The **Create New Data Contract** dialog opens.
2. Fill in:
   - **Name**: `Customer Orders Contract`
   - **Version**: leave `0.0.1`
   - **Status**: leave **Draft**
   - **Owner Team**: `Sales Data Team`
   - **Project**: `Customer 360`
   - **Domains**: `Sales Analytics`
   - **Purpose**: `One row per customer order, for sales reporting.`
   - **Usage**: `Join to the customer table on customer_id.`
   - **Limitations**: `Orders from the last 3 years only.`
3. Select **Create Contract**. The contract page opens.

## Step 2: add a schema

A contract needs at least one schema before it can be reviewed.

1. In the **Schemas** section, select **Add Schema Manually**. The **Add New Schema** dialog
   opens.
2. Under **Schema Information**, fill in:
   - **Name**: `orders`
   - **Physical Name**: `sales.reporting.orders`
   - **Description**: `Customer orders.`
3. Under **Properties (Columns)**, add three columns. For each, fill in the fields and
   select **Add Column**:

| Column Name | Logical Type | Options |
|---|---|---|
| `order_id` | string | **Primary Key**, **Required (NOT NULL)** |
| `customer_id` | string | **Required (NOT NULL)** |
| `order_total` | number | none |

4. Select **Add Schema**.

If the table already exists in Unity Catalog, you can use **Infer from Catalog** instead
and pick the table; Nucleus copies its columns.

## Step 3: add a quality rule (optional)

1. In the **Quality Rules** section, select **Add Rule**. The **Add Quality Rule** dialog
   opens.
2. Fill in:
   - **Rule Name**: `Order total is not negative`
   - **Description**: `No order may have a negative total.`
   - **Dimension**: `accuracy`
   - **Rule Expression**: `order_total >= 0`
3. Select **Add Rule**.

## Step 4: send it for review

1. At the top of the contract page, select **Request...**.
2. Under **Request Type**, choose **Request Data Steward Review**.
3. Add a note for the reviewer, for example `First version of the orders contract.`
4. Select **Send Request**.

The contract status changes to **Proposed**, and the bell shows that your request was
received.

## Step 5: get it approved

In the standard setup, a data steward is asked to review the request. A reviewer with
approval rights for contracts (by default Data Steward, Data Governance Officer or Admin)
opens the contract and selects **Approve**, or **Reject** to send it back to Draft.

Once approved, the status is **Approved**. To make it **Active**, use **Request...** and
choose **Change Status** (or **Request Status Change** if you need approval), then pick
**Active**.

## Check your work

- **Build → Data Contracts → Explorer** lists Customer Orders Contract with its status.
- The contract page shows **Schemas (1)** with the `orders` schema and its three columns.
- An approved or active contract can be used in a data product. Continue with
  [Walkthrough: publish a data product](/help/walkthrough-publish-a-data-product).
