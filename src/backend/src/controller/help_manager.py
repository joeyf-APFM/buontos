import re
from pathlib import Path
from typing import List, Optional

from src.common.logging import get_logger
from src.common.search_config_loader import get_search_config_loader
from src.common.search_interfaces import SearchableAsset, SearchIndexItem
from src.controller.search_scoring import score_and_rank
from src.help.article_loader import HelpArticle, load_articles
from src.models.help import HelpArticleRead, HelpArticleSummary, HelpSectionRead

logger = get_logger(__name__)

DEFAULT_CONTENT_DIR = Path(__file__).parent.parent / "help" / "content"
EXCERPT_MAX_CHARS = 200

_FENCE_RE = re.compile(r"^(```|~~~).*?^\1[^\n]*$", re.MULTILINE | re.DOTALL)
_IMAGE_RE = re.compile(r"!\[([^\]]*)\]\([^)]*\)")
_LINK_RE = re.compile(r"\[([^\]]*)\]\([^)]*\)")
_HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s+", re.MULTILINE)
_LIST_RE = re.compile(r"^\s*(?:[-*+]|\d+\.)\s+", re.MULTILINE)
_QUOTE_RE = re.compile(r"^\s*>\s?", re.MULTILINE)
_EMPHASIS_RE = re.compile(r"(\*\*|__|\*|_|~~|`)")


def _plain_excerpt(markdown: str, max_chars: int = EXCERPT_MAX_CHARS) -> str:
    """Strip markdown to plain text and truncate to max_chars."""
    text = _FENCE_RE.sub("", markdown)
    text = _IMAGE_RE.sub(r"\1", text)
    text = _LINK_RE.sub(r"\1", text)
    text = _HEADING_RE.sub("", text)
    text = _LIST_RE.sub("", text)
    text = _QUOTE_RE.sub("", text)
    text = _EMPHASIS_RE.sub("", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1].rstrip() + "…"


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
        scored = score_and_rank(self.get_search_index_items(), query, config)
        return [s.item for s in scored[:limit]]
