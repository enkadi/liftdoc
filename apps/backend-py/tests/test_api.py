"""Integration tests for the three endpoints against real sample PDFs."""

from __future__ import annotations

import io
import uuid
import zipfile
from datetime import UTC, datetime, timedelta

import pytest
from docx import Document
from fastapi.testclient import TestClient

from app import jobs as jobs_module
from app.config import Settings
from app.main import create_app
from app.models import Job

from .conftest import sample, upload, wait_for_job

DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

JOB_KEYS = {
    "jobId",
    "status",
    "sourceFilename",
    "pageCount",
    "createdAt",
    "startedAt",
    "completedAt",
    "phase",
    "progressPercent",
    "durationSeconds",
    "estimatedRemainingSeconds",
    "estimatedTotalSeconds",
    "currentPhaseEstimatedRemainingSeconds",
    "output",
    "metrics",
}
METRIC_KEYS = {
    "sourceWordCount",
    "outputWordCount",
    "orderedListsDetected",
    "unorderedListsDetected",
    "orderedListsReconstructed",
    "unorderedListsReconstructed",
    "headingsDetected",
    "h1HeadingCount",
    "h2HeadingCount",
    "h3HeadingCount",
    "tablesDetected",
    "imagesDetected",
    "multiColumnPageCount",
    "outputPageCount",
}


def assert_error(response, status: int, code: str) -> dict:
    assert response.status_code == status, response.text
    body = response.json()
    assert set(body) == {"error", "message"}
    assert body["error"] == code
    assert body["message"] and "Traceback" not in body["message"]
    return body


def parse_instant(value: str) -> datetime:
    assert value.endswith("Z"), value
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


# ------------------------------------------------------------------- happy path


@pytest.mark.parametrize(
    ("name", "pages"),
    [("01_", 2), ("03_", 1), ("04_", 3), ("06_", 1), ("11_", 3)],
)
def test_upload_poll_download(client, name, pages):
    path = sample(name)
    response = upload(client, path)
    assert response.status_code == 202, response.text
    assert set(response.json()) == {"jobId"}
    job_id = response.json()["jobId"]
    assert str(uuid.UUID(job_id)) == job_id

    job = wait_for_job(client, job_id)
    assert set(job) == JOB_KEYS
    assert job["status"] == "DONE"
    assert job["jobId"] == job_id
    assert job["sourceFilename"] == path.name
    assert job["pageCount"] == pages
    assert job["phase"] == "COMPLETED"
    assert job["progressPercent"] == 100
    created, started, completed = (parse_instant(job[k]) for k in ("createdAt", "startedAt", "completedAt"))
    assert created <= started <= completed
    assert job["durationSeconds"] >= 0
    assert job["estimatedRemainingSeconds"] == 0
    assert job["estimatedTotalSeconds"] == job["durationSeconds"]

    output = job["output"]
    assert set(output) == {"filename", "sizeBytes", "downloadUrl"}
    assert output["filename"] == path.stem + ".docx"
    assert output["downloadUrl"] == f"/api/v1/jobs/{job_id}/download"
    assert output["sizeBytes"] > 0
    assert set(job["metrics"]) == METRIC_KEYS
    assert all(isinstance(v, int) for v in job["metrics"].values())

    download = client.get(output["downloadUrl"])
    assert download.status_code == 200
    assert download.headers["content-type"] == DOCX_TYPE
    assert download.headers["content-disposition"] == f'attachment; filename="{path.stem}.docx"'
    assert int(download.headers["content-length"]) == output["sizeBytes"] == len(download.content)
    assert zipfile.is_zipfile(io.BytesIO(download.content))
    document = Document(io.BytesIO(download.content))
    assert any(p.text.strip() for p in document.paragraphs)


def test_job_is_queued_with_initial_state_before_processing(client, monkeypatch):
    """The upload response is sent with the job in its initial QUEUED state."""
    seen: dict = {}
    original = jobs_module.JobService.run

    async def spy(self, job_id):
        job = await self.get_job(job_id)
        seen.update(
            status=job.status,
            phase=job.phase,
            progress=job.progress_percent,
            started=job.started_at,
            pages=job.page_count,
        )
        await original(self, job_id)

    monkeypatch.setattr(jobs_module.JobService, "run", spy)
    response = upload(client, sample("01_"))
    assert response.status_code == 202
    assert seen == {"status": "QUEUED", "phase": "QUEUED", "progress": 0, "started": None, "pages": 2}
    assert wait_for_job(client, response.json()["jobId"])["status"] == "DONE"


def test_progress_is_persisted_through_every_phase(client, monkeypatch):
    recorded: list[tuple[str, int]] = []
    original = jobs_module.JobService._set_progress

    async def spy(self, job_id, phase, percent):
        await original(self, job_id, phase, percent)
        job = await self.get_job(job_id)
        recorded.append((job.phase, job.progress_percent))

    monkeypatch.setattr(jobs_module.JobService, "_set_progress", spy)
    job_id = upload(client, sample("10_")).json()["jobId"]
    assert wait_for_job(client, job_id)["status"] == "DONE"

    order = [
        "LOADING_SOURCE",
        "EXTRACTING_CONTENT",
        "RECOVERING_STRUCTURE",
        "GENERATING_DOCUMENT",
        "SAVING_OUTPUT",
    ]
    phases = list(dict.fromkeys(phase for phase, _ in recorded))
    assert phases == order
    percents = [pct for _, pct in recorded]
    assert percents == sorted(percents)
    assert len(set(percents)) > 20  # a 40-page file advances smoothly, not 0 -> 100
    assert max(b - a for a, b in zip(percents, percents[1:])) <= 20


def test_download_filename_with_unicode(client):
    job_id = upload(client, sample("01_"), filename="Bɛrɛ final; v2.pdf").json()["jobId"]
    job = wait_for_job(client, job_id)
    assert job["sourceFilename"] == "Bɛrɛ final; v2.pdf"
    assert job["output"]["filename"] == "Bɛrɛ final; v2.docx"
    header = client.get(f"/api/v1/jobs/{job_id}/download").headers["content-disposition"]
    # ASCII fallback first (the frontend's regex reads it), RFC 5987 name after it
    assert header.startswith("attachment; filename=\"B_r_ final_ v2.docx\"; filename*=UTF-8''")
    assert "B%C9%9Br%C9%9B%20final%3B%20v2.docx" in header


def test_content_disposition_escapes_quotes():
    from app.routes import _content_disposition

    assert _content_disposition("report.docx") == 'attachment; filename="report.docx"'
    assert _content_disposition('a"b.docx').startswith('attachment; filename="a_b.docx"')


def test_path_components_are_stripped_from_filename(client):
    job_id = upload(client, sample("01_"), filename="../../etc/passwd.pdf").json()["jobId"]
    assert wait_for_job(client, job_id)["sourceFilename"] == "passwd.pdf"


# ---------------------------------------------------------------- upload errors


def test_missing_file_part(client):
    assert_error(client.post("/api/v1/uploads", data={"other": "x"}), 400, "MISSING_FILE")
    wrong_field = client.post(
        "/api/v1/uploads", files={"document": ("a.pdf", b"%PDF-1.4", "application/pdf")}
    )
    assert_error(wrong_field, 400, "MISSING_FILE")
    assert_error(client.post("/api/v1/uploads", json={"file": "x"}), 400, "MISSING_FILE")
    assert_error(client.post("/api/v1/uploads"), 400, "MISSING_FILE")


@pytest.mark.parametrize(
    "payload",
    [b"just some text, not a pdf", b"%PDF-1.7\nthis is not really a pdf body", b"", b"PK\x03\x04docx"],
)
def test_invalid_pdf(client, payload):
    response = client.post("/api/v1/uploads", files={"file": ("x.pdf", payload, "application/pdf")})
    assert_error(response, 400, "INVALID_PDF")


def test_truncated_pdf_is_invalid(client):
    data = sample("01_").read_bytes()[:300]
    response = client.post("/api/v1/uploads", files={"file": ("x.pdf", data, "application/pdf")})
    assert_error(response, 400, "INVALID_PDF")


def test_encrypted_pdf(client):
    body = assert_error(upload(client, sample("09_")), 400, "ENCRYPTED_PDF")
    assert "password" in body["message"].lower()


def test_scanned_pdf_is_rejected_with_clear_message(client):
    body = assert_error(upload(client, sample("07_")), 400, "INVALID_PDF")
    assert "scanned" in body["message"].lower()


def test_file_too_large(settings, tmp_path):
    small = settings.model_copy(update={"max_upload_size_bytes": 2000})
    with TestClient(create_app(small, create_schema=True)) as client:
        body = assert_error(upload(client, sample("01_")), 413, "FILE_TOO_LARGE")
        assert "too large" in body["message"].lower()
    # declared Content-Length far above the limit is rejected before the body is parsed
    tiny = settings.model_copy(update={"max_upload_size_bytes": 10})
    with TestClient(create_app(tiny, create_schema=True)) as client:
        assert_error(upload(client, sample("10_")), 413, "FILE_TOO_LARGE")


def test_default_limit_is_ten_megabytes():
    assert Settings().max_upload_size_bytes == 10 * 1024 * 1024


def test_storage_error(client, app, monkeypatch):
    def boom(job_id, data):
        raise OSError("disk full")

    monkeypatch.setattr(app.state.jobs.storage, "save_source", boom)
    assert_error(upload(client, sample("01_")), 500, "STORAGE_ERROR")


def test_internal_error_hides_details(app):
    with TestClient(app, raise_server_exceptions=False) as client:

        async def boom(*args, **kwargs):
            raise RuntimeError("secret database password=hunter2")

        app.state.jobs.create_job = boom
        response = upload(client, sample("01_"))
        body = assert_error(response, 500, "INTERNAL_ERROR")
        assert "hunter2" not in response.text and "RuntimeError" not in response.text
        assert body["message"] == "An unexpected error occurred. Please try again."
        # the stored upload is not left behind
        assert not any(app.state.jobs.storage.root.iterdir())


# ------------------------------------------------------------- job/download errors


def test_job_not_found(client):
    missing = uuid.uuid4()
    assert_error(client.get(f"/api/v1/jobs/{missing}"), 404, "JOB_NOT_FOUND")
    assert_error(client.get(f"/api/v1/jobs/{missing}/download"), 404, "JOB_NOT_FOUND")
    assert_error(client.get("/api/v1/jobs/not-a-uuid"), 404, "JOB_NOT_FOUND")
    assert_error(client.get("/api/v1/jobs/not-a-uuid/download"), 404, "JOB_NOT_FOUND")


def test_download_before_done_is_not_ready(client, app):
    job_id = uuid.uuid4()
    client.portal.call(app.state.jobs.create_job, job_id, "pending.pdf", 3)

    job = client.get(f"/api/v1/jobs/{job_id}").json()
    assert set(job) == JOB_KEYS
    assert (job["status"], job["phase"], job["progressPercent"]) == ("QUEUED", "QUEUED", 0)
    assert job["pageCount"] == 3
    assert job["startedAt"] is None and job["completedAt"] is None
    assert job["output"] is None and job["metrics"] is None
    assert job["durationSeconds"] is None
    assert_error(client.get(f"/api/v1/jobs/{job_id}/download"), 409, "JOB_NOT_READY")

    client.portal.call(app.state.jobs._mark_started, job_id)
    client.portal.call(app.state.jobs._set_progress, job_id, "EXTRACTING_CONTENT", 30)
    job = client.get(f"/api/v1/jobs/{job_id}").json()
    assert (job["status"], job["phase"], job["progressPercent"]) == ("PROCESSING", "EXTRACTING_CONTENT", 30)
    assert job["startedAt"] is not None and job["output"] is None and job["metrics"] is None
    assert job["estimatedRemainingSeconds"] >= job["currentPhaseEstimatedRemainingSeconds"] >= 0
    assert job["estimatedTotalSeconds"] >= job["durationSeconds"] >= 0
    assert_error(client.get(f"/api/v1/jobs/{job_id}/download"), 409, "JOB_NOT_READY")


def test_failed_conversion_keeps_job_queryable(client, app, monkeypatch):
    def explode(*args, **kwargs):
        raise RuntimeError("internal detail: /app/uploads/secret")

    monkeypatch.setattr(jobs_module, "convert_pdf_to_docx", explode)
    job_id = upload(client, sample("01_")).json()["jobId"]
    job = wait_for_job(client, job_id)
    assert job["status"] == "FAILED"
    assert job["output"] is None and job["metrics"] is None
    assert job["completedAt"] is not None
    assert "internal detail" not in client.get(f"/api/v1/jobs/{job_id}").text
    assert_error(client.get(f"/api/v1/jobs/{job_id}/download"), 409, "JOB_FAILED")

    stored: Job = client.portal.call(app.state.jobs.get_job, uuid.UUID(job_id))
    assert "internal detail" in stored.failure_reason


def test_file_expired_after_retention_cleanup(client, app):
    job_id = upload(client, sample("03_")).json()["jobId"]
    assert wait_for_job(client, job_id)["status"] == "DONE"
    service = app.state.jobs
    job_dir = service.storage.job_dir(uuid.UUID(job_id))
    assert (job_dir / "output.docx").is_file() and (job_dir / "source.pdf").is_file()

    # inside the retention window nothing is touched
    assert client.portal.call(service.cleanup_expired) == 0
    assert client.get(f"/api/v1/jobs/{job_id}/download").status_code == 200

    later = datetime.now(UTC) + timedelta(minutes=service.settings.retention_minutes + 1)
    # >= 1: with a shared TEST_DATABASE_URL, jobs of earlier tests expire in the same sweep
    assert client.portal.call(service.cleanup_expired, later) >= 1
    assert not job_dir.exists()
    stored = client.portal.call(service.get_job, uuid.UUID(job_id))
    assert stored.files_deleted_at is not None
    assert_error(client.get(f"/api/v1/jobs/{job_id}/download"), 410, "FILE_EXPIRED")
    assert client.get(f"/api/v1/jobs/{job_id}").json()["status"] == "DONE"
    assert client.portal.call(service.cleanup_expired, later) == 0  # idempotent


def test_file_removed_out_of_band_is_expired(client, app):
    job_id = upload(client, sample("03_")).json()["jobId"]
    wait_for_job(client, job_id)
    app.state.jobs.storage.output_path(uuid.UUID(job_id)).unlink()
    assert_error(client.get(f"/api/v1/jobs/{job_id}/download"), 410, "FILE_EXPIRED")


def test_interrupted_jobs_fail_on_restart(settings):
    job_id = uuid.uuid4()
    first = create_app(settings, create_schema=True)
    with TestClient(first) as client:
        client.portal.call(first.state.jobs.create_job, job_id, "stuck.pdf", 1)
    with TestClient(create_app(settings, create_schema=True)) as client:
        job = client.get(f"/api/v1/jobs/{job_id}").json()
        assert job["status"] == "FAILED"
        assert_error(client.get(f"/api/v1/jobs/{job_id}/download"), 409, "JOB_FAILED")


# ------------------------------------------------------------------ non-functional


def test_health(client):
    for path in ("/health", "/actuator/health"):
        response = client.get(path)
        assert response.status_code == 200
        assert response.json() == {"status": "UP"}


def test_health_reports_database_outage(settings):
    broken = settings.model_copy(update={"db_url": "postgresql+asyncpg://u:p@127.0.0.1:1/none"})
    with TestClient(create_app(broken)) as client:
        response = client.get("/health")
        assert response.status_code == 503
        assert response.json() == {"status": "DOWN"}


def test_cors_allows_configured_origin_only(client):
    headers = {"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"}
    allowed = client.options("/api/v1/uploads", headers=headers)
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:3000"
    denied = client.options("/api/v1/uploads", headers={**headers, "Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in denied.headers


def test_unknown_route_uses_error_envelope(client):
    assert_error(client.get("/api/v1/nope"), 404, "NOT_FOUND")
    assert_error(client.get("/api/v1/uploads"), 405, "METHOD_NOT_ALLOWED")
