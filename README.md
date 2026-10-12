# DocLift

Converts PDF files into editable Microsoft Word (`.docx`) documents.

| Path | What it is |
|---|---|
| [apps/backend-py/](apps/backend-py/) | Python backend (FastAPI, PyMuPDF, python-docx, PostgreSQL) |
| [web/](web/) | Next.js frontend |
| [test-pdfs/](test-pdfs/) | Synthetic sample PDFs and the expected outcome for each |

## Run locally

Requires Docker and Node.js 22+.

```sh
# Backend and database, on http://localhost:8080
cd apps/backend-py
docker compose -f docker-compose.dev.yml up --build -d

# Frontend, on http://localhost:3000
cd web
npm install
npm run dev
```

Open http://localhost:3000 and upload a PDF.

## Tests

```sh
cd apps/backend-py && uv run pytest && uv run ruff check .
cd web && npm run lint && npm test
```

Both suites run in GitHub Actions on every pull request and on pushes to `main`.
See the [backend README](apps/backend-py/README.md) for configuration, the conversion pipeline and the QA tool.
