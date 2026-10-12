"""Render a DOCX to PDF for visual comparison.

Rendering needs a word processor. LibreOffice is used headless, either a local `soffice`
or the `doclift-qa-renderer` Docker image (qa/renderer.Dockerfile). This is QA tooling only;
the service itself never renders.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path

DOCKER_IMAGE = os.environ.get("DOCLIFT_QA_RENDERER_IMAGE", "doclift-qa-renderer")
TIMEOUT = int(os.environ.get("DOCLIFT_QA_RENDER_TIMEOUT", "600"))


class RendererUnavailable(RuntimeError):
    pass


def _works(cmd: list[str]) -> bool:
    try:
        return subprocess.run(cmd, capture_output=True, timeout=60).returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


@lru_cache
def find_renderer() -> str | None:
    """'soffice' (local LibreOffice), 'docker' (renderer image), or None."""
    forced = os.environ.get("DOCLIFT_QA_RENDERER")
    if forced in ("soffice", "docker"):
        return forced
    local = os.environ.get("DOCLIFT_SOFFICE") or shutil.which("soffice")
    if local and _works([local, "--version"]):  # a dangling launcher script is not a renderer
        return "soffice"
    if shutil.which("docker") and _works(["docker", "image", "inspect", DOCKER_IMAGE]):
        return "docker"
    return None


def docx_to_pdf(docx: Path, out_dir: Path, font_dirs: list[Path] | None = None) -> Path:
    """Convert `docx` to PDF inside `out_dir` and return the PDF path."""
    renderer = find_renderer()
    if renderer is None:
        raise RendererUnavailable(
            "No DOCX renderer: install LibreOffice or build the image with "
            "`docker build -t doclift-qa-renderer -f qa/renderer.Dockerfile qa`."
        )
    out_dir = out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    work = out_dir / docx.name
    if work.resolve() != docx.resolve():
        shutil.copyfile(docx, work)
    target = out_dir / (docx.stem + ".pdf")
    target.unlink(missing_ok=True)
    if renderer == "soffice":
        soffice = os.environ.get("DOCLIFT_SOFFICE") or shutil.which("soffice")
        cmd = [
            soffice,
            "--headless",
            "--norestore",
            "--convert-to",
            "pdf",
            "--outdir",
            str(out_dir),
            str(work),
        ]
    else:
        cmd = ["docker", "run", "--rm", "-v", f"{out_dir}:/work"]
        for i, fonts in enumerate(font_dirs or _env_font_dirs()):
            cmd += ["-v", f"{Path(fonts).resolve()}:/usr/share/fonts/host{i}:ro"]
        cmd += [DOCKER_IMAGE, f"/work/{work.name}"]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=TIMEOUT)
    if proc.returncode != 0 or not target.is_file():
        raise RendererUnavailable(
            f"Rendering failed: {proc.stderr.strip()[-400:] or proc.stdout.strip()[-400:]}"
        )
    return target


def _env_font_dirs() -> list[Path]:
    """Extra font directories (os.pathsep separated) so the render uses the document's fonts."""
    raw = os.environ.get("DOCLIFT_QA_FONT_DIRS", "")
    return [Path(p) for p in raw.split(os.pathsep) if p and Path(p).is_dir()]
