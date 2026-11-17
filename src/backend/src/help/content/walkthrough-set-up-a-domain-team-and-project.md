---
title: "Walkthrough: set up a domain, team and project"
summary: Step by step, create a Sales domain with a Sales Analytics sub-domain, a Sales Data Team, and a Customer 360 project.
tags: [walkthrough, tutorial, domain, team, project, setup, example]
topic: Walkthroughs
order: 30
route: /settings/data-domains
roles: [Admin]
---
This walkthrough sets up the ownership structure for a sales area. At the end you have:

- a domain **Sales** with a sub-domain **Sales Analytics**,
- a team **Sales Data Team** that works in Sales Analytics,
- a project **Customer 360** that the team works on.

It takes about ten minutes.

## Before you start

The Domains, Teams and Projects pages are in the Settings area. By default only **Admin**
can open them. If you do not see **Organization** in the side menu, ask a Nucleus admin to
do these steps, or to give your role access. See
[Domains, teams and projects](/help/domains-teams-and-projects#where-to-find-these-pages).

## Step 1: create the Sales domain

1. In the side menu, open **Organization → Data domains**.
2. Select **Add New Domain**. The **Create New Data Domain** dialog opens.
3. Fill in:
   - **Name**: `Sales`
   - **Description**: `Everything about selling to our customers.`
   - **Parent Domain**: leave it as **No Parent**.
4. Select **Create Domain**.

Sales now appears in the domains list.

## Step 2: create the Sales Analytics sub-domain

1. Select **Add New Domain** again.
2. Fill in:
   - **Name**: `Sales Analytics`
   - **Description**: `Reporting and analysis of sales performance.`
   - **Parent Domain**: `Sales`
3. Select **Create Domain**.

The list now shows Sales Analytics under Sales.

## Step 3: create the team

1. Open **Organization → Teams** and select **Add New Team**. The **Create New Team** dialog
   opens.
2. Under **Team Information**, fill in:
   - **Team Name**: `sales-data-team`
   - **Display Title**: `Sales Data Team`
   - **Description**: `Builds and looks after sales data.`
   - **Data Domain**: `Sales Analytics`
3. Under **Team Members**, select **Add Member**. Set **Type** to **User**, enter your own
   email address under **Email / Group Name**, and leave **Role Override** as **No
   override**. Add more members the same way, or choose **Group** to add a whole directory
   group.
4. Select **Create Team**.

## Step 4: create the project

1. Open **Organization → Projects** and select **Add New Project**. The **Create New
   Project** dialog opens.
2. Fill in:
   - **Project Name**: `customer-360`
   - **Display Title**: `Customer 360`
   - **Description**: `A single view of each customer across sales channels.`
   - **Project Type**: **TEAM**
   - **Assign Teams**: `Sales Data Team`
3. Select **Create Project**.

## Check your work

- The domains list shows **Sales** with **Sales Analytics** below it.
- The teams list shows **Sales Data Team** with its members.
- The projects list shows **Customer 360** with Sales Data Team assigned.
- Members of the team can now pick **Customer 360** in the **Project** field when they
  create a contract or product.

## Next steps

- Describe a dataset: [Walkthrough: create a data contract](/help/walkthrough-create-a-data-contract).
- Offer it to others: [Walkthrough: publish a data product](/help/walkthrough-publish-a-data-product).
