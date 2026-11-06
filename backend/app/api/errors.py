"""Domain errors and RFC 9457 problem+json responses."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.observability.logging import get_logger, request_id_var

log = get_logger(__name__)


class DomainError(Exception):
    """Base class for errors that map to a problem response."""

    status = 400
    title = "Bad request"

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class NotFound(DomainError):
    status = 404
    title = "Not found"


class Forbidden(DomainError):
    status = 403
    title = "Forbidden"


class Unauthorized(DomainError):
    status = 401
    title = "Not authenticated"


class Conflict(DomainError):
    status = 409
    title = "Conflict"


class Unprocessable(DomainError):
    status = 422
    title = "Unprocessable request"


def problem(status: int, title: str, detail: str | None = None, **extra: object) -> JSONResponse:
    body: dict[str, object] = {
        "type": f"https://countersign.local/problems/{title.lower().replace(' ', '-')}",
        "title": title,
        "status": status,
    }
    if detail:
        body["detail"] = detail
    rid = request_id_var.get()
    if rid:
        body["request_id"] = rid
    body.update(extra)
    return JSONResponse(body, status_code=status, media_type="application/problem+json")


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain(_: Request, exc: DomainError) -> JSONResponse:
        return problem(exc.status, exc.title, exc.detail)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"loc": [str(p) for p in e.get("loc", [])], "msg": e.get("msg", "")}
            for e in exc.errors()
        ]
        return problem(422, "Validation failed", "Request did not match the schema", errors=errors)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return problem(exc.status_code, str(exc.detail) or "HTTP error")

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled_error", error=str(exc))
        return problem(500, "Internal error", "An unexpected error occurred")
