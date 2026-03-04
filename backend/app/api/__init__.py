"""API routes."""

from fastapi import APIRouter

from . import auth, ingest, control, query, alerts

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(ingest.router, prefix="/ingest", tags=["ingest"])
api_router.include_router(control.router, prefix="/control", tags=["control"])
api_router.include_router(query.router, prefix="/traces", tags=["traces"])
api_router.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
