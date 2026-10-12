# syntax=docker/dockerfile:1

# ---- Build: resolve and install locked dependencies into a virtualenv ----
FROM python:3.12-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:0.13.0 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# ---- Runtime ----
FROM python:3.12-slim AS runtime
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH" \
    APP_UPLOAD_DIRECTORY=/app/uploads \
    PORT=8080
WORKDIR /app

RUN groupadd --system --gid 1001 doclift \
    && useradd --system --uid 1001 --gid doclift --no-create-home doclift \
    && mkdir -p /app/uploads \
    && chown doclift:doclift /app/uploads

COPY --from=builder /app/.venv /app/.venv
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

USER doclift
EXPOSE 8080
VOLUME ["/app/uploads"]

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD python -c "import os,urllib.request,sys; sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8080\")}/health', timeout=4).status == 200 else 1)"

# One worker: jobs run in-process (FastAPI BackgroundTasks), so the queue must not be split
# across processes. Migrations are applied before the server starts.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1"]
