"""SQLAlchemy models mirroring the jobs / job_files / job_metrics schema."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

BigIntPk = BigInteger().with_variant(Integer, "sqlite")


class Base(DeclarativeBase):
    pass


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status: Mapped[str] = mapped_column(String(20), index=True)
    source_filename: Mapped[str] = mapped_column(String(255))
    page_count: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    phase: Mapped[str | None] = mapped_column(String(32))
    progress_percent: Mapped[int | None] = mapped_column(Integer)
    phase_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    files_deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Internal diagnosis for FAILED jobs; never returned by the API.
    failure_reason: Mapped[str | None] = mapped_column(Text)

    file: Mapped[JobFile | None] = relationship(
        back_populates="job", uselist=False, cascade="all, delete-orphan", lazy="selectin"
    )
    metrics: Mapped[JobMetrics | None] = relationship(
        back_populates="job", uselist=False, cascade="all, delete-orphan", lazy="selectin"
    )


class JobFile(Base):
    __tablename__ = "job_files"

    id: Mapped[int] = mapped_column(BigIntPk, primary_key=True, autoincrement=True)
    job_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), unique=True
    )
    output_path: Mapped[str] = mapped_column(String(1024))
    size: Mapped[int] = mapped_column(BigInteger)

    job: Mapped[Job] = relationship(back_populates="file")


class JobMetrics(Base):
    __tablename__ = "job_metrics"

    id: Mapped[int] = mapped_column(BigIntPk, primary_key=True, autoincrement=True)
    job_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), unique=True
    )
    source_word_count: Mapped[int | None] = mapped_column(Integer)
    output_word_count: Mapped[int | None] = mapped_column(Integer)
    ordered_lists_detected: Mapped[int | None] = mapped_column(Integer)
    unordered_lists_detected: Mapped[int | None] = mapped_column(Integer)
    ordered_lists_reconstructed: Mapped[int | None] = mapped_column(Integer)
    unordered_lists_reconstructed: Mapped[int | None] = mapped_column(Integer)
    headings_detected: Mapped[int | None] = mapped_column(Integer)
    h1_heading_count: Mapped[int | None] = mapped_column(Integer)
    h2_heading_count: Mapped[int | None] = mapped_column(Integer)
    h3_heading_count: Mapped[int | None] = mapped_column(Integer)
    tables_detected: Mapped[int | None] = mapped_column(Integer)
    images_detected: Mapped[int | None] = mapped_column(Integer)
    multi_column_page_count: Mapped[int | None] = mapped_column(Integer)
    output_page_count: Mapped[int | None] = mapped_column(Integer)

    job: Mapped[Job] = relationship(back_populates="metrics")


METRIC_FIELDS = [c.name for c in JobMetrics.__table__.columns if c.name not in ("id", "job_id")]
