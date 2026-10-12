from __future__ import annotations

import os
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

REPO_ROOT = Path(__file__).resolve().parents[3]
SAMPLES = Path(os.environ.get("DOCLIFT_SAMPLES_DIR") or REPO_ROOT / "test-pdfs" / "samples")


def sample(name: str) -> Path:
    matches = sorted(SAMPLES.glob(f"{name}*.pdf"))
    assert matches, f"sample PDF {name!r} not found in {SAMPLES}"
    return matches[0]


@pytest.fixture
def settings(tmp_path) -> Settings:
    # SQLite keeps the suite hermetic; set TEST_DATABASE_URL to run against PostgreSQL.
    db_url = os.environ.get("TEST_DATABASE_URL") or f"sqlite+aiosqlite:///{tmp_path / 'test.db'}"
    return Settings(
        db_url=db_url,
        upload_directory=tmp_path / "uploads",
        cors_allowed_origins="http://localhost:3000",
        cleanup_interval_seconds=3600,
        log_format="text",
        log_level="WARNING",
    )


@pytest.fixture
def app(settings):
    return create_app(settings, create_schema=True)


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client


def upload(client: TestClient, path: Path, filename: str | None = None):
    with open(path, "rb") as fh:
        return client.post("/api/v1/uploads", files={"file": (filename or path.name, fh, "application/pdf")})


def wait_for_job(client: TestClient, job_id: str, timeout: float = 60.0) -> dict:
    deadline = time.monotonic() + timeout
    while True:
        response = client.get(f"/api/v1/jobs/{job_id}")
        assert response.status_code == 200, response.text
        body = response.json()
        if body["status"] in ("DONE", "FAILED"):
            return body
        assert time.monotonic() < deadline, f"job {job_id} still {body['status']}"
        time.sleep(0.05)


@pytest.fixture(scope="session")
def book_pdf(tmp_path_factory) -> Path:
    from .fixtures import build_book

    return build_book(tmp_path_factory.mktemp("fixtures") / "book.pdf")


@pytest.fixture(scope="session")
def ligature_pdf(tmp_path_factory) -> Path:
    from .fixtures import build_ligatures

    return build_ligatures(tmp_path_factory.mktemp("fixtures") / "ligatures.pdf")
