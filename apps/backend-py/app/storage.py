"""File storage under APP_UPLOAD_DIRECTORY: one directory per job."""

from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path

SOURCE_NAME = "source.pdf"
OUTPUT_NAME = "output.docx"


class Storage:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    def ensure_root(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)

    def is_writable(self) -> bool:
        try:
            self.ensure_root()
            probe = self.root / f".write-probe-{uuid.uuid4().hex}"
            probe.write_bytes(b"")
            probe.unlink()
            return True
        except OSError:
            return False

    def job_dir(self, job_id: uuid.UUID) -> Path:
        return self.root / str(job_id)

    def source_path(self, job_id: uuid.UUID) -> Path:
        return self.job_dir(job_id) / SOURCE_NAME

    def output_path(self, job_id: uuid.UUID) -> Path:
        return self.job_dir(job_id) / OUTPUT_NAME

    def relative(self, path: Path) -> str:
        return os.path.relpath(path, self.root)

    def resolve(self, stored: str) -> Path:
        path = Path(stored)
        return path if path.is_absolute() else self.root / path

    def save_source(self, job_id: uuid.UUID, data: bytes) -> Path:
        directory = self.job_dir(job_id)
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / SOURCE_NAME
        tmp = directory / (SOURCE_NAME + ".part")
        with open(tmp, "wb") as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        tmp.replace(path)
        return path

    def delete_job(self, job_id: uuid.UUID) -> None:
        shutil.rmtree(self.job_dir(job_id), ignore_errors=True)
