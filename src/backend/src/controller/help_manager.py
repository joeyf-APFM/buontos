from pathlib import Path
from typing import List, Optional

from src.common.logging import get_logger
from src.common.search_config_loader import get_search_config_loader
from src.common.search_interfaces import SearchableAsset, SearchIndexItem
from src.controller.search_scoring import score_and_rank
from src.help.article_loader import HelpArticle, load_articles
from src.help.plain_text import markdown_to_plain, truncate_plain
from src.models.help import HelpArticleRead, HelpArticleSummary, HelpSectionRead

logger = get_logger(__name__)

DEFAULT_CONTENT_DIR = Path(__file__).parent.parent / "help" / "content"
EXCERPT_MAX_CHARS = 200


def _plain_excerpt(markdown: str, max_chars: int = EXCERPT_MAX_CHARS) -> str:
    """Strip markdown to plain text and truncate to max_chars."""
    return truncate_plain(markdown_to_plain(markdown), max_chars)


def resolve_help_extra_files(settings_manager) -> Optional[dict[str, Path]]:
    """Locate the User Guide via the docs registry; never raises (help must not break startup)."""
    try:
        guide = settings_manager.get_available_docs().get("user-guide")
        return {"user-guide": Path(guide["path"])} if guide else None
    except Exception:
        logger.warning("Could not resolve the User Guide for the help index", exc_info=True)
        return None


class HelpManager(SearchableAsset):
    """Serves help articles and indexes each section for global search."""

    def __init__(
        self,
        content_dir: Optional[Path] = None,
        extra_files: Optional[dict[str, Path]] = None,
    ):
        self._articles: List[HelpArticle] = load_articles(
            content_dir or DEFAULT_CONTENT_DIR, extra_files
        )
        self._by_slug = {a.slug: a for a in self._articles}
        self._index_items: List[SearchIndexItem] = self._build_index_items()
        logger.debug("HelpManager initialized with %d articles.", len(self._articles))

    def list_articles(self) -> List[HelpArticleSummary]:
        return [
            HelpArticleSummary(
                slug=a.slug, title=a.title, summary=a.summary, tags=a.tags,
                roles=a.roles, order=a.order, topic=a.topic, route=a.route,
            )
            for a in self._articles
        ]

    def get_article(self, slug: str) -> Optional[HelpArticleRead]:
        a = self._by_slug.get(slug)
        if a is None:
            return None
        return HelpArticleRead(
            slug=a.slug, title=a.title, summary=a.summary, tags=a.tags,
            roles=a.roles, order=a.order, topic=a.topic, route=a.route,
            body=a.body,
            sections=[HelpSectionRead(anchor=s.anchor, heading=s.heading) for s in a.sections],
        )

    def get_search_index_items(self) -> List[SearchIndexItem]:
        return list(self._index_items)

    def _build_index_items(self) -> List[SearchIndexItem]:
        items: List[SearchIndexItem] = []
        for a in self._articles:
            for s in a.sections:
                title = a.title if s.anchor == "overview" else f"{a.title} — {s.heading}"
                items.append(
                    SearchIndexItem(
                        id=f"help::{a.slug}#{s.anchor}",
                        type="help",
                        feature_id="help",
                        title=title,
                        description=_plain_excerpt(s.body),
                        link=f"/help/{a.slug}#{s.anchor}",
                        tags=list(a.tags),
                        extra_data={
                            "article_slug": a.slug,
                            "anchor": s.anchor,
                            "topic": a.topic,
                            "roles": list(a.roles),
                        },
                    )
                )
        return items

    def search(self, query: str, limit: int = 20) -> List[SearchIndexItem]:
        if not query or not query.strip():
            return []
        config = get_search_config_loader().load()
        scored = score_and_rank(self._index_items, query, config)
        return [s.item for s in scored[:limit]]
