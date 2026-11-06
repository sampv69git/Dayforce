"""Top-level API router."""

from fastapi import APIRouter

from app.api.routes import auth, exceptions, governance, system, workforce
from app.contracts.api import PROBLEM_RESPONSES

api_router = APIRouter(responses=PROBLEM_RESPONSES)
for module in (system, auth, exceptions, workforce, governance):
    api_router.include_router(module.router)
