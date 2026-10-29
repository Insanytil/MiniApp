# app/core/pagination.py
from typing import Generic, TypeVar

from pydantic import BaseModel, Field


T = TypeVar("T")


class PagePaginationParams(BaseModel):
    page: int = Field(
        default=1,
        ge=1,
    )

    page_size: int = Field(
        default=20,
        ge=1,
        le=100,
    )

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class PagePaginationMeta(BaseModel):
    page: int
    page_size: int
    total: int
    total_pages: int


class PagePaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    pagination: PagePaginationMeta


class CursorPaginationParams(BaseModel):
    cursor: str | None = None

    limit: int = Field(
        default=20,
        ge=1,
        le=100,
    )


class CursorPaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None
    has_more: bool