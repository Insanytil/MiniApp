import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator


class UploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(default="application/octet-stream", max_length=127,
                              pattern=r"^[a-zA-Z0-9!#$&^_.+-]+/[a-zA-Z0-9!#$&^_.+-]+$")
    size_bytes: int = Field(gt=0)

    @field_validator("filename")
    @classmethod
    def valid_filename(cls, value: str) -> str:
        value = value.strip()
        if not value or any(ord(c) < 32 or ord(c) == 127 for c in value) or "/" in value or "\\" in value:
            raise ValueError("Invalid filename")
        return value


class FileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    filename: str
    content_type: str
    size_bytes: int
    state: str
    created_at: datetime


class UploadResponse(BaseModel):
    file: FileResponse
    url: str
    fields: dict[str, str]
    expires_in: int


class DownloadResponse(BaseModel):
    url: str
    expires_in: int
