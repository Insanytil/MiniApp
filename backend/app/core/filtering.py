from typing import Any

from sqlalchemy.sql import ColumnElement, Select


def apply_eq_filter(
    statement: Select[Any],
    column: ColumnElement[Any],
    value: Any | None,
) -> Select[Any]:
    if value is None:
        return statement

    return statement.where(
        column == value
    )


def apply_contains_filter(
    statement: Select[Any],
    column: ColumnElement[str],
    value: str | None,
) -> Select[Any]:
    if value is None:
        return statement

    normalized_value = value.strip()

    if not normalized_value:
        return statement

    return statement.where(
        column.contains(
            normalized_value,
            autoescape=True,
        )
    )