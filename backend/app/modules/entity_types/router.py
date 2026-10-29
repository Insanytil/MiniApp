import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PagePaginatedResponse, PagePaginationMeta
from app.db.session import get_async_session
from app.modules.authorisation.dependencies import OrganizationAdminScope
from app.modules.entity_types.definitions import EntityTypeAlreadyExistsError, EntityTypeNotFoundError
from app.modules.entity_types.repository import EntityTypeRepository
from app.modules.entity_types.schemas import (
    CreateEntityTypeRequest, EntityTypeListParams, EntityTypeResponse, UpdateEntityTypeRequest,
    EntityTypeConfigurationResponse,
)
from app.modules.entity_types.service import EntityTypeService
from app.modules.entity_types.configuration_rules import ConfigurationError, ConfigurationConflictError
from app.modules.entity_types.configuration_schema import SaveConfigurationRequest


async def get_entity_type_service(db: AsyncSession = Depends(get_async_session)) -> EntityTypeService:
    return EntityTypeService(db, EntityTypeRepository(db))


EntityTypeServiceDep = Annotated[EntityTypeService, Depends(get_entity_type_service)]

router = APIRouter(prefix="/organization/entity-types", tags=["entity types"])


@router.get("", response_model=PagePaginatedResponse[EntityTypeResponse])
async def list_entity_types(
    params: Annotated[EntityTypeListParams, Query()], scope: OrganizationAdminScope, service: EntityTypeServiceDep,
) -> PagePaginatedResponse[EntityTypeResponse]:
    items, total = await service.list_types(organization_id=scope.organization.id, params=params)
    return PagePaginatedResponse(items=items, pagination=PagePaginationMeta(
        page=params.page, page_size=params.page_size, total=total,
        total_pages=(total + params.page_size - 1) // params.page_size,
    ))


@router.post("", response_model=EntityTypeResponse, status_code=status.HTTP_201_CREATED)
async def create_entity_type(
    payload: CreateEntityTypeRequest, scope: OrganizationAdminScope, service: EntityTypeServiceDep,
) -> EntityTypeResponse:
    try:
        return await service.create(organization_id=scope.organization.id, actor_id=scope.user.id, payload=payload)
    except EntityTypeAlreadyExistsError:
        raise HTTPException(status_code=409, detail="Entity type technical name already exists in this organization") from None


@router.patch("/{entity_type_id}", response_model=EntityTypeResponse)
async def update_entity_type(
    entity_type_id: uuid.UUID, payload: UpdateEntityTypeRequest,
    scope: OrganizationAdminScope, service: EntityTypeServiceDep,
) -> EntityTypeResponse:
    try:
        return await service.update(organization_id=scope.organization.id, actor_id=scope.user.id, entity_type_id=entity_type_id, payload=payload)
    except EntityTypeNotFoundError:
        raise HTTPException(status_code=404, detail="Entity type not found") from None


@router.delete("/{entity_type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entity_type(
    entity_type_id: uuid.UUID, scope: OrganizationAdminScope, service: EntityTypeServiceDep,
) -> None:
    try:
        await service.delete(organization_id=scope.organization.id, entity_type_id=entity_type_id)
    except ConfigurationError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except EntityTypeNotFoundError:
        raise HTTPException(status_code=404, detail="Entity type not found") from None


@router.get("/configuration/catalog", response_model=list[EntityTypeConfigurationResponse])
async def configuration_catalog(scope: OrganizationAdminScope, service: EntityTypeServiceDep):
    return await service.configuration_catalog(organization_id=scope.organization.id)


@router.put("/{entity_type_id}/configuration", response_model=EntityTypeConfigurationResponse)
async def save_configuration(
    entity_type_id: uuid.UUID, payload: SaveConfigurationRequest,
    scope: OrganizationAdminScope, service: EntityTypeServiceDep,
):
    try:
        return await service.save_configuration(
            organization_id=scope.organization.id, actor_id=scope.user.id,
            entity_type_id=entity_type_id, payload=payload,
        )
    except EntityTypeNotFoundError:
        raise HTTPException(status_code=404, detail="Entity type not found") from None
    except ConfigurationConflictError:
        raise HTTPException(status_code=409, detail="Configuration version conflict") from None
    except ConfigurationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
