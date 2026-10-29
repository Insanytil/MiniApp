"""Shared rules for entity definitions; system fields are implicit, not custom fields."""
import re

SYSTEM_FIELD_NAMES = ("id", "created_at", "updated_at", "created_by", "updated_by")
TECHNICAL_NAME_PATTERN = re.compile(r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")


def validate_technical_name(value: str) -> str:
    if not 1 <= len(value) <= 100 or not TECHNICAL_NAME_PATTERN.fullmatch(value):
        raise ValueError("Technical name must start with a lowercase letter and contain lowercase letters, numbers or single underscores")
    return value


def normalize_name(value: str) -> str:
    value = value.strip()
    if not value or len(value) > 255:
        raise ValueError("Name must contain between 1 and 255 characters")
    return value


class EntityTypeNotFoundError(Exception):
    pass


class EntityTypeAlreadyExistsError(Exception):
    pass
