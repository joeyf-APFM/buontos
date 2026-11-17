---
title: Roles and permissions
summary: The six built-in roles, what each one can see and change in every area of Nucleus, and how people are given a role.
tags: [roles, permissions, access, rbac, admin, data consumer, data producer, data steward, governance officer, security officer]
topic: Access
order: 10
---
What you can see and do in Nucleus depends on your **app role**. This page lists the
roles a new Nucleus installation starts with and what each one can do.

## How you get a role

A role is given to people in one of two ways:

- **By directory group.** A role lists one or more directory groups. Everyone in those
  groups holds the role.
- **By name.** A role can also list individual users.

Which groups and users hold which role is **set per deployment by a Nucleus admin**, under
**Settings → Roles** (in the side menu: **Organization → Roles → App roles**). Nucleus has no
fixed list of groups, so ask your admin which role fits your work. If you hold more than
one role, you get the highest level each role gives you.

To see your current role, open your user menu (top right) and look at **Role:**. To ask
for a role, see [Requesting access](/help/requesting-access).

## The built-in roles

| Role | Typical person |
|---|---|
| **Admin** | Runs Nucleus: settings, roles, workflows. Can do everything. |
| **Data Governance Officer** | Owns data governance: approves domains, contracts, products and business terms. |
| **Data Steward** | Looks after data quality and meaning; reviews contracts and products. |
| **Data Producer** | Builds data: writes contracts, creates and publishes products. |
| **Data Consumer** | Uses data: browses the catalog and Marketplace, reads contracts. |
| **Security Officer** | Manages security features and entitlements; works on compliance. |

These are defaults. Your admins can change what any role can do or add new roles, so your
deployment may differ from the tables below.

## What the access levels mean

- **View**: you can open and read it, but not change it.
- **Edit**: you can create and change items.
- **Full** / **Manage**: everything Edit allows, plus administrative actions such as
  deleting items or managing the area's settings. (Approving is a separate right; see
  [Approval rights](/help/roles-and-permissions#approval-rights) below.)
- **No access** (shown as a dash): the area is hidden from you.

## What each role can do

Default levels for a new installation. **Admin** has Manage on every area, so it has no
column of its own.

| Area | Gov. Officer | Steward | Producer | Consumer | Security Officer |
|---|---|---|---|---|---|
| Marketplace and products | Manage | Edit | Edit | View | — |
| Data Contracts | Manage | Edit | Edit | View | — |
| Data Catalog | Manage | Edit | View | View | — |
| Domains | Manage | Edit | View | View | — |
| Teams | View | View | Edit | View | — |
| Projects | View | View | Edit | View | — |
| Catalog Commander | Full | View | View | View | — |
| Access grants (requesting access to data) | Manage | Edit | Edit | View | Manage |
| Comments and ratings | Edit | Edit | Edit | Edit | Edit |
| Workflow status | View | View | View | View | View |
| Compliance | Manage | View | — | — | Edit |
| Asset Reviews | Manage | Edit | — | — | View |
| Master Data Management | Manage | — | — | — | — |
| Estate Manager | Manage | — | — | — | — |
| Security Features | Manage | — | — | — | Manage |
| Entitlements and Entitlements Sync | Manage | — | — | — | Manage |
| Assets | — | — | — | — | — |
| Concepts and Term Mapping | — | — | — | — | — |
| Settings area (roles, tags, jobs, audit log, configuration) | — | — | — | — | — |

Areas with a dash for every role (Assets, Concepts, Settings) are open only to **Admin**
by default. So are areas not in the table, such as Schema Importer, Business Owners,
Business Roles and Entity Relationships. An admin can grant any of them to other roles.

## Domains, teams and projects live in Settings

The **Domains**, **Teams** and **Projects** pages sit in the Settings area of the app. A
role needs access to the Settings area to open them, and by default only **Admin** has it.

So, by default, a Data Producer has Edit on teams and projects but does not see the
**Organization** pages in the side menu. Ask a Nucleus admin to create a domain, team or
project for you, or to give your role access to the Settings area. Roles with View or
better still see domains, teams and projects where they are used, for example in the
**Owner Team** and **Domains** fields of a contract or product.

## Approval rights

Some roles may approve changes. By default:

| Role | May approve |
|---|---|
| Admin | Domains, contracts, products, business terms, asset reviews |
| Data Governance Officer | Domains, contracts, products, business terms, asset reviews |
| Data Steward | Contracts, products, asset reviews |

Data Producer, Data Consumer and Security Officer have no approval rights by default.
Who is asked to decide a given request also depends on the workflows your admins set up.

## Which roles you can request

Each role lists who may request it. The defaults step up one role at a time:

| You have | You can request |
|---|---|
| No role | Data Consumer |
| Data Consumer | Data Producer |
| Data Producer | Data Steward |
| Data Steward | Data Governance Officer, Security Officer |
| Data Governance Officer | Admin |

In the standard setup, requests go to **Admin** for approval. Admins change these rules
in **Settings → Roles**, on a role's **Access Control** tab. The in-app request button is
on Home and appears only while you have no role; with a role, ask a Nucleus admin. See
[Requesting access](/help/requesting-access).

## Help is open to everyone

Every signed-in user can read and search these help articles, including people with no
role.
