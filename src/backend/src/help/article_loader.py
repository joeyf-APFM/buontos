"""Load markdown help articles with YAML front matter and split them into sections."""

import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from src.common.logging import get_logger

logger = get_logger(__name__)

SUMMARY_MAX_CHARS = 200
DEFAULT_TOPIC = "General"
DEFAULT_ORDER = 100


@dataclass
class HelpSection:
    anchor: str
    heading: str
    body: str


@dataclass
class HelpArticle:
    slug: str
    title: str
    summary: str
    tags: list[str] = field(default_factory=list)
    roles: list[str] = field(default_factory=list)
    order: int = DEFAULT_ORDER
    topic: str = DEFAULT_TOPIC
    route: str | None = None
    body: str = ""
    sections: list[HelpSection] = field(default_factory=list)


def slugify_heading(text: str) -> str:
    text = re.sub(r"[^a-z0-9\s-]", "", text.lower()).strip()
    text = re.sub(r"\s+", "-", text)
    return re.sub(r"-+", "-", text)


def _split_front_matter(text: str) -> tuple[dict, str]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, text
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            try:
                meta = yaml.safe_load("\n".join(lines[1:i]))
            except yaml.YAMLError as e:
                raise ValueError(f"invalid front matter: {e}") from e
            if meta is None:
                meta = {}
            if not isinstance(meta, dict):
                raise ValueError("front matter must be a mapping")
            return meta, "\n".join(lines[i + 1:])
    raise ValueError("unterminated front matter")


def _iter_unfenced(body: str):
    """Yield (line, in_fence) for each line of body."""
    fence: str | None = None
    for line in body.splitlines():
        stripped = line.lstrip()
        marker = stripped[:3] if stripped[:3] in ("```", "~~~") else None
        if fence is None:
            if marker:
                fence = marker
                yield line, True
                continue
            yield line, False
        else:
            if marker == fence:
                fence = None
            yield line, True


def _first_h1(body: str) -> str | None:
    for line, in_fence in _iter_unfenced(body):
        if not in_fence and line.startswith("# "):
            return line[2:].strip() or None
    return None


def _first_paragraph(body: str) -> str:
    for para in re.split(r"\n\s*\n", body.strip()):
        lines = [ln for ln in para.splitlines() if not ln.lstrip().startswith("#")]
        candidate = " ".join(ln.strip() for ln in lines).strip()
        if candidate:
            return candidate
    return ""


def _split_sections(title: str, body: str) -> list[HelpSection]:
    sections: list[HelpSection] = []
    used: dict[str, int] = {"overview": 1}
    heading, anchor = title, "overview"
    buf: list[str] = []

    def flush() -> None:
        sections.append(HelpSection(anchor=anchor, heading=heading, body="\n".join(buf).strip()))

    for line, in_fence in _iter_unfenced(body):
        if not in_fence and line.startswith("## "):
            flush()
            heading = line[3:].strip()
            base = slugify_heading(heading) or "section"
            count = used.get(base, 0) + 1
            used[base] = count
            anchor = base if count == 1 else f"{base}-{count}"
            buf = []
        else:
            buf.append(line)
    flush()
    return sections


def parse_article(slug: str, text: str) -> HelpArticle:
    meta, body = _split_front_matter(text)
    title = meta.get("title")
    title = str(title).strip() if title else (_first_h1(body) or "")
    if not title:
        raise ValueError("article has no title")

    summary = meta.get("summary")
    summary = str(summary).strip() if summary else _first_paragraph(body)[:SUMMARY_MAX_CHARS]

    def as_list(value) -> list[str]:
        if value is None:
            return []
        if isinstance(value, (list, tuple)):
            return [str(v) for v in value]
        return [str(value)]

    try:
        order = int(meta.get("order", DEFAULT_ORDER))
    except (TypeError, ValueError) as e:
        raise ValueError(f"invalid order: {meta.get('order')!r}") from e

    route = meta.get("route")
    return HelpArticle(
        slug=slug,
        title=title,
        summary=summary,
        tags=as_list(meta.get("tags")),
        roles=as_list(meta.get("roles")),
        order=order,
        topic=str(meta.get("topic") or DEFAULT_TOPIC),
        route=str(route) if route else None,
        body=body,
        sections=_split_sections(title, body),
    )


def load_articles(
    content_dir: Path, extra_files: dict[str, Path] | None = None
) -> list[HelpArticle]:
    """Load all articles; never raises. Bad files are skipped, first slug wins."""
    candidates: list[tuple[str, Path]] = []
    try:
        if content_dir.is_dir():
            candidates.extend((p.stem, p) for p in sorted(content_dir.glob("*.md")))
    except OSError as e:
        logger.warning("Cannot list help content dir %s: %s", content_dir, e)
    candidates.extend((slug, path) for slug, path in (extra_files or {}).items())

    articles: dict[str, HelpArticle] = {}
    for slug, path in candidates:
        if slug in articles:
            logger.warning("Duplicate help article slug %r from %s ignored", slug, path)
            continue
        try:
            articles[slug] = parse_article(slug, path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, ValueError) as e:
            logger.warning("Skipping help article %s: %s", path, e)
    return sorted(articles.values(), key=lambda a: (a.order, a.title))
