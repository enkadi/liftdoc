"""API error envelope: every error body is {"error": "<CODE>", "message": "<text>"}."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger(__name__)

INTERNAL_ERROR_MESSAGE = "An unexpected error occurred. Please try again."


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def error_response(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": code, "message": message})


def invalid_pdf(message: str = "The uploaded file is not a valid PDF.") -> ApiError:
    return ApiError(400, "INVALID_PDF", message)


def missing_file() -> ApiError:
    return ApiError(400, "MISSING_FILE", "No file was uploaded. Attach a PDF in the 'file' field.")


def encrypted_pdf() -> ApiError:
    return ApiError(
        400, "ENCRYPTED_PDF", "This PDF is password protected. Remove the password and try again."
    )


def file_too_large(max_bytes: int) -> ApiError:
    mb = max_bytes / (1024 * 1024)
    return ApiError(413, "FILE_TOO_LARGE", f"File is too large. Please upload a PDF smaller than {mb:g}MB.")


def storage_error() -> ApiError:
    return ApiError(500, "STORAGE_ERROR", "The uploaded file could not be stored. Please try again.")


def job_not_found() -> ApiError:
    return ApiError(404, "JOB_NOT_FOUND", "Job not found.")


def job_not_ready() -> ApiError:
    return ApiError(409, "JOB_NOT_READY", "The conversion has not finished yet.")


def job_failed() -> ApiError:
    return ApiError(409, "JOB_FAILED", "The conversion failed, so there is no file to download.")


def file_expired() -> ApiError:
    return ApiError(410, "FILE_EXPIRED", "The converted file has expired and was deleted.")


_STATUS_CODES = {400: "BAD_REQUEST", 404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED", 413: "FILE_TOO_LARGE"}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError) -> JSONResponse:
        level = logging.ERROR if exc.status_code >= 500 else logging.INFO
        log.log(level, "Request rejected", extra={"code": exc.code, "path": request.url.path})
        return error_response(exc.status_code, exc.code, exc.message)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code >= 500:
            return error_response(exc.status_code, "INTERNAL_ERROR", INTERNAL_ERROR_MESSAGE)
        code = _STATUS_CODES.get(exc.status_code, "REQUEST_ERROR")
        return error_response(exc.status_code, code, str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return error_response(400, "BAD_REQUEST", "The request is invalid.")

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        # The stack trace goes to the log only; the client gets a generic message.
        log.error("Unhandled error", exc_info=exc, extra={"path": request.url.path})
        return error_response(500, "INTERNAL_ERROR", INTERNAL_ERROR_MESSAGE)
