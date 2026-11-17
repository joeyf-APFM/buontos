from pathlib import Path

import pytest

from src.controller.help_manager import HelpManager

ALPHA = """---
title: Alpha Guide
summary: About alpha.
tags: [alpha]
roles: [Admin]
order: 2
topic: Basics
route: /alpha
---
Intro to alpha.

## Zebra Care
Feeding **zebras** requires patience. See [the docs](http://x.y) and `code`.

```python
secret_fence_word = 1
```
"""

BETA = """---
title: Beta Guide
order: 1
---
Beta intro.

## Giraffe
Tall animals.
"""


@pytest.fixture
def manager(tmp_path: Path) -> HelpManager:
    (tmp_path / "alpha.md").write_text(ALPHA, encoding="utf-8")
    (tmp_path / "beta.md").write_text(BETA, encoding="utf-8")
    return HelpManager(content_dir=tmp_path)


def test_index_items_have_section_level_ids_links_and_type(manager):
    items = {i.id: i for i in manager.get_search_index_items()}
    assert set(items) == {
        "help::alpha#overview", "help::alpha#zebra-care",
        "help::beta#overview", "help::beta#giraffe",
    }
    item = items["help::alpha#zebra-care"]
    assert item.type == "help"
    assert item.feature_id == "help"
    assert item.link == "/help/alpha#zebra-care"
    assert item.tags == ["alpha"]
    assert item.extra_data == {
        "article_slug": "alpha", "anchor": "zebra-care", "topic": "Basics", "roles": ["Admin"],
    }


def test_overview_item_title_is_article_title_other_items_include_heading(manager):
    items = {i.id: i for i in manager.get_search_index_items()}
    assert items["help::alpha#overview"].title == "Alpha Guide"
    assert items["help::alpha#zebra-care"].title == "Alpha Guide — Zebra Care"


def test_search_finds_section_by_body_word_and_ranks_title_matches_first(manager):
    results = manager.search("zebras")
    assert results and results[0].id == "help::alpha#zebra-care"
    ranked = manager.search("giraffe")
    assert ranked[0].id == "help::beta#giraffe"


def test_search_empty_and_whitespace_return_empty(manager):
    assert manager.search("") == []
    assert manager.search("   ") == []


def test_get_article_returns_body_and_section_list_or_none(manager):
    article = manager.get_article("alpha")
    assert article is not None
    assert "Intro to alpha." in article.body
    assert [(s.anchor, s.heading) for s in article.sections] == [
        ("overview", "Alpha Guide"), ("zebra-care", "Zebra Care"),
    ]
    assert manager.get_article("missing") is None


def test_list_articles_sorted_and_summary_only(manager):
    summaries = manager.list_articles()
    assert [s.slug for s in summaries] == ["beta", "alpha"]
    assert summaries[1].route == "/alpha"
    assert summaries[1].topic == "Basics"
    assert not hasattr(summaries[1], "body")


def test_description_is_plain_text_excerpt_max_200(manager, tmp_path):
    item = next(i for i in manager.get_search_index_items() if i.id == "help::alpha#zebra-care")
    assert "**" not in item.description
    assert "http" not in item.description
    assert "`" not in item.description
    assert "secret_fence_word" not in item.description
    assert "zebras" in item.description and "the docs" in item.description

    (tmp_path / "long.md").write_text("# Long\n\n" + ("word " * 200), encoding="utf-8")
    long_items = [i for i in HelpManager(content_dir=tmp_path).get_search_index_items()
                  if i.id == "help::long#overview"]
    assert len(long_items[0].description) <= 200
