"""Integrity tests for the help articles shipped in src/help/content."""

import re

import pytest

from src.controller.help_manager import DEFAULT_CONTENT_DIR
from src.controller.settings_manager import DEFAULT_ROLES
from src.help.article_loader import _iter_unfenced, load_articles

CONTENT_DIR = DEFAULT_CONTENT_DIR

EXPECTED_SLUGS = {
    "getting-started",
    "how-nucleus-is-organised",
    "roles-and-permissions",
    "requesting-access",
    "data-products",
    "data-contracts",
    "domains-teams-and-projects",
    "glossary-and-semantic-links",
    "walkthrough-set-up-a-domain-team-and-project",
    "walkthrough-publish-a-data-product",
    "walkthrough-create-a-data-contract",
}

HTML_TAG = re.compile(r"</?[a-zA-Z][a-zA-Z0-9-]*(\s[^>]*)?/?>")
INLINE_CODE = re.compile(r"`[^`]*`")
HELP_LINK = re.compile(r"\]\(/help/([a-z0-9-]+)(?:#([a-z0-9-]+))?\)")


@pytest.fixture(scope="module")
def articles():
    return load_articles(CONTENT_DIR)


@pytest.fixture(scope="module")
def by_slug(articles):
    return {a.slug: a for a in articles}


def _md_files():
    return sorted(CONTENT_DIR.glob("*.md"))


def test_all_shipped_articles_parse_with_no_skips(articles):
    files = _md_files()
    assert {p.stem for p in files} >= EXPECTED_SLUGS
    assert len(articles) == len(files)


def test_slugs_unique_and_titles_nonempty(articles):
    slugs = [a.slug for a in articles]
    assert len(slugs) == len(set(slugs))
    for a in articles:
        assert a.title.strip(), a.slug
        assert a.summary.strip(), a.slug


def test_every_route_front_matter_starts_with_slash(articles):
    for a in articles:
        if a.route is not None:
            assert a.route.startswith("/"), (a.slug, a.route)


def test_no_raw_html_or_images():
    for path in _md_files():
        text = path.read_text(encoding="utf-8")
        assert "![" not in text, path.name
        for line, in_fence in _iter_unfenced(text):
            if in_fence:
                continue
            stripped = INLINE_CODE.sub("", line)
            assert not HTML_TAG.search(stripped), f"{path.name}: {line!r}"


def test_internal_help_links_resolve(by_slug):
    found = 0
    for path in _md_files():
        for slug, anchor in HELP_LINK.findall(path.read_text(encoding="utf-8")):
            found += 1
            assert slug in by_slug, f"{path.name}: unknown article /help/{slug}"
            if anchor:
                anchors = {s.anchor for s in by_slug[slug].sections}
                assert anchor in anchors, f"{path.name}: /help/{slug}#{anchor} not in {sorted(anchors)}"
    assert found > 0, "expected the articles to cross-link"


def test_no_links_to_unbuilt_user_guide_page():
    for path in _md_files():
        assert "/help/user-guide" not in path.read_text(encoding="utf-8"), path.name


def test_roles_article_mentions_every_default_role_name(by_slug):
    article = by_slug["roles-and-permissions"]
    for role in DEFAULT_ROLES:
        assert role["name"] in article.body, role["name"]


def test_roles_article_names_no_groups_or_contacts(by_slug):
    body = by_slug["roles-and-permissions"].body
    assert "@" not in body
    for role in DEFAULT_ROLES:
        for group in role.get("assigned_groups", []):
            assert group not in body, group
    assert "Settings" in body and "Roles" in body


def test_requesting_access_article_exists_and_has_steps(by_slug):
    article = by_slug["requesting-access"]
    numbered = [ln for ln in article.body.splitlines() if re.match(r"^\s*\d+\.\s", ln)]
    assert len(numbered) >= 3
    assert len(article.sections) >= 2
