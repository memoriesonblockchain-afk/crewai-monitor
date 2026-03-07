#!/usr/bin/env python3
"""Initialize database tables.

This script creates all tables defined in the SQLAlchemy models.
Run this before starting the application for the first time.

Usage:
    python -m scripts.init_db
    # or
    python scripts/init_db.py
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text


async def init_database() -> None:
    """Create all database tables."""
    # Import models to register them with Base
    from app.models import User, APIKey, UsageDaily, AlertRule, Trace, Event  # noqa: F401
    from app.core.database import engine, Base

    print("Creating database tables...")

    async with engine.begin() as conn:
        # Create all tables
        await conn.run_sync(Base.metadata.create_all)

    print("Database tables created successfully!")

    # Print created tables
    async with engine.connect() as conn:
        result = await conn.execute(
            text(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
            )
        )
        tables = [row[0] for row in result.fetchall()]
        print(f"Tables in database: {', '.join(sorted(tables))}")

    await engine.dispose()


async def verify_tables() -> None:
    """Verify that all required tables exist."""
    from app.core.database import engine

    required_tables = {"users", "api_keys", "usage_daily", "alert_rules", "traces", "events"}

    async with engine.connect() as conn:
        result = await conn.execute(
            text(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
            )
        )
        existing_tables = {row[0] for row in result.fetchall()}

    missing = required_tables - existing_tables
    if missing:
        print(f"Warning: Missing tables: {', '.join(missing)}")
        return False
    else:
        print("All required tables exist.")
        return True


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Initialize database")
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Only verify tables exist, don't create",
    )
    args = parser.parse_args()

    if args.verify:
        asyncio.run(verify_tables())
    else:
        asyncio.run(init_database())
