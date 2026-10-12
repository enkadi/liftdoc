"""Environment-driven configuration."""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_JDBC_RE = re.compile(r"^jdbc:postgresql://(?P<rest>.+)$", re.I)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", populate_by_name=True)

    # Database: either DB_URL (SQLAlchemy, libpq or JDBC style) or discrete parts.
    db_url: str | None = Field(default=None, validation_alias=AliasChoices("DB_URL", "DATABASE_URL"))
    db_host: str = Field(default="localhost", validation_alias="DB_HOST")
    db_port: int = Field(default=5432, validation_alias="DB_PORT")
    db_name: str = Field(default="doclift", validation_alias="DB_NAME")
    db_username: str | None = Field(default=None, validation_alias=AliasChoices("DB_USERNAME", "DB_USER"))
    db_password: str | None = Field(default=None, validation_alias="DB_PASSWORD")

    upload_directory: Path = Field(default=Path("./uploads"), validation_alias="APP_UPLOAD_DIRECTORY")
    max_upload_size_bytes: int = Field(
        default=10 * 1024 * 1024,
        validation_alias=AliasChoices("APP_MAX_UPLOAD_SIZE_BYTES", "APP_MAX_FILE_SIZE_BYTES"),
    )
    cors_allowed_origins: str = Field(
        default="http://localhost:3000",
        validation_alias=AliasChoices("APP_CORS_ALLOWED_ORIGINS", "FRONTEND_ORIGIN"),
    )
    retention_minutes: float = Field(default=30.0, validation_alias="APP_RETENTION_MINUTES")
    cleanup_interval_seconds: float = Field(default=60.0, validation_alias="APP_CLEANUP_INTERVAL_SECONDS")
    max_concurrent_conversions: int = Field(default=2, validation_alias="APP_MAX_CONCURRENT_CONVERSIONS")
    # faithful: keep PDF page boundaries (explicit page breaks, floating images);
    # flow: reflowable document, paragraphs rejoined across pages.
    layout_mode: str = Field(default="faithful", validation_alias="APP_LAYOUT_MODE")
    log_level: str = Field(default="INFO", validation_alias="LOG_LEVEL")
    log_format: str = Field(default="json", validation_alias="LOG_FORMAT")  # json | text

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_allowed_origins.split(",") if o.strip()]

    @property
    def database_url(self) -> str:
        """Async SQLAlchemy URL built from DB_URL or the discrete DB_* variables."""
        url = (self.db_url or "").strip()
        if not url:
            auth = ""
            if self.db_username:
                auth = quote(self.db_username, safe="")
                if self.db_password:
                    auth += ":" + quote(self.db_password, safe="")
                auth += "@"
            return f"postgresql+asyncpg://{auth}{self.db_host}:{self.db_port}/{self.db_name}"
        jdbc = _JDBC_RE.match(url)
        if jdbc:  # the Spring service was configured with jdbc:postgresql://host:port/db
            auth = ""
            if self.db_username:
                auth = quote(self.db_username, safe="")
                if self.db_password:
                    auth += ":" + quote(self.db_password, safe="")
                auth += "@"
            return f"postgresql+asyncpg://{auth}{jdbc.group('rest').split('?')[0]}"
        for prefix in ("postgresql://", "postgres://", "postgresql+psycopg2://", "postgresql+psycopg://"):
            if url.startswith(prefix):
                url = "postgresql+asyncpg://" + url[len(prefix) :]
                break
        if url.startswith("postgresql+asyncpg://") and "@" not in url and self.db_username:
            auth = quote(self.db_username, safe="")
            if self.db_password:
                auth += ":" + quote(self.db_password, safe="")
            url = "postgresql+asyncpg://" + auth + "@" + url[len("postgresql+asyncpg://") :]
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
