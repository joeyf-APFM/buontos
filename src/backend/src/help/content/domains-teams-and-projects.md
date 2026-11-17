---
title: Domains, teams and projects
summary: How Nucleus groups data by business area (domains), people (teams) and shared work (projects), and who can set them up.
tags: [domain, data domain, team, team members, project, organisation, ownership, project context]
topic: Working with data
order: 22
route: /settings/data-domains
---
Domains, teams and projects describe **who** owns data and **where** it belongs. Contracts
and products point to them through their **Owner Team**, **Project** and **Domains** fields.

## Domains

A **domain** is a business area that owns data, such as Sales or Finance. Domains form a
tree: a domain can have a **Parent Domain**, so "Sales Analytics" can sit inside "Sales".

A domain has a **Name**, an optional **Description**, **Tags**, and an optional **Parent
Domain**. The domains list shows each domain's parent and children.

## Teams

A **team** is a group of people who do the work, such as "Sales Data Team". A team has:

- a **Team Name** and an optional **Display Title** and **Description**,
- one or more domains it works in (**Data Domain**),
- **Team Members**. Each member is either a **User** (an email address) or a **Group** (a
  directory group name). A member can have a **Role Override**: an app role that replaces
  the member's own role when Nucleus checks what they may do, so it can raise or lower
  their access. Admins should set it with care. Leave it as **No override** unless the
  member needs different access.

Teams appear as the **Owner Team** of contracts and products.

## Projects

A **project** is a piece of shared work, such as "Customer 360". A project has a **Project
Name**, an optional **Display Title** and **Description**, a **Project Type** (**TEAM** for
shared work, **PERSONAL** for one person) and the teams assigned to it (**Assign Teams**).

When you create a contract or product, the **Project** field only offers projects you are a
member of.

The project menu in the top bar sets your **Project Context**, or **All Projects** for no
filter. It also lists projects you are not in under **Request access to**, with a **Join**
button that sends a request to join.

## Where to find these pages

In the side menu, open **Organization**: it holds **Data domains**, **Teams** and
**Projects**. The pages are at `/settings/data-domains`, `/settings/teams` and
`/settings/projects`.

These pages are part of the Settings area. By default, only **Admin** can open them, even
though some roles have Edit rights on teams or projects. If you need a domain, team or
project created, ask a Nucleus admin. See
[Roles and permissions](/help/roles-and-permissions#domains-teams-and-projects-live-in-settings).

## Setting them up

The order that works best is: create the **domain** first, then the **team** (linked to the
domain), then the **project** (with the team assigned). Contracts and products created
afterwards can point to all three.

For the full steps with example values, follow
[Walkthrough: set up a domain, team and project](/help/walkthrough-set-up-a-domain-team-and-project).
