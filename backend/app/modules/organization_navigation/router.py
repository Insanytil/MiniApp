from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_async_session
from app.modules.authorisation.dependencies import CurrentOrganizationScope, OrganizationAdminScope
from app.modules.organization_navigation.rules import NavigationConflictError, NavigationError
from app.modules.organization_navigation.schemas import MenuResponse, SaveMenuRequest
from app.modules.organization_navigation.service import OrganizationNavigationService


async def get_navigation_service(db: AsyncSession = Depends(get_async_session)):
    return OrganizationNavigationService(db)


Service = Annotated[OrganizationNavigationService, Depends(get_navigation_service)]
router = APIRouter(prefix='/organization/navigation', tags=['organization navigation'])


@router.get('', response_model=MenuResponse)
async def get_menu(scope: CurrentOrganizationScope, service: Service):
    return await service.get_menu(scope.organization.id)


@router.put('', response_model=MenuResponse)
async def save_menu(payload: SaveMenuRequest, scope: OrganizationAdminScope, service: Service):
    try:
        return await service.save_menu(scope.organization.id, scope.user.id, payload)
    except NavigationConflictError:
        raise HTTPException(status_code=409, detail='Navigation version conflict') from None
    except NavigationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
