from typing import List, Optional

from pydantic import BaseModel, Field


class HelpSectionRead(BaseModel):
    anchor: str
    heading: str


class HelpArticleSummary(BaseModel):
    slug: str
    title: str
    summary: str
    tags: List[str] = Field(default_factory=list)
    roles: List[str] = Field(default_factory=list)
    order: int
    topic: str
    route: Optional[str] = None


class HelpArticleRead(HelpArticleSummary):
    body: str
    sections: List[HelpSectionRead] = Field(default_factory=list)
