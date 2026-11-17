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
    assert article.summary == "x" * 200


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
