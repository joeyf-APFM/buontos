---
title: "Walkthrough: publish a data product"
summary: Step by step, create a Customer Orders Daily product, give it a deliverable backed by a contract, take it through review to Active, and publish it to the Marketplace.
tags: [walkthrough, tutorial, data product, publish, marketplace, deliverable, review, example]
topic: Walkthroughs
order: 32
route: /data-products
roles: [Data Producer]
---
This walkthrough creates a product called **Customer Orders Daily** and publishes it so
other people can find it in the **Marketplace**.

## Before you start

- You need Edit rights on products. By default Data Producer, Data Steward, Data
  Governance Officer and Admin have them.
- You need an **Approved** or **Active** data contract for the deliverable. This walkthrough
  uses **Customer Orders Contract** from
  [Walkthrough: create a data contract](/help/walkthrough-create-a-data-contract).
- A team and project help. See
  [Walkthrough: set up a domain, team and project](/help/walkthrough-set-up-a-domain-team-and-project).

## Step 1: create the product

1. In the side menu, open **Build → Products → All products**.
2. Select **Create Product**. The **Create Data Product (ODPS v1.0.0)** dialog opens.
3. Fill in:
   - **Product Name**: `Customer Orders Daily`
   - **Version**: leave `0.0.1`
   - **Status**: leave **Draft**
   - **Product Type**: **Source Aligned**
   - **Owner Team**: `Sales Data Team`
   - **Project**: `Customer 360`
   - **Domains**: `Sales Analytics`
   - **Purpose**: `Daily list of customer orders for sales reporting.`
   - **Usage**: `Refresh dashboards after 06:00 each day.`
   - **Limitations**: `No payment card data.`
4. Select **Create Product**. The product page opens with status **Draft**.

## Step 2: add a deliverable with its contract

1. In the **Deliverables** section, select **Add Deliverable**. The **Add Deliverable**
   dialog opens.
2. Fill in:
   - **Name**: `orders_daily`
   - **Version**: `1.0.0`
   - **Description**: `One row per order, refreshed daily.`
3. Under **Contract Assignment**, choose **Select Existing Contract**, then pick
   **Customer Orders Contract**. Only approved, active or certified contracts are listed.
4. Select **Add Deliverable**.

## Step 3: send it for review

1. At the top of the product page, select **Request...**.
2. Under **Request Type**, choose **Request Review**.
3. Add a note for the reviewer, for example `Ready for review: daily orders for Sales.`
4. Select **Send Request**.

The product moves straight to **Under Review** (it passes through Proposed on the way). In
the standard setup, the request goes to the owners of the product's domain. Watch the bell
for the decision.

## Step 4: take it to Active

From **Under Review**, the product is moved on one status at a time. Open **Request...**,
choose **Change Status**, and pick the next step under **Target Status**:

1. **Approve**: the product becomes **Approved**. (**Reject (Return to Draft)** sends it
   back to Draft instead.)
2. **Publish/Activate**: the product becomes **Active**.

Depending on your setup, a reviewer may do these steps for you, or the dialog may offer
**Request Status Change** instead, which sends the change to an admin for approval.

Moving from Approved to **Active** runs checks in the standard setup: the product must have
at least one deliverable with a contract, and the domain's owners are asked to approve. If
a check fails, you are told why.

## Step 5: publish to the Marketplace

1. When the product is **Active**, select **Publish** at the top of the product page. The
   **Set publication scope** dialog opens.
2. Under **Publication scope**, choose **Organization** so everyone in your organisation can
   find it. (**Domain** limits it to the domain; **External** is for outside use.)
3. Select **Confirm**.

Publishing fails if any deliverable's contract is not Approved or Active.

## Check your work

- **Discover → Marketplace** lists **Customer Orders Daily**.
- The product page shows status **Active** and its publication scope.
- Other people can now open it, select **Subscribe**, and use **Request...** →
  **Request Access** to ask for the data. See [Data products](/help/data-products).
