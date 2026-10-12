"""Unit tests for job timing estimates, filenames and configuration."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.config import Settings
from app.jobs import compute_estimates, output_filename, sanitize_filename
from app.models import Job
from app.schemas import to_instant

NOW = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)


def job(**kwargs) -> Job:
    defaults = dict(id=uuid.uuid4(), source_filename="a.pdf", created_at=NOW, page_count=10)
    return Job(**{**defaults, **kwargs})


def test_estimates_for_queued_job():
    est = compute_estimates(job(status="QUEUED", phase="QUEUED", progress_percent=0), NOW)
    assert est["duration_seconds"] is None
    assert est["estimated_total_seconds"] == est["estimated_remaining_seconds"] == 2.0
    assert est["current_phase_estimated_remaining_seconds"] is None


def test_estimates_extrapolate_from_progress():
    running = job(
        status="PROCESSING",
        phase="EXTRACTING_CONTENT",
        progress_percent=25,
        started_at=NOW - timedelta(seconds=5),
        phase_started_at=NOW - timedelta(seconds=4),
    )
    est = compute_estimates(running, NOW)
    assert est["duration_seconds"] == 5.0
    assert est["estimated_total_seconds"] == 20.0
    assert est["estimated_remaining_seconds"] == 15.0
    assert 0 < est["current_phase_estimated_remaining_seconds"] <= 15.0


def test_estimates_accept_naive_datetimes_from_the_database():
    running = job(
        status="PROCESSING",
        phase="LOADING_SOURCE",
        progress_percent=1,
        started_at=(NOW - timedelta(seconds=1)).replace(tzinfo=None),
    )
    est = compute_estimates(running, NOW)
    assert est["duration_seconds"] == 1.0 and est["estimated_remaining_seconds"] >= 0


def test_estimates_for_finished_jobs():
    done = job(status="DONE", started_at=NOW - timedelta(seconds=3), completed_at=NOW)
    assert compute_estimates(done, NOW) == {
        "duration_seconds": 3.0,
        "estimated_remaining_seconds": 0.0,
        "estimated_total_seconds": 3.0,
        "current_phase_estimated_remaining_seconds": 0.0,
    }
    failed = job(status="FAILED", started_at=NOW - timedelta(seconds=2), completed_at=NOW)
    est = compute_estimates(failed, NOW)
    assert est["duration_seconds"] == 2.0 and est["estimated_remaining_seconds"] is None


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("report.pdf", "report.pdf"),
        ("../../x/y.pdf", "y.pdf"),
        ("C:\\Users\\me\\doc.pdf", "doc.pdf"),
        ("", "document.pdf"),
        (None, "document.pdf"),
        ("a\x00b\n.pdf", "ab.pdf"),
    ],
)
def test_sanitize_filename(raw, expected):
    assert sanitize_filename(raw) == expected


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("report.pdf", "report.docx"),
        ("archive.v2.PDF", "archive.v2.docx"),
        ("noext", "noext.docx"),
        (".pdf", "document.docx"),
    ],
)
def test_output_filename(source, expected):
    assert output_filename(source) == expected


def test_instant_format():
    assert to_instant(datetime(2026, 3, 4, 5, 6, 7, 123456, tzinfo=UTC)) == "2026-03-04T05:06:07.123Z"
    assert to_instant(datetime(2026, 3, 4, 5, 6, 7)) == "2026-03-04T05:06:07.000Z"
    assert to_instant(None) is None


@pytest.mark.parametrize(
    ("kwargs", "expected"),
    [
        (
            dict(db_url="jdbc:postgresql://db:5432/doclift", db_username="u", db_password="p@ss"),
            "postgresql+asyncpg://u:p%40ss@db:5432/doclift",
        ),
        (dict(db_url="postgresql://u:p@db/doclift"), "postgresql+asyncpg://u:p@db/doclift"),
        (
            dict(db_url="postgresql+asyncpg://db:5432/doclift", db_username="u", db_password="p"),
            "postgresql+asyncpg://u:p@db:5432/doclift",
        ),
        (
            dict(db_host="pg", db_port=5433, db_name="x", db_username="u", db_password="p"),
            "postgresql+asyncpg://u:p@pg:5433/x",
        ),
    ],
)
def test_database_url_forms(kwargs, expected):
    assert Settings(**kwargs).database_url == expected


def test_settings_read_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_UPLOAD_DIRECTORY", str(tmp_path))
    monkeypatch.setenv("APP_MAX_UPLOAD_SIZE_BYTES", "123")
    monkeypatch.setenv("APP_CORS_ALLOWED_ORIGINS", "https://a.example, https://b.example/")
    monkeypatch.setenv("DB_URL", "postgresql://u:p@h/d")
    s = Settings()
    assert s.upload_directory == tmp_path and s.max_upload_size_bytes == 123
    assert s.cors_origins == ["https://a.example", "https://b.example"]
    assert s.database_url == "postgresql+asyncpg://u:p@h/d"
