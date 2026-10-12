"""Initial schema: jobs, job_files, job_metrics.

Revision ID: 0001
Revises:
Create Date: 2026-10-12
"""

import sqlalchemy as sa

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

_METRICS = [
    "source_word_count",
    "output_word_count",
    "ordered_lists_detected",
    "unordered_lists_detected",
    "ordered_lists_reconstructed",
    "unordered_lists_reconstructed",
    "headings_detected",
    "h1_heading_count",
    "h2_heading_count",
    "h3_heading_count",
    "tables_detected",
    "images_detected",
    "multi_column_page_count",
    "output_page_count",
]


def upgrade() -> None:
    ts = sa.DateTime(timezone=True)
    op.create_table(
        "jobs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("source_filename", sa.String(255), nullable=False),
        sa.Column("page_count", sa.Integer()),
        sa.Column("created_at", ts, nullable=False),
        sa.Column("started_at", ts),
        sa.Column("completed_at", ts),
        sa.Column("phase", sa.String(32)),
        sa.Column("progress_percent", sa.Integer()),
        sa.Column("phase_started_at", ts),
        sa.Column("files_deleted_at", ts),
        sa.Column("failure_reason", sa.Text()),
    )
    op.create_index("ix_jobs_status", "jobs", ["status"])
    op.create_index("ix_jobs_completed_at", "jobs", ["completed_at"])

    op.create_table(
        "job_files",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column(
            "job_id",
            sa.Uuid(),
            sa.ForeignKey("jobs.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("output_path", sa.String(1024), nullable=False),
        sa.Column("size", sa.BigInteger(), nullable=False),
    )

    op.create_table(
        "job_metrics",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column(
            "job_id",
            sa.Uuid(),
            sa.ForeignKey("jobs.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        *[sa.Column(name, sa.Integer()) for name in _METRICS],
    )


def downgrade() -> None:
    op.drop_table("job_metrics")
    op.drop_table("job_files")
    op.drop_index("ix_jobs_completed_at", table_name="jobs")
    op.drop_index("ix_jobs_status", table_name="jobs")
    op.drop_table("jobs")
