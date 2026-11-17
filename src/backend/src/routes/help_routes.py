from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from src.common.dependencies import CurrentUserDep
from src.common.logging import get_logger
from src.common.search_interfaces import SearchIndexItem
from src.controller.help_manager import HelpManager
from src.models.help import HelpArticleRead, HelpArticleSummary

logger = get_logger(__name__)

router = APIRouter(prefix="/api/help", tags=["Help"])


async def get_help_manager(request: Request) -> HelpManager:
    """Retrieve the HelpManager singleton from app.state."""
    manager = getattr(request.app.state, "help_manager", None)
    if manager is None:
        logger.critical("HelpManager instance not found in app.state!")
        raise HTTPException(status_code=503, detail="Help service is not available.")
    return manager


# Help is readable by any authenticated user: no feature permission check.
@router.get("/articles", response_model=List[HelpArticleSummary])
async def list_articles(
    current_user: CurrentUserDep,
    manager: HelpManager = Depends(get_help_manager),
) -> List[HelpArticleSummary]:
    return manager.list_articles()


@router.get("/articles/{slug}", response_model=HelpArticleRead)
async def get_article(
    slug: str,
    current_user: CurrentUserDep,
    manager: HelpManager = Depends(get_help_manager),
) -> HelpArticleRead:
    article = manager.get_article(slug)
    if article is None:
        raise HTTPException(status_code=404, detail="Help article not found")
    return article


@router.get("/search", response_model=List[SearchIndexItem])
async def search_help(
    current_user: CurrentUserDep,
    q: str = "",
    limit: int = Query(20, ge=1, le=50),
    manager: HelpManager = Depends(get_help_manager),
) -> List[SearchIndexItem]:
    return manager.search(q, limit=limit)


def register_routes(app):
    app.include_router(router)
    logger.info("Help routes registered")
