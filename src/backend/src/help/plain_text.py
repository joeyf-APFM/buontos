"""Markdown-to-plain-text helpers shared by the help loader and manager."""

import re

_FENCE_RE = re.compile(r"^(```|~~~).*?^\1[^\n]*$", re.MULTILINE | re.DOTALL)
_IMAGE_RE = re.compile(r"!\[([^\]]*)\]\([^)]*\)")
_LINK_RE = re.compile(r"\[([^\]]*)\]\([^)]*\)")
_HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s+", re.MULTILINE)
_LIST_RE = re.compile(r"^\s*(?:[-*+]|\d+\.)\s+", re.MULTILINE)
_QUOTE_RE = re.compile(r"^\s*>\s?", re.MULTILINE)
_EMPHASIS_RE = re.compile(r"(\*\*|__|\*|_|~~|`)")


def markdown_to_plain(markdown: str) -> str:
    """Strip markdown markers and collapse whitespace."""
    text = _FENCE_RE.sub("", markdown)
    text = _IMAGE_RE.sub(r"\1", text)
    text = _LINK_RE.sub(r"\1", text)
    text = _HEADING_RE.sub("", text)
    text = _LIST_RE.sub("", text)
    text = _QUOTE_RE.sub("", text)
    text = _EMPHASIS_RE.sub("", text)
    return re.sub(r"\s+", " ", text).strip()


def truncate_plain(text: str, max_chars: int, word_boundary: bool = False) -> str:
    """Truncate to at most max_chars including a trailing ellipsis."""
    if len(text) <= max_chars:
        return text
    cut = text[: max_chars - 1]
    if word_boundary and not text[max_chars - 1].isspace():
        head, sep, _ = cut.rpartition(" ")
        if sep and head.strip():
            cut = head
    return cut.rstrip() + "…"
