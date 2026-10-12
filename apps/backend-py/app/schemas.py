"""Response models. Field names are the frozen camelCase contract used by the frontend."""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, field_serializer
from pydantic.alias_generators import to_camel


def to_instant(value: datetime | None) -> str | None:
    """ISO-8601 UTC instant with a trailing Z, e.g. 2026-01-31T12:00:00.123Z."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class UploadResponse(ApiModel):
    job_id: str


class ErrorResponse(BaseModel):
    error: str
    message: str


class JobOutput(ApiModel):
    filename: str
    size_bytes: int
    download_url: str


class JobMetricsOut(ApiModel):
    source_word_count: int | None = None
    output_word_count: int | None = None
    ordered_lists_detected: int | None = None
    unordered_lists_detected: int | None = None
    ordered_lists_reconstructed: int | None = None
    unordered_lists_reconstructed: int | None = None
    headings_detected: int | None = None
    h1_heading_count: int | None = None
    h2_heading_count: int | None = None
    h3_heading_count: int | None = None
    tables_detected: int | None = None
    images_detected: int | None = None
    multi_column_page_count: int | None = None
    output_page_count: int | None = None


class JobStatusResponse(ApiModel):
    job_id: str
    status: str
    source_filename: str
    page_count: int | None = None
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    phase: str | None = None
    progress_percent: int | None = None
    duration_seconds: float | None = None
    estimated_remaining_seconds: float | None = None
    estimated_total_seconds: float | None = None
    current_phase_estimated_remaining_seconds: float | None = None
    output: JobOutput | None = None
    metrics: JobMetricsOut | None = None

    @field_serializer("created_at", "started_at", "completed_at")
    def _serialize_instant(self, value: datetime | None) -> str | None:
        return to_instant(value)
