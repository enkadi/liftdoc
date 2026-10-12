"""HTTP routes. Paths, field names and status codes are a frozen contract with the frontend."""

from __future__ import annotations

import asyncio
import logging
import uuid
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Request
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import text
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException

from . import errors
from .jobs import DONE, FAILED, JobService, compute_estimates, output_filename, sanitize_filename, utcnow
from .models import METRIC_FIELDS, Job
from .pdf_validation import inspect_pdf
from .schemas import ErrorResponse, JobMetricsOut, JobOutput, JobStatusResponse, UploadResponse

log = logging.getLogger(__name__)
router = APIRouter()

DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
MULTIPART_OVERHEAD = 1024 * 1024
_ERR = {"model": ErrorResponse}


def _service(request: Request) -> JobService:
    return request.app.state.jobs


def _parse_job_id(raw: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw)
    except ValueError:
        raise errors.job_not_found() from None  # a malformed id cannot name an existing job


@router.post(
    "/api/v1/uploads",
    status_code=202,
    response_model=UploadResponse,
    responses={400: _ERR, 413: _ERR, 500: _ERR},
)
async def upload(request: Request, background: BackgroundTasks) -> JSONResponse:
    service = _service(request)
    max_bytes = service.settings.max_upload_size_bytes

    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > max_bytes + MULTIPART_OVERHEAD:
        raise errors.file_too_large(max_bytes)
    if "multipart/form-data" not in request.headers.get("content-type", "").lower():
        raise errors.missing_file()
    try:
        form = await request.form()
    except MultiPartException:
        raise errors.missing_file() from None

    try:
        upload_file = form.get("file")
        if not isinstance(upload_file, UploadFile):
            raise errors.missing_file()
        if upload_file.size is not None and upload_file.size > max_bytes:
            raise errors.file_too_large(max_bytes)
        data = await upload_file.read()
        filename = sanitize_filename(upload_file.filename)
    finally:
        await form.close()

    if len(data) > max_bytes:
        raise errors.file_too_large(max_bytes)
    if not data:
        raise errors.invalid_pdf("The uploaded file is empty.")
    info = await asyncio.to_thread(inspect_pdf, data)

    job_id = uuid.uuid4()
    try:
        await asyncio.to_thread(service.storage.save_source, job_id, data)
    except OSError:
        log.exception("Could not store upload", extra={"job_id": str(job_id)})
        raise errors.storage_error() from None
    try:
        await service.create_job(job_id, filename, info.page_count)
    except Exception:
        await asyncio.to_thread(service.storage.delete_job, job_id)
        raise

    background.add_task(service.run, job_id)
    log.info(
        "Upload accepted",
        extra={"job_id": str(job_id), "bytes": len(data), "pages": info.page_count},
    )
    return JSONResponse(status_code=202, content={"jobId": str(job_id)})


def _status_body(job: Job) -> JobStatusResponse:
    output = None
    metrics = None
    if job.status == DONE:
        if job.file is not None:
            output = JobOutput(
                filename=output_filename(job.source_filename),
                size_bytes=job.file.size,
                download_url=f"/api/v1/jobs/{job.id}/download",
            )
        if job.metrics is not None:
            metrics = JobMetricsOut(**{name: getattr(job.metrics, name) for name in METRIC_FIELDS})
    return JobStatusResponse(
        job_id=str(job.id),
        status=job.status,
        source_filename=job.source_filename,
        page_count=job.page_count,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        phase=job.phase,
        progress_percent=job.progress_percent,
        output=output,
        metrics=metrics,
        **compute_estimates(job, utcnow()),
    )


@router.get("/api/v1/jobs/{job_id}", response_model=JobStatusResponse, responses={404: _ERR})
async def job_status(job_id: str, request: Request) -> JSONResponse:
    job = await _service(request).get_job(_parse_job_id(job_id))
    if job is None:
        raise errors.job_not_found()
    return JSONResponse(
        content=_status_body(job).model_dump(by_alias=True, mode="json"),
        headers={"Cache-Control": "no-store"},
    )


def _content_disposition(filename: str) -> str:
    # ASCII fallback first (the frontend reads filename="..."), RFC 5987 form for the rest.
    fallback = "".join(ch if 32 <= ord(ch) < 127 and ch not in '";\\' else "_" for ch in filename)
    header = f'attachment; filename="{fallback}"'
    if fallback != filename:
        header += f"; filename*=UTF-8''{quote(filename, safe='')}"
    return header


@router.get(
    "/api/v1/jobs/{job_id}/download",
    response_class=FileResponse,
    responses={404: _ERR, 409: _ERR, 410: _ERR},
)
async def download(job_id: str, request: Request) -> FileResponse:
    service = _service(request)
    job = await service.get_job(_parse_job_id(job_id))
    if job is None:
        raise errors.job_not_found()
    if job.status == FAILED:
        raise errors.job_failed()
    if job.status != DONE:
        raise errors.job_not_ready()
    if job.files_deleted_at is not None or job.file is None:
        raise errors.file_expired()
    path = service.storage.resolve(job.file.output_path)
    if not path.is_file():
        raise errors.file_expired()
    return FileResponse(
        path,
        media_type=DOCX_MEDIA_TYPE,
        headers={
            "Content-Disposition": _content_disposition(output_filename(job.source_filename)),
            "Cache-Control": "no-store",
        },
    )


@router.get("/health", include_in_schema=False)
@router.get("/actuator/health", include_in_schema=False)  # path the Spring healthcheck used
async def health(request: Request) -> JSONResponse:
    try:
        async with asyncio.timeout(5):
            async with request.app.state.engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        log.warning("Health check failed: database unreachable")
        return JSONResponse(status_code=503, content={"status": "DOWN"})
    return JSONResponse(content={"status": "UP"})
