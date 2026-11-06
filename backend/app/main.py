"""FastAPI application factory."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import install_error_handlers
from app.api.router import api_router
from app.config import get_settings
from app.observability.logging import configure_logging, get_logger, request_id_var

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    from app.bootstrap import bootstrap

    bootstrap()
    yield


def create_app(run_bootstrap: bool = True) -> FastAPI:
    """Build the application. Tests pass run_bootstrap=False and prepare the DB themselves."""
    settings = get_settings()
    configure_logging(settings.log_level)
    app = FastAPI(
        title="Countersign API",
        version="1.0.0",
        description=(
            "Governed timecard exception resolution agent. The model drafts, the rules "
            "verify, a manager countersigns. All data served by this API is synthetic."
        ),
        lifespan=lifespan if run_bootstrap else None,
        openapi_url="/api/v1/openapi.json",
        docs_url="/docs",
        redoc_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )

    @app.middleware("http")
    async def request_id_middleware(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        token = request_id_var.set(rid)
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        response.headers["X-Request-ID"] = rid
        return response

    install_error_handlers(app)
    app.include_router(api_router, prefix="/api/v1")
    return app


app = create_app()
