---
title: Business glossary and semantic links
summary: How Nucleus keeps your organisation's business terms as concepts, and how linking them to contracts and products helps people find data by meaning.
tags: [glossary, business glossary, concept, business term, semantic link, ontology, term mapping, concept scheme]
topic: Working with data
order: 23
route: /concepts
---
Your organisation's business vocabulary, such as "Customer", "Order" or "Net Revenue",
lives in Nucleus as **concepts**. Linking a concept to a contract, a schema, a column or a
product is called a **semantic link**. Links let people find data by what it means, not
only by its table name.

## Concepts and concept schemes

A **concept** is one business term with a definition. Concepts are grouped into **concept
schemes** (shown as **Collections**), for example one scheme per business area. Concepts
can have broader and narrower concepts, so "Customer" can sit above "Retail Customer".

Your admins can load existing vocabularies from RDF files under **Semantics → Semantic
models** in the side menu.

## Browsing concepts

Open **Build → Concepts** in the side menu. Its pages are:

- **Define**: create concepts (**Author Concepts**), generate an ontology, or import RDF.
- **Explore**: browse concepts as a list, a tree or a graph.
- **Search**: find concepts by name.
- **Hierarchy Browser**: walk the broader and narrower terms.
- **Enrich** and **Term Mapping**: connect concepts to your data assets.
- **Collections**: the concept schemes.

By default only **Admin** can open the Concepts pages. Your admins can give other roles
access (the **Concept Browser** and **Term Mapping** permissions in **Settings → Roles**).
See [Roles and permissions](/help/roles-and-permissions#what-each-role-can-do).

## Seeing which concepts data is linked to

Contract and product pages show **Linked Business Concepts** next to their other details.
Anyone who can open the contract or product can see these links. Contract schemas can also
carry links, under **Business Concepts** in a schema's dialog.

## Linking a concept to a contract or product

You need Edit rights on contracts or products **and** Edit rights on **Concept Browser**
(by default only Admin has the second).

1. Open the contract or product.
2. Next to **Linked Business Concepts**, select **Add**.
3. In **Select Business Concept**, type part of the term, for example "customer".
4. Select **Select** next to the right concept.

To remove a link, use the remove control on the linked concept.

## Why links matter

- **Find by meaning.** A concept's page can list the contracts and products linked to it,
  whatever their tables are called.
- **Shared language.** Producers and consumers use the same definition of a term.
- **Review.** Reviewers can check that a contract says what it claims to be about.

See [How Nucleus is organised](/help/how-nucleus-is-organised) for how concepts fit with
the other building blocks.
