"""Platform endpoints share the same administrator guard."""
from fastapi import APIRouter, Depends

from app.modules.authorisation.dependencies import require_platform_admin
from app.modules.platform_administration.routers.jobs_router import (
    router as jobs_router,
)
from app.modules.platform_administration.routers.organizations_router import (
    router as organizations_router,
)
from app.modules.platform_administration.routers.users_router import (
    router as users_router,
)

router = APIRouter(
    prefix="/platform",
    tags=["platform administration"],
    dependencies=[Depends(require_platform_admin)],
)
for child_router in (jobs_router, users_router, organizations_router):
    router.include_router(child_router)
