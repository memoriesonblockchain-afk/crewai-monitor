"""Application configuration."""

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Application
    app_name: str = "CrewAI Monitor"
    app_version: str = "0.1.0"
    debug: bool = False
    environment: Literal["development", "staging", "production"] = "development"

    # API
    api_prefix: str = "/v1"
    cors_origins_str: str = "http://localhost:3000,http://localhost:3002,http://localhost:8000,http://localhost:8001"

    @property
    def cors_origins(self) -> list[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.cors_origins_str.split(",")]

    # Database - PostgreSQL
    database_url: str = "postgresql+asyncpg://user:pass@localhost:5432/crewai_monitor"

    @field_validator("database_url", mode="before")
    @classmethod
    def fix_postgres_url(cls, v):
        """Convert postgres:// to postgresql+asyncpg:// for SQLAlchemy."""
        if isinstance(v, str):
            if v.startswith("postgres://"):
                v = v.replace("postgres://", "postgresql+asyncpg://", 1)
            elif v.startswith("postgresql://") and "+asyncpg" not in v:
                v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    # Database - QuestDB
    questdb_host: str = "localhost"
    questdb_port: int = 9000
    questdb_ilp_port: int = 9009  # InfluxDB Line Protocol port

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Auth
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 1 day

    # API Keys
    api_key_prefix_live: str = "cm_live_"
    api_key_prefix_test: str = "cm_test_"

    # Rate Limiting
    rate_limit_per_minute: int = 1000
    rate_limit_burst: int = 100

    # Ingest
    max_batch_size: int = 1000
    max_event_size_bytes: int = 100_000  # 100KB per event

    @property
    def postgres_url_sync(self) -> str:
        """Get synchronous PostgreSQL URL."""
        return self.database_url.replace("+asyncpg", "")


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
