# app/core/config.py
from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr, PositiveInt
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


API_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "MiniApp API"
    environment: str = "development"

    postgres_host: str
    postgres_port: int = 5432
    postgres_user: str
    postgres_password: SecretStr
    postgres_db: str

    auth_session_lifetime_hours: PositiveInt = 24

    auth_session_cookie_name: str = "miniapp_session"
    auth_csrf_cookie_name: str = "miniapp_csrf"
    auth_csrf_header_name: str = "X-CSRF-Token"

    auth_cookie_secure: bool = False

    invitation_lifetime_hours: PositiveInt = 48
    password_reset_lifetime_minutes: PositiveInt = 60
    frontend_base_url: str = "http://localhost:3000"

    smtp_host: str = "127.0.0.1"
    smtp_port: int = 1025
    smtp_sender_email: str = "no-reply@miniapp.local"

    celery_broker_url: str = "redis://127.0.0.1:6379/0"
    celery_result_backend: str = "redis://127.0.0.1:6379/1"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",

    )

    @property
    def database_url(self) -> URL:
        return URL.create(
            drivername="postgresql+asyncpg",
            username=self.postgres_user,
            password=self.postgres_password.get_secret_value(),
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        )

@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()