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
