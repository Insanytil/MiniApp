from app.modules.entity_records.editing import RecordConflictError
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, JsonValue
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PagePaginationParams, PagePaginationMeta
from app.db.session import get_async_session
from app.modules.authorisation.dependencies import CurrentOrganizationScope
from app.modules.entity_records.repository import EntityRecordRepository
from app.modules.entity_records.service import EntityRecordService, EntityRecordNotFoundError
from app.modules.entity_types.definitions import EntityTypeNotFoundError
from app.modules.entity_records.creation import RecordValidationError, RecordSchemaConflictError, RecordRelationConflictError
from app.modules.entity_records.creation_schema import CreateRecordRequest, RecordCreatedResponse, RecordCreationSchema, UpdateRecordRequest, RecordEditSchema


class RecordListParams(PagePaginationParams):
    model_config = ConfigDict(extra='forbid')
    search: str | None = Field(default=None, max_length=255)


class RecordPresentation(BaseModel):
    id: uuid.UUID
    entity_type_id: uuid.UUID
    title: str
    secondary: str
    image: str | None


class RecordCell(BaseModel):
    kind: Literal['text', 'image', 'records', 'count']
    text: str | None = None
    image: str | None = None
    field_kind: str | None = None
    items: list[RecordPresentation] = Field(default_factory=list)
    total: int = 0


class RecordRow(BaseModel):
    id: uuid.UUID
    cells: dict[str, RecordCell]


class RecordTableResponse(BaseModel):
    entity_type: dict[str, uuid.UUID | str]
    view: dict[str, JsonValue]
    items: list[RecordRow]
    pagination: PagePaginationMeta


async def get_service(db: AsyncSession = Depends(get_async_session)):
    return EntityRecordService(EntityRecordRepository(db))


Service = Annotated[EntityRecordService, Depends(get_service)]
router = APIRouter(prefix='/organization/entities', tags=['entity records'])


@router.get('/{entity_type_id}/records', response_model=RecordTableResponse)
async def list_records(entity_type_id: uuid.UUID, params: Annotated[RecordListParams, Query()],
                       scope: CurrentOrganizationScope, service: Service):
    try:
        return await service.list_records(scope.organization.id, entity_type_id, params)
    except EntityTypeNotFoundError:
        raise HTTPException(status_code=404, detail='Entity type not found') from None


@router.get('/{entity_type_id}/records/{record_id}')
async def record_detail(entity_type_id: uuid.UUID, record_id: uuid.UUID,
                        scope: CurrentOrganizationScope, service: Service):
    try:
        return await service.detail(scope.organization.id, entity_type_id, record_id)
    except (EntityTypeNotFoundError, EntityRecordNotFoundError):
        raise HTTPException(status_code=404, detail='Entity record not found') from None


class RecordOptionParams(RecordListParams):
    record_id: uuid.UUID | None = None
    relation_id: uuid.UUID
    direction: Literal['outgoing', 'incoming']


class RecordOptionsResponse(BaseModel):
    items: list[RecordPresentation]
    pagination: PagePaginationMeta


@router.get('/{entity_type_id}/creation-schema', response_model=RecordCreationSchema)
async def creation_schema(entity_type_id: uuid.UUID, scope: CurrentOrganizationScope, service: Service):
    try:
        return await service.creation_schema(scope.organization.id, entity_type_id)
    except EntityTypeNotFoundError:
        raise HTTPException(status_code=404, detail='Entity type not found') from None


@router.get('/{entity_type_id}/record-options', response_model=RecordOptionsResponse)
async def record_options(entity_type_id: uuid.UUID, params: Annotated[RecordOptionParams, Query()],
                         scope: CurrentOrganizationScope, service: Service):
    try:
        return await service.options(scope.organization.id, entity_type_id, params)
    except EntityTypeNotFoundError:
        raise HTTPException(status_code=404, detail='Entity type not found') from None
    except RecordValidationError as exc:
        return JSONResponse(status_code=422, content={'detail': str(exc), 'errors': exc.issues})


@router.post('/{entity_type_id}/records', response_model=RecordCreatedResponse, status_code=201)
async def create_record(entity_type_id: uuid.UUID, payload: CreateRecordRequest,
                        scope: CurrentOrganizationScope, service: Service):
    try:
        return await service.create(scope.organization.id, entity_type_id, scope.user.id, payload)
    except EntityTypeNotFoundError:
        raise HTTPException(status_code=404, detail='Entity type not found') from None
    except RecordSchemaConflictError:
        raise HTTPException(status_code=409, detail='Record schema version conflict') from None
    except RecordRelationConflictError as exc:
        return JSONResponse(status_code=409, content={'detail': str(exc), 'errors': exc.issues})
    except RecordValidationError as exc:
        return JSONResponse(status_code=422, content={'detail': str(exc), 'errors': exc.issues})


@router.get('/{entity_type_id}/records/{record_id}/edit-schema', response_model=RecordEditSchema)
async def record_edit_schema(entity_type_id: uuid.UUID, record_id: uuid.UUID,
                             scope: CurrentOrganizationScope, service: Service):
    try:
        return await service.edit_schema(scope.organization.id, entity_type_id, record_id)
    except (EntityTypeNotFoundError, EntityRecordNotFoundError):
        raise HTTPException(status_code=404, detail='Entity record not found') from None


@router.put('/{entity_type_id}/records/{record_id}', response_model=RecordCreatedResponse)
async def update_record(entity_type_id: uuid.UUID, record_id: uuid.UUID, payload: UpdateRecordRequest,
                         scope: CurrentOrganizationScope, service: Service):
    try:
        return await service.update(scope.organization.id, entity_type_id, record_id, scope.user.id, payload)
    except (EntityTypeNotFoundError, EntityRecordNotFoundError):
        raise HTTPException(status_code=404, detail='Entity record not found') from None
    except RecordSchemaConflictError:
        raise HTTPException(status_code=409, detail='Record schema version conflict') from None
    except RecordConflictError:
        raise HTTPException(status_code=409, detail='Record version conflict') from None
    except RecordRelationConflictError as exc:
        return JSONResponse(status_code=409, content={'detail': str(exc), 'errors': exc.issues})
    except RecordValidationError as exc:
        return JSONResponse(status_code=422, content={'detail': str(exc), 'errors': exc.issues})
