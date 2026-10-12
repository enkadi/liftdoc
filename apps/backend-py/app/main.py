"""Application factory and ASGI entry point (uvicorn app.main:app)."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, get_settings
from .db import create_engine, create_sessionmaker
from .errors import install_error_handlers
from .jobs import JobService
from .logging_config import configure_logging
from .models import Base
from .routes import router
from .storage import Storage

log = logging.getLogger(__name__)


def create_app(settings: Settings | None = None, *, create_schema: bool = False) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level, settings.log_format)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = create_engine(settings.database_url)
        storage = Storage(settings.upload_directory)
        service = JobService(create_sessionmaker(engine), storage, settings)
        app.state.engine = engine
        app.state.jobs = service
        if not storage.is_writable():
            log.error("Upload directory is not writable", extra={"path": str(storage.root)})
        if create_schema:  # tests only; deployments run `alembic upgrade head`
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        try:
            interrupted = await service.fail_interrupted()
            if interrupted:
                log.warning("Marked interrupted jobs as FAILED", extra={"jobs": interrupted})
        except Exception:  # noqa: BLE001 - /health reports DB trouble; do not crash-loop
            log.exception("Startup recovery skipped: database not ready")
        cleanup = asyncio.create_task(service.cleanup_loop(), name="cleanup")
        log.info("DocLift backend started", extra={"upload_directory": str(storage.root)})
        try:
            yield
        finally:
            cleanup.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await cleanup
            await engine.dispose()

    app = FastAPI(title="DocLift backend", version="1.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )
    install_error_handlers(app)
    app.include_router(router)
    return app


app = create_app()
