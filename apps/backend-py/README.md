# DocLift backend (Python)

FastAPI service that converts PDF files into editable Word (`.docx`) documents while preserving
reading order, headings, lists, character formatting, images, tables and page setup.

It is a drop-in replacement for the Java/Spring Boot backend: same routes, same JSON field names,
same status codes, same `jobs` / `job_files` / `job_metrics` schema. The Next.js frontend needs no
changes.

| | |
|---|---|
| Runtime | Python 3.12+, FastAPI on uvicorn (single worker) |
| PDF engine | PyMuPDF only (text, fonts, images, `find_tables()`) |
| DOCX | python-docx |
| Jobs | FastAPI `BackgroundTasks`, in-process; conversion runs in a thread (`asyncio.to_thread`) |
| Storage | PostgreSQL via SQLAlchemy 2 (async, asyncpg) + Alembic; files under `APP_UPLOAD_DIRECTORY` |
| Tooling | uv, pytest, ruff |

## Quick start (local)

```bash
cd apps/backend-py
uv sync                                   # creates .venv from uv.lock
cp .env.example .env                      # point DB_URL at a PostgreSQL database
uv run alembic upgrade head               # create the schema
uv run uvicorn app.main:app --port 8080   # http://localhost:8080
```

The frontend proxies `/api/v1/*` to `BACKEND_URL` (default `http://127.0.0.1:8080`), so with the
service on port 8080 `npm run dev` in the web app works as before.

No PostgreSQL to hand? `docker compose -f docker-compose.dev.yml up --build` starts Postgres and
the backend together on port 8080.

```bash
curl -F file=@../../test-pdfs/samples/03_headings_and_lists.pdf localhost:8080/api/v1/uploads
# {"jobId":"…"}
curl localhost:8080/api/v1/jobs/<jobId>
curl -OJ localhost:8080/api/v1/jobs/<jobId>/download
```

## Tests

```bash
uv run pytest          # 212 tests
uv run ruff check .
```

- `tests/test_conversion.py` — unit tests for extraction, column/reading-order detection,
  heading/list/paragraph recovery, table detection, and per-sample metric expectations.
- `tests/test_api.py` — integration tests through FastAPI's `TestClient` using the real PDFs in
  `test-pdfs/samples`: upload → poll → download, plus every error code in the contract.
- `tests/test_jobs.py` — timing estimates, filename handling, configuration parsing.
- `tests/test_text_repair.py` — ToUnicode parsing, ligature expansion, glyph repair
  (`fi fl ff ffi ffl ft tt`, by glyph name and from context), suspicious-character detection.
- `tests/test_layout.py` — paragraph inference from line geometry, page boundaries, contents
  rows, headings, footnotes, captions, floating/full-bleed images, columns, index, styles, plus
  regressions for defects found in real books.
- `tests/test_qa.py` — the QA report itself, and visual regression against a LibreOffice render
  (skipped automatically when no renderer is available).

The layout and QA tests run on fixtures built by `tests/fixtures.py`: an 8-page book (cover,
front matter, contents, chapter, footnote, figure with caption, wrapped picture, index, end
matter) and a PDF whose embedded font maps ligatures the ways real producers get them wrong.

The suite uses a throwaway SQLite file by default so it runs anywhere. To run the same tests
against PostgreSQL: `TEST_DATABASE_URL=postgresql+asyncpg://user:pass@host/db uv run pytest`.
`DOCLIFT_SAMPLES_DIR` overrides the location of the sample PDFs.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DB_URL` | – | Database URL. Accepts `postgresql://…`, `postgresql+asyncpg://…`, or the Spring form `jdbc:postgresql://host:port/db` (credentials then come from `DB_USERNAME` / `DB_PASSWORD`) |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USERNAME` `DB_PASSWORD` | `localhost` `5432` `doclift` – – | Used when `DB_URL` is unset |
| `APP_UPLOAD_DIRECTORY` | `./uploads` (`/app/uploads` in the image) | Where source PDFs and generated DOCX files are stored |
| `APP_MAX_UPLOAD_SIZE_BYTES` | `10485760` (10 MB) | Upload limit → `413 FILE_TOO_LARGE` |
| `APP_CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |
| `APP_RETENTION_MINUTES` | `30` | Files are deleted this long after a job finishes (matches the UI's 30-minute purge countdown) |
| `APP_CLEANUP_INTERVAL_SECONDS` | `60` | How often the cleanup task runs |
| `APP_MAX_CONCURRENT_CONVERSIONS` | `2` | Extra jobs wait in `QUEUED` |
| `APP_LAYOUT_MODE` | `faithful` | `faithful` keeps every PDF page as a page (explicit page breaks, floating images, real columns); `flow` produces a reflowable document and rejoins paragraphs across pages |
| `LOG_LEVEL` / `LOG_FORMAT` | `INFO` / `json` | `LOG_FORMAT=text` for human-readable logs |

## Docker and docker-compose

```bash
docker build -t doclift-backend apps/backend-py
```

The image is `python:3.12-slim` based, runs as a non-root user, listens on **8080**, applies
`alembic upgrade head` on start and exposes `/health`.

To swap it in, point the existing `backend` service at this directory. Only the build context and
environment change; Postgres, frontend and Caddy stay as they are, and no service is added:

```yaml
  backend:
    build: ./apps/backend-py
    environment:
      DB_URL: postgresql://<user>:<password>@<db-service>:5432/<database>
      APP_UPLOAD_DIRECTORY: /app/uploads
      APP_CORS_ALLOWED_ORIGINS: https://<your-site-origin>
    volumes:
      - uploads:/app/uploads          # unchanged
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=4).status == 200 else 1)"]
```

Notes for the swap:

- **Healthcheck.** `/health` returns `200 {"status":"UP"}` once a `SELECT 1` succeeds and
  `503 {"status":"DOWN"}` otherwise. `/actuator/health` is served as an alias, so the *path* in the
  existing healthcheck keeps working — but the slim image has no `curl`/`wget`, so if the current
  check shells out to one of those, use the `python` form above.
- **Database.** The migration creates `jobs`, `job_files` and `job_metrics`. If the database
  already contains tables created by the Java service, start from an empty database (job rows are
  transient: files are purged after 30 minutes) rather than migrating in place.
- **Uploads volume.** The container runs as uid 1001. A volume previously written by a root
  container must be recreated or `chown`ed; the service logs `Upload directory is not writable` at
  startup and uploads return `500 STORAGE_ERROR` until it is.
- **One worker.** The job queue lives in the process, so run exactly one replica/worker.

## How conversion works

```
PDF ─► extract ─► text_repair ─► layout ─► paragraphs/structure/semantics ─► docx_writer ─► inspect_docx
       spans,      ligatures,     columns,   paragraphs from line geometry,     named styles,   counts read
       images,     unmapped       reading    headings, lists, contents rows,    floating        back from
       tables,     glyphs         order      captions, footnotes, index,        images,         the .docx
       rules                                 tables, furniture, sections        columns
```

| Module (`app/conversion/`) | Responsibility |
|---|---|
| `extract.py` | Character-level spans with font, size, weight, colour, baseline and PDF font object; images; ruled tables (`find_tables`, strict first); underlines, links, separator rules |
| `text_repair.py` | Ligature expansion, repair of glyphs the font's ToUnicode map could not name, suspicious-character report |
| `layout.py` | Column gutters and reading order |
| `paragraphs.py` | Paragraph boundaries, alignment, indents and leading from line geometry |
| `semantics.py` | Contents rows, index entries, captions, footnotes |
| `structure.py` | Orchestration: furniture, lists, headings, tables, image placement, page breaks, sections |
| `docx_styles.py` | Reusable paragraph styles built from formatting that repeats in the source |
| `docx_writer.py` | DOCX output: styles, numbering, tables, inline and floating pictures, columns, header/footer |
| `inspect_docx.py` | Word/list/heading/image counts and page estimate read back from the generated file |

**Text.** MuPDF already uses each font's ToUnicode map. Corruption appears where that map has no
answer: ligatures without a Unicode code point (`tt`, `ft`, `Th`) are often mapped to U+0000, and
the extractor then falls back to the raw glyph code, which surfaces as an unrelated letter
(`maĴer`, `aĞer`). Those glyphs are identified from the font's own ToUnicode map and repaired
(1) from the embedded font's glyph name (`t_t`, `uniFB01`), else (2) by choosing the ligature
that turns the affected words into words the document already contains, checked against glyph
advance widths. Anything unresolved is left untouched, counted and logged; nothing is guessed.

**Paragraphs.** A PyMuPDF block is not a paragraph (a contents page is one block of unrelated
lines; book prose separates paragraphs by a first-line indent only). Boundaries come from three
geometric signals: *leading* (a line further away than the local pitch), *wrap* (if the next
line's first word would have fitted, the break was intentional) and *indent*. Alignment, left
and first-line indent, space before and line pitch are measured per paragraph.

**Layout-faithful mode** (default). Each PDF page stays a page: its first block carries an
explicit page break, pictures that cannot sit in the text flow are anchored at their page
coordinates (full-bleed covers behind text with no margins, pictures with text beside them with
square wrap), multi-column zones become real Word column sections, and a table continued over
several pages keeps one part per page. `APP_LAYOUT_MODE=flow` gives the earlier reflowable
output instead.

**Structure.** Headings come from font size/weight tiers plus chapter labels; contents rows
become `TOC 1-3` paragraphs with a right tab and dot leader; index entries, captions and
footnotes (under a separator rule) get their own styles. Body paragraphs are grouped by
dominant font, size, alignment, indents and leading into `Body Text`, `Body Text 2`, ... so the
document is styled rather than directly formatted.

## Conversion QA

A conversion is not accepted because the DOCX opens. `app/qa` converts a PDF, renders the DOCX
back to PDF with LibreOffice, and compares the two:

```bash
uv run python -m app.qa path/to/file.pdf --out qa-out
# book.pdf: 8 pages -> 8 (rendered)
#   text coverage       98.7%
#   suspicious glyphs   source 0 -> output 0
#   images              3/3 (2 floating, 0 resized)
#   page text match     min 1.00  mean 1.00
#   visual similarity   min 0.40  mean 0.74
#   RESULT              OK
```

It writes `report.json` and a side-by-side PNG per representative page, and exits non-zero when
it finds problems. Tracked: page count, explicit page breaks, text-character coverage,
suspicious glyphs before/after, image count and displayed sizes, headings, styles used,
header/footer, per-page text match (is the text on the same page?) and per-page visual
similarity (weighted Jaccard of ink density).

Rendering uses a local `soffice` if it works, otherwise the Docker image:

```bash
docker build -t doclift-qa-renderer -f qa/renderer.Dockerfile qa
```

To render with the document's own fonts, put them in a directory Docker can mount and set
`DOCLIFT_QA_FONT_DIRS`. Without a renderer the programmatic checks still run and the visual
tests are skipped. The renderer is a development tool, not part of the runtime topology.

### Results on `test-pdfs/samples`

| # | Sample | Outcome |
|---|---|---|
| 01 | Single column | Title + 8 reflowable paragraphs; the paragraph split across pages 1–2 is rejoined |
| 02 | Two columns | Title, author line, then left column → right column on both pages; Sections 1–4 as headings |
| 03 | Headings and lists | Title; H1 ×3, H2 ×2, H3 ×1; 3 bullet lists (one nested two levels) and a 1–4 numbered list as Word lists; bold/italic/underline/bold-italic and a clickable link |
| 04 | Tables | A 5×4; B with *Sales* merged over two columns; C (borderless) as a 2×2 table; D as one 61-row table (header + 60 rows, none lost or duplicated) with a repeating header row |
| 05 | Images | 4 images in order next to their captions; the two squares stay side by side; aspect ratio and original pixels kept |
| 06 | Mixed layout | Left column then right; 3 bullets, image, 3×3 table, 3 headings |
| 07 | Scanned | Rejected at upload with a clear message (no OCR) — see deviations |
| 08 | Special characters | Accents, Twi letters, currency, punctuation and math symbols intact; H₂O / x² as real sub/superscripts |
| 09 | Password protected | `400 ENCRYPTED_PDF` |
| 10 | 40 pages | ~1.5 s; all 40 chapter headings in order; estimated 40 output pages |
| 11 | Mixed orientation | Three sections: Letter portrait, A4 landscape (8×8 table intact), Letter portrait |
| 12 | Header/footer/footnotes | Header and `Page N` footer in the Word header/footer; four footnote lines kept in place with superscript markers |

## Deviations from the brief, and why

**Repository layout.** This checkout has the frontend at `web/` (not `apps/web/`) and contains no
`docker-compose.yml`, `caddy/` directory or `apps/backend`. The contract was cross-checked against
`web/src/lib/{uploadApi,jobApi,pollingApi,downloadApi}.ts`. Because there is no compose file to
edit, the `backend` service block is given above and `docker-compose.dev.yml` runs
Postgres + backend standalone.

**Scanned / image-only PDFs are rejected at upload** with `400 INVALID_PDF` and the message *"This
PDF appears to be scanned or image-only: it has no text layer…"*. The expected outcomes require
that the user is told when text can't be extracted, and the job status response has no field for a
message, so the upload error is the only place the UI can show one. OCR is out of scope (PyMuPDF is
the only PDF engine). A PDF with *some* text converts normally and image-only pages are embedded
as pictures.

**Malformed job IDs return `404 JOB_NOT_FOUND`** (same envelope) instead of a framework validation
error; a malformed ID cannot name an existing job and the frontend already handles 404.

**One extra column, `jobs.failure_reason`**, stores the internal error reason for `FAILED` jobs. It
is never returned by the API.

**Metric definitions** (the brief leaves these open):

- A *word* is a whitespace-delimited token containing a letter or digit, counted the same way in
  the PDF and in the DOCX. Bullet glyphs are not words; an auto-generated list number is counted
  in the output because it replaces a number counted in the source.
- `outputWordCount` can be legitimately lower than `sourceWordCount` when repeated page furniture
  is emitted once: sample 04 reports 441 → 431 because the table header repeated on pages 2 and 3
  (5 words × 2) is written once as a repeating header row.
- The document *Title* is not counted as a heading, so
  `headingsDetected == h1HeadingCount + h2HeadingCount + h3HeadingCount` always holds.
- A list nested inside another counts as one list; a table continued across pages counts once.
- `outputPageCount` in layout-faithful mode is the number of pages delimited by explicit page
  and section breaks; in `flow` mode it is an estimate from laying out the generated document
  with approximate font metrics. Neither is a render; `python -m app.qa` gives the rendered count.

**Timing fields.** While `PROCESSING`, `durationSeconds` is the elapsed time so far and the
estimates extrapolate from progress; when `QUEUED` they use a page-count heuristic. `completedAt`
is also set when a job fails.

**Jobs do not survive a restart.** The queue is in-process by design, so jobs still `QUEUED` or
`PROCESSING` when the service starts are marked `FAILED` (the UI then offers a retry) instead of
spinning forever.

**Multi-column pages** become real two-column Word sections in the default layout-faithful mode;
in `flow` mode they become a single column in correct reading order.

**Smaller choices.** Timestamps are UTC with millisecond precision (`…T12:00:00.123Z`). For
non-ASCII filenames `Content-Disposition` carries an ASCII `filename="…"` first (the form the
frontend parses) plus an RFC 5987 `filename*`. A request whose `Content-Length` already exceeds
the limit is refused with 413 before the body is read. Password entry for encrypted PDFs is not
supported. The integration tests default to SQLite for portability; PostgreSQL is used via
`TEST_DATABASE_URL`.

## Known limitations

- No OCR; no password entry.
- **Faithful mode depends on fonts.** Page boundaries are kept by explicit breaks, but if Word
  substitutes a wider font a page's text can run past the page and spill onto an extra one. The
  bottom margin leaves about two lines of slack; run `python -m app.qa` to check a document.
- **Glyph repair from context is English-centric** (a small common-word list backs up the
  document's own vocabulary) and covers ligature glyphs. A font whose *entire* encoding is
  unmapped cannot be repaired without OCR; it is reported as suspicious characters.
- The Word header/footer is one for the whole document (first one found); running heads that
  change per chapter, or differ on odd/even pages, are not reproduced, and they also appear on
  pages that had none in the source.
- A footnote reference set as a separate raised glyph is kept inside its paragraph but may land
  at the end of its line rather than at the exact character.
- Multi-column zones are emitted as two equal Word columns; three or more columns and unequal
  widths fall back to reading-order flow.
- Display text larger than body size (pull quotes) is classified as a heading.
- Heading and list detection are heuristics over font size, weight and position. Documents whose
  headings share the body font size and weight are not detected as headings.
- Borderless tables are detected when every row has the same number of aligned cells; ragged
  whitespace tables fall back to tab-separated text.
- Footnote-style lines stay in the body where they appeared (not converted to Word footnotes).
- Soft-masked (transparent) images are embedded without their alpha channel; vector drawings are
  not converted (except horizontal separator rules).
- Rotated pages and vertical text are extracted but not specially laid out.
