from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.modules.files.exceptions import FileError
from fastapi.exceptions import RequestValidationError

from app.core.exceptions import (
    request_validation_exception_handler,
)

from app.modules.auth.router.auth_router import router as auth_router
from app.modules.jobs.routers.jobs_router import router as job_events_router
from app.modules.platform_administration.routers.platform_administration_router import (
    router as platform_administration_router,
)

from app.modules.organization_administration.router import (
    router as organization_administration_router,
)

from app.modules.organization_administration.jobs_router import (
    router as organization_jobs_router,
)

from app.modules.entity_types.router import router as entity_types_router

from app.modules.organization_navigation.router import (
    router as organization_navigation_router,
)
from app.modules.entity_records.router import router as entity_records_router
from app.modules.files.router import router as files_router


def file_error_handler(request: Request, exc: FileError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


def create_app() -> FastAPI:
    application = FastAPI(title="MiniApp API", version="0.1.0")
    application.add_exception_handler(RequestValidationError, request_validation_exception_handler)
    application.add_exception_handler(FileError, file_error_handler)
    for router in (
        auth_router,
        job_events_router,
        platform_administration_router,
        organization_administration_router,
        organization_jobs_router,
        entity_types_router,
        organization_navigation_router,
        entity_records_router,
        files_router,
    ):
        application.include_router(router)
    return application
