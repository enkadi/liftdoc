"""Job lifecycle: creation, in-process background conversion, estimates, retention cleanup."""

from __future__ import annotations

import asyncio
import logging
import re
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import PurePosixPath, PureWindowsPath

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from .config import Settings
from .conversion import PHASE_RANGE, ConversionResult, convert_pdf_to_docx
from .models import METRIC_FIELDS, Job, JobFile, JobMetrics
from .storage import Storage

log = logging.getLogger(__name__)

QUEUED, PROCESSING, DONE, FAILED = "QUEUED", "PROCESSING", "DONE", "FAILED"


def utcnow() -> datetime:
    return datetime.now(UTC)


def aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def sanitize_filename(raw: str | None) -> str:
    """Reduce a client-supplied filename to a safe display name."""
    name = PureWindowsPath(PurePosixPath(raw or "").name).name
    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip()
    return name[:255] or "document.pdf"


def output_filename(source_filename: str) -> str:
    stem = source_filename.rsplit(".", 1)[0] if "." in source_filename else source_filename
    return (stem.strip() or "document") + ".docx"


def _heuristic_total_seconds(page_count: int | None) -> float | None:
    return None if page_count is None else round(1.0 + 0.1 * page_count, 2)


def compute_estimates(job: Job, now: datetime) -> dict[str, float | None]:
    """Timing fields of the status response, derived from progress so far."""
    out: dict[str, float | None] = {
        "duration_seconds": None,
        "estimated_remaining_seconds": None,
        "estimated_total_seconds": None,
        "current_phase_estimated_remaining_seconds": None,
    }
    started = aware(job.started_at) if job.started_at else None
    completed = aware(job.completed_at) if job.completed_at else None
    if job.status == DONE and started and completed:
        duration = max(0.0, (completed - started).total_seconds())
        out.update(
            duration_seconds=round(duration, 3),
            estimated_remaining_seconds=0.0,
            estimated_total_seconds=round(duration, 3),
            current_phase_estimated_remaining_seconds=0.0,
        )
    elif job.status == FAILED:
        if started and completed:
            out["duration_seconds"] = round(max(0.0, (completed - started).total_seconds()), 3)
    elif job.status == QUEUED:
        total = _heuristic_total_seconds(job.page_count)
        out.update(estimated_remaining_seconds=total, estimated_total_seconds=total)
    elif job.status == PROCESSING and started:
        elapsed = max(0.0, (now - started).total_seconds())
        percent = job.progress_percent or 0
        if percent >= 3:
            total = elapsed * 100.0 / percent
        else:
            total = max(_heuristic_total_seconds(job.page_count) or 0.0, elapsed + 0.5)
        remaining = max(0.0, total - elapsed)
        lo, hi = PHASE_RANGE.get(job.phase or "", (percent, percent))
        phase_remaining = remaining * max(0, hi - max(percent, lo)) / max(1, 100 - percent)
        out.update(
            duration_seconds=round(elapsed, 3),
            estimated_remaining_seconds=round(remaining, 3),
            estimated_total_seconds=round(total, 3),
            current_phase_estimated_remaining_seconds=round(min(remaining, phase_remaining), 3),
        )
    return out


class JobService:
    def __init__(
        self, sessions: async_sessionmaker[AsyncSession], storage: Storage, settings: Settings
    ) -> None:
        self.sessions = sessions
        self.storage = storage
        self.settings = settings
        self._slots = asyncio.Semaphore(max(1, settings.max_concurrent_conversions))

    # ------------------------------------------------------------------ queries

    async def create_job(self, job_id: uuid.UUID, filename: str, page_count: int | None) -> Job:
        job = Job(
            id=job_id,
            status=QUEUED,
            source_filename=filename,
            page_count=page_count,
            created_at=utcnow(),
            phase=QUEUED,
            progress_percent=0,
        )
        async with self.sessions() as session:
            session.add(job)
            await session.commit()
        return job

    async def get_job(self, job_id: uuid.UUID) -> Job | None:
        async with self.sessions() as session:
            return await session.get(Job, job_id)

    # --------------------------------------------------------------- conversion

    async def run(self, job_id: uuid.UUID) -> None:
        """Background task: convert one job. Never raises."""
        async with self._slots:
            try:
                job = await self._mark_started(job_id)
                if job is None:
                    return
                loop = asyncio.get_running_loop()
                last: list[tuple[str, int] | None] = [None]

                def progress(phase: str, percent: int) -> None:
                    # Called from the worker thread; hop back onto the event loop for the DB.
                    if last[0] == (phase, percent):
                        return
                    last[0] = (phase, percent)
                    try:
                        asyncio.run_coroutine_threadsafe(
                            self._set_progress(job_id, phase, percent), loop
                        ).result(timeout=30)
                    except Exception:  # noqa: BLE001 - progress is advisory
                        log.warning("Progress update failed", extra={"job_id": str(job_id)})

                result = await asyncio.to_thread(
                    convert_pdf_to_docx,
                    self.storage.source_path(job_id),
                    self.storage.output_path(job_id),
                    progress,
                    job.source_filename,
                    self.settings.layout_mode,
                )
                await self._mark_done(job_id, result)
                log.info(
                    "Conversion finished",
                    extra={
                        "job_id": str(job_id),
                        "pages": result.page_count,
                        "seconds": round(result.seconds, 3),
                        "output_bytes": result.output_size,
                        "quality": result.quality,
                    },
                )
            except Exception as exc:  # noqa: BLE001 - any failure marks the job FAILED
                log.exception("Conversion failed", extra={"job_id": str(job_id)})
                try:
                    await self._mark_failed(job_id, f"{type(exc).__name__}: {exc}"[:2000])
                except Exception:  # noqa: BLE001
                    log.exception("Could not record job failure", extra={"job_id": str(job_id)})

    async def _mark_started(self, job_id: uuid.UUID) -> Job | None:
        async with self.sessions() as session:
            job = await session.get(Job, job_id)
            if job is None or job.status != QUEUED:
                return None
            now = utcnow()
            job.status = PROCESSING
            job.started_at = now
            job.phase = "LOADING_SOURCE"
            job.phase_started_at = now
            job.progress_percent = 1
            await session.commit()
            return job

    async def _set_progress(self, job_id: uuid.UUID, phase: str, percent: int) -> None:
        async with self.sessions() as session:
            job = await session.get(Job, job_id)
            if job is None or job.status != PROCESSING:
                return
            if job.phase != phase:
                job.phase = phase
                job.phase_started_at = utcnow()
            job.progress_percent = max(job.progress_percent or 0, min(99, percent))
            await session.commit()

    async def _mark_done(self, job_id: uuid.UUID, result: ConversionResult) -> None:
        async with self.sessions() as session:
            job = await session.get(Job, job_id)
            if job is None:
                return
            now = utcnow()
            job.status = DONE
            job.completed_at = now
            job.phase = "COMPLETED"
            job.phase_started_at = now
            job.progress_percent = 100
            job.page_count = result.page_count
            job.file = JobFile(
                output_path=self.storage.relative(self.storage.output_path(job_id)),
                size=result.output_size,
            )
            job.metrics = JobMetrics(**{name: result.metrics.get(name) for name in METRIC_FIELDS})
            await session.commit()

    async def _mark_failed(self, job_id: uuid.UUID, reason: str) -> None:
        async with self.sessions() as session:
            job = await session.get(Job, job_id)
            if job is None:
                return
            job.status = FAILED
            job.completed_at = utcnow()
            job.failure_reason = reason
            await session.commit()

    # ------------------------------------------------------------ housekeeping

    async def fail_interrupted(self) -> int:
        """Jobs left unfinished by a previous process can never complete: the queue is in-memory."""
        async with self.sessions() as session:
            result = await session.execute(
                update(Job)
                .where(Job.status.in_([QUEUED, PROCESSING]))
                .values(
                    status=FAILED,
                    completed_at=utcnow(),
                    failure_reason="Interrupted by a service restart before completion.",
                )
            )
            await session.commit()
            return result.rowcount or 0

    async def cleanup_expired(self, now: datetime | None = None) -> int:
        """Delete stored files of finished jobs older than the retention window."""
        now = now or utcnow()
        cutoff = now - timedelta(minutes=self.settings.retention_minutes)
        async with self.sessions() as session:
            jobs = (
                await session.scalars(
                    select(Job).where(
                        Job.files_deleted_at.is_(None),
                        Job.completed_at.is_not(None),
                        Job.completed_at < cutoff,
                    )
                )
            ).all()
            for job in jobs:
                await asyncio.to_thread(self.storage.delete_job, job.id)
                job.files_deleted_at = now
            await session.commit()
        if jobs:
            log.info("Expired job files deleted", extra={"jobs": len(jobs)})
        return len(jobs)

    async def cleanup_loop(self) -> None:
        while True:
            try:
                await self.cleanup_expired()
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - keep the loop alive across DB hiccups
                log.exception("Cleanup run failed")
            await asyncio.sleep(self.settings.cleanup_interval_seconds)
