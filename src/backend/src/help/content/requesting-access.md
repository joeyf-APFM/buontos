---
title: Requesting access
summary: How to ask for a role in Nucleus, what happens after you ask, and what to do if nothing changes.
tags: [access, request access, role request, no role, permissions, get started, approval]
topic: Access
order: 11
route: /
---
If you can sign in but see almost nothing, you do not have a role yet. This page shows how
to ask for one. For what each role allows, see
[Roles and permissions](/help/roles-and-permissions).

## Check whether you have a role

1. Open your user menu (your name, top right).
2. Look at the line that starts with **Role:**.
3. If Home shows a **Roles** section with **Available Roles**, you have no role yet.

## Ask for a role in the app

You can send a role request from **Home** when you have no role:

1. Go to **Home**.
2. In the **Roles** section, find the role you need under **Available Roles**. In the
   standard setup, a new user can request **Data Consumer**.
3. Select **Request Access** on that role.
4. In the **Request Role Access** dialog, fill in **Reason for Role Access Request**. Say
   what you need to do, for example: "I analyse sales data and need to read the Customer
   Orders contracts." It must be at least 10 characters.
5. Select **Send Request**.

The bell in the top bar shows a **Request Submitted** notification. The request goes to the
admins who approve role requests (in the standard setup, **Admin**).

If Home says "Please contact an administrator to request access to the application",
no role is open to request. Ask a Nucleus admin directly.

## What happens after you ask

An admin sees **Approval Required** in their notifications, opens it with **Approve/Deny**,
and chooses **Approve** or **Reject**. You get a notification with the decision:
**Request Approved** or **Request Denied**.

In the standard setup, approval does **not** give you the role by itself. The approval
message asks you to contact an administrator to be added to the right group. Until an
admin adds you to the role, your access does not change.

So after an approval:

1. Reply to the admin who approved, or ask a Nucleus admin, to add you to the role.
2. Once added, reload the page. Your user menu shows the new **Role:**.

## How an admin adds you to a role

For admins, under **Settings → Roles** (side menu: **Organization → Roles → App roles**):

1. Find the role and select its **Edit Role** button (the pencil).
2. On the **General** tab, either add a directory group the person belongs to under
   **Assigned Directory Groups (comma-separated)**, or add the person under
   **Assigned Users**.
3. Select **Update Role**.

Adding a group gives the role to everyone in that group, so use a group when several
people need the same access.

## Asking for a higher role later

The **Roles** section on Home appears only while you have no role. Once you have one, ask a
Nucleus admin for a higher role, and say what you need to do. Your admins decide which
roles each role may step up to; see
[Which roles you can request](/help/roles-and-permissions#which-roles-you-can-request).

## Access to a single product or contract

A role controls which parts of the app you can use. Access to a specific data product or
contract is a separate request:

1. Open the product or contract.
2. Select **Request...**.
3. Under **Request Type**, choose **Request Access** (on a contract it is called
   **Request Access to Contract**) and give a reason.

## If nothing happens

- No notification after sending: check the bell, then ask a Nucleus admin.
- Approved but no new access: an admin still has to add you to the role (see above).
- Not sure which role you need: ask a Nucleus admin, and describe the work you want to do.
