from pathlib import Path

import pytest

from src.help.article_loader import load_articles, parse_article, slugify_heading


def test_slugify_heading_vectors():
    assert slugify_heading("Working with Domains") == "working-with-domains"
    assert slugify_heading("What's a data product?") == "whats-a-data-product"
    assert slugify_heading("A  --  B") == "a-b"


def test_parse_splits_on_h2_with_overview_first():
    text = "---\ntitle: Guide\n---\nIntro text.\n\n## First\nOne.\n\n## Second\nTwo.\n"
    article = parse_article("guide", text)
    assert [s.anchor for s in article.sections] == ["overview", "first", "second"]
    assert article.sections[0].heading == "Guide"
    assert "Intro text." in article.sections[0].body
    assert article.sections[1].heading == "First"
    assert "One." in article.sections[1].body


def test_duplicate_headings_get_numeric_suffix():
    text = "---\ntitle: T\n---\n## Setup\na\n\n## Setup\nb\n"
    article = parse_article("t", text)
    assert [s.anchor for s in article.sections if s.anchor != "overview"] == ["setup", "setup-2"]


def test_headings_in_fenced_code_blocks_are_ignored():
    text = "---\ntitle: T\n---\n```\n## Not a section\n# Neither\n```\n\n~~~\n## Also not\n~~~\n"
    article = parse_article("t", text)
    assert [s.anchor for s in article.sections] == ["overview"]


def test_front_matter_defaults():
    long_para = "x" * 300
    text = f"---\ntitle: T\n---\n{long_para}\n\nSecond paragraph.\n"
    article = parse_article("t", text)
    assert article.topic == "General"
    assert article.order == 100
    assert article.tags == []
    assert article.roles == []
    assert article.route is None
    assert article.summary == "x" * 199 + "…"


def test_missing_title_falls_back_to_first_h1_then_raises():
    article = parse_article("t", "# My Heading\n\nBody.\n")
    assert article.title == "My Heading"
    with pytest.raises(ValueError):
        parse_article("t", "Just body, no title.\n")


def test_load_articles_skips_bad_files_and_keeps_good(tmp_path: Path):
    (tmp_path / "good.md").write_text("---\ntitle: Good\n---\nBody\n")
    (tmp_path / "bad.md").write_text("---\n: : bad\n---\nBody\n")
    (tmp_path / "notitle.md").write_text("No title here\n")
    articles = load_articles(tmp_path)
    assert [a.slug for a in articles] == ["good"]


def test_load_articles_duplicate_slug_first_wins(tmp_path: Path):
    (tmp_path / "a.md").write_text("---\ntitle: From content\n---\nBody\n")
    extra = tmp_path / "elsewhere" / "x.md"
    extra.parent.mkdir()
    extra.write_text("---\ntitle: From extra\n---\nBody\n")
    articles = load_articles(tmp_path, extra_files={"a": extra})
    assert [(a.slug, a.title) for a in articles] == [("a", "From content")]


def test_load_articles_extra_files_loaded_under_slug(tmp_path: Path):
    extra = tmp_path / "other.md"
    extra.write_text("---\ntitle: Extra\n---\nBody\n")
    content = tmp_path / "content"
    content.mkdir()
    articles = load_articles(content, extra_files={"my-slug": extra})
    assert [a.slug for a in articles] == ["my-slug"]


def test_load_articles_sorted_by_order_then_title(tmp_path: Path):
    (tmp_path / "a.md").write_text("---\ntitle: Zed\norder: 1\n---\nB\n")
    (tmp_path / "b.md").write_text("---\ntitle: Beta\norder: 2\n---\nB\n")
    (tmp_path / "c.md").write_text("---\ntitle: Alpha\norder: 2\n---\nB\n")
    articles = load_articles(tmp_path)
    assert [a.title for a in articles] == ["Zed", "Alpha", "Beta"]


def test_load_articles_missing_dir_returns_empty(tmp_path: Path):
    assert load_articles(tmp_path / "nope") == []


def test_file_without_front_matter_gets_title_from_h1_and_defaults(tmp_path: Path):
    guide = tmp_path / "GUIDE.md"
    guide.write_text("# Nucleus User Guide\n\nWelcome.\n\n## Intro\nText.\n", encoding="utf-8")
    articles = load_articles(tmp_path / "none", extra_files={"user-guide": guide})
    a = articles[0]
    assert (a.slug, a.title, a.topic, a.order) == ("user-guide", "Nucleus User Guide", "Reference", 900)
    assert a.summary == "Welcome."


def test_extra_file_front_matter_overrides_defaults(tmp_path: Path):
    guide = tmp_path / "G.md"
    guide.write_text("---\ntitle: G\ntopic: Basics\norder: 5\n---\nBody\n", encoding="utf-8")
    a = load_articles(tmp_path / "none", extra_files={"g": guide})[0]
    assert (a.topic, a.order) == ("Basics", 5)


def test_table_of_contents_section_is_not_indexed():
    text = "---\ntitle: T\n---\n## Table of Contents\n1. x\n\n## Real\nBody\n"
    article = parse_article("t", text)
    assert [s.anchor for s in article.sections] == ["overview", "real"]


def test_user_guide_fenced_hash_lines_not_sections():
    text = "# Guide\n\n## Search\n```\n# Search for data products\n```\n"
    article = parse_article("g", text)
    assert [s.heading for s in article.sections] == ["Guide", "Search"]


def test_duplicate_anchor_collision_gets_unique_ids():
    text = "---\ntitle: T\n---\n## Setup\na\n\n## Setup\nb\n\n## Setup 2\nc\n"
    anchors = [s.anchor for s in parse_article("t", text).sections]
    assert len(anchors) == len(set(anchors))
    assert anchors == ["overview", "setup", "setup-2", "setup-2-2"]


def test_utf8_bom_front_matter_is_honoured(tmp_path: Path):
    (tmp_path / "bom.md").write_bytes(b"\xef\xbb\xbf---\ntitle: Bom Title\norder: 3\n---\nBody\n")
    a = load_articles(tmp_path)[0]
    assert (a.title, a.order) == ("Bom Title", 3)


@pytest.mark.parametrize(
    "text",
    [
        "---\ntitle: T\nno closing fence\n",
        "---\n- a\n- b\n---\nBody\n",
        "---\ntitle: T\norder: abc\n---\nBody\n",
    ],
    ids=["unterminated", "non-mapping", "non-integer-order"],
)
def test_bad_front_matter_skipped_without_affecting_others(tmp_path: Path, text: str):
    (tmp_path / "bad.md").write_text(text, encoding="utf-8")
    (tmp_path / "good.md").write_text("---\ntitle: Good\n---\nBody\n", encoding="utf-8")
    assert [a.slug for a in load_articles(tmp_path)] == ["good"]


def test_extra_file_with_missing_path_is_skipped(tmp_path: Path):
    (tmp_path / "good.md").write_text("---\ntitle: Good\n---\nBody\n", encoding="utf-8")
    articles = load_articles(tmp_path, extra_files={"gone": tmp_path / "missing.md"})
    assert [a.slug for a in articles] == ["good"]


GUIDE_SHAPED = (
    "# Guide\n\n## Table of Contents\n\n1. [Intro](#intro)\n2. [Next](#next)\n\n---\n\n"
    "## Introduction\n\n```\nnot prose\n```\n\nWelcome to the guide. It explains things.\n\nSecond para.\n"
)


def test_summary_skips_toc_and_takes_first_prose_paragraph():
    assert parse_article("g", GUIDE_SHAPED).summary == "Welcome to the guide. It explains things."


def test_summary_empty_when_only_non_prose_blocks():
    text = "# T\n\n- a\n- b\n\n| x | y |\n|---|---|\n\n> quote\n\n```\ncode\n```\n"
    assert parse_article("t", text).summary == ""


def test_front_matter_summary_wins_over_prose():
    text = "---\ntitle: T\nsummary: Explicit.\n---\nSome prose.\n"
    assert parse_article("t", text).summary == "Explicit."


def _extra(tmp_path: Path, text: str):
    f = tmp_path / "G.md"
    f.write_text(text, encoding="utf-8")
    return load_articles(tmp_path / "none", extra_files={"g": f})[0]


ROLES_GUIDE = "# G\n\nIntro.\n\n## Setup\nA.\n\n## {h}\nOutdated.\n\n## After\nB.\n"


@pytest.mark.parametrize(
    "heading",
    ["User Roles and Permissions", "User Roles And Permissions", "  user   roles and permissions  ", "User Roles and Permissions   "],
)
def test_extra_file_skips_user_roles_and_permissions_section(tmp_path: Path, heading: str):
    a = _extra(tmp_path, ROLES_GUIDE.format(h=heading))
    assert [s.anchor for s in a.sections] == ["overview", "setup", "after"]
    assert "Outdated." not in " ".join(s.body for s in a.sections)


def test_content_dir_article_with_roles_section_is_indexed(tmp_path: Path):
    (tmp_path / "r.md").write_text("---\ntitle: R\n---\n" + ROLES_GUIDE.format(h="User Roles and Permissions"), encoding="utf-8")
    a = load_articles(tmp_path)[0]
    assert [s.anchor for s in a.sections] == ["overview", "setup", "user-roles-and-permissions", "after"]


def test_fallback_summary_is_plain_text():
    text = "# T\n\n**Nucleus** is a [great](http://x) tool with `code` inside.\n"
    assert parse_article("t", text).summary == "Nucleus is a great tool with code inside."


def test_fallback_summary_cut_on_word_boundary():
    text = "# T\n\n" + " ".join(["wordy"] * 100) + "\n"
    s = parse_article("t", text).summary
    assert len(s) <= 200 and s.endswith("…")
    assert set(s[:-1].split()) == {"wordy"}


def test_short_fallback_summary_unchanged():
    assert parse_article("t", "# T\n\nShort one.\n").summary == "Short one."


def test_front_matter_summary_not_altered():
    text = "---\ntitle: T\nsummary: '**Keep** this ' \n---\nBody.\n"
    assert parse_article("t", text).summary == "**Keep** this"
