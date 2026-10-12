"""Conversion QA: render source and output, compare them, and report fidelity metrics."""

from .render import RendererUnavailable, docx_to_pdf, find_renderer
from .report import QAReport, analyse, run_qa

__all__ = ["QAReport", "RendererUnavailable", "analyse", "docx_to_pdf", "find_renderer", "run_qa"]
