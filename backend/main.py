from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError

from app.core.exceptions import (
    request_validation_exception_handler,
)

from app.modules.auth.router.auth_router import router as auth_router
from app.modules.jobs.routers.jobs_router import router as job_events_router
from app.modules.platform_administration.routers.platform_administration_router  import router as platform_administration_router

from app.modules.organization_administration.router import router as organization_administration_router

from app.modules.organization_administration.jobs_router import router as organization_jobs_router

from app.modules.entity_types.router import router as entity_types_router

from app.modules.organization_navigation.router import router as organization_navigation_router
from app.modules.entity_records.router import router as entity_records_router

app = FastAPI(
    title="MiniApp API",
    version="0.1.0",
)

app.add_exception_handler(
    RequestValidationError,
    request_validation_exception_handler,
)

app.include_router(auth_router)
app.include_router(job_events_router)
app.include_router(platform_administration_router)
app.include_router(organization_administration_router)
app.include_router(organization_jobs_router)
app.include_router(entity_types_router)
app.include_router(organization_navigation_router)
app.include_router(entity_records_router)


