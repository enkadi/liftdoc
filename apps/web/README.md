# DocLift Frontend (Web)

Next.js web application for DocLift — a high-fidelity PDF to editable Microsoft Word (`.docx`) document converter.

Provides drag-and-drop file upload, real-time conversion progress tracking across pipeline stages, structural fidelity metrics inspection, and automated 30-minute file purge management.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack, standalone output) |
| **Runtime & Language** | React 19, TypeScript 5 |
| **Styling** | Tailwind CSS v4, Lucide Icons, tw-animate-css |
| **UI Primitives** | Radix UI, Class Variance Authority (CVA), Sonner (Toasts) |
| **Client-Side PDF** | `pdfjs-dist` (client-side pre-validation & page count inspection) |
| **Testing** | Vitest 5, React Testing Library, jsdom, fake-indexeddb |

---

## Quick Start

### Prerequisites
* Node.js 22+
* DocLift backend running on `http://localhost:8080` (see [`apps/backend-py/README.md`](../backend-py/README.md))

### 1. Installation
```bash
cd apps/web
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env.local
```

The frontend rewrites `/api/v1/*` requests server-side to `BACKEND_URL`:
```ini
BACKEND_URL=http://localhost:8080
```

### 3. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Application Architecture & Workflow

The user journey is split into three seamless stages orchestrated by `ConversionContext`:

```
┌─────────────────┐       Upload & Validate      ┌──────────────────┐
│  Upload Screen  │ ───────────────────────────► │ Progress Screen  │
└─────────────────┘                              └──────────────────┘
         ▲                                                │
         │                Convert Another File            ▼ Conversion Complete
         └────────────────────────────────────── ┌──────────────────┐
                                                 │  Results Screen  │
                                                 └──────────────────┘
```

### 1. Upload Screen (`src/components/upload/`)
* **`DropZone`**: Drag-and-drop or file picker accepting PDF documents up to 10 MB.
* **Client-Side Pre-Validation**: Verifies file extension, MIME type, and parses document page count via `pdfjs-dist` before uploading.
* **IndexedDB Draft Recovery**: Persists file drafts locally so progress is not lost on accidental browser refresh.

### 2. Progress Screen (`src/components/progress/`)
* **Single Polling Loop (`useJobStatus`)**: Polls `GET /api/v1/jobs/:id` every 3 seconds with `cache: "no-store"` to prevent stale HTTP caching.
* **5-Stage Pipeline Stepper (`JobStepper`)**:
  1. `LOADING_SOURCE`: File upload and verification
  2. `EXTRACTING_CONTENT`: Extracting text spans, fonts, images & tables
  3. `RECOVERING_STRUCTURE`: Reconstructing columns, headings, lists & tables
  4. `GENERATING_DOCUMENT`: Building DOCX styles and layouts
  5. `COMPLETED`: Final document generated
* **Smoothed Progress Bar (`useSmoothedProgress`)**: Prevents jerky progress bar jumps by interpolating percentage increments between backend poll updates.
* **Error Resilience (`ErrorStateCard`)**: Handles encrypted/scanned PDF rejection codes (`INVALID_PDF`, `ENCRYPTED_PDF`) with actionable guidance.

### 3. Results Screen (`src/components/results/`)
* **Direct DOCX Download**: Downloads the generated `.docx` file preserving original formatting.
* **Fidelity Metrics Card (`FidelityScoreCard`, `SummaryCard`)**: Compares source word count, headings detected, tables, and images preserved.
* **30-Minute Auto-Purge Countdown (`usePurgeCountdown`)**: Tracks file retention window matching the backend purge schedule, displaying countdown timer and expiration warnings.

---

## Directory Structure

```text
apps/web/
├── src/
│   ├── app/                      # Next.js App Router entry points & global styles
│   │   ├── hooks/                # Stateful UI hooks (useJobStatus, useSmoothedProgress)
│   │   ├── layout.tsx            # Root layout with theme & toaster providers
│   │   └── page.tsx              # Main page orchestrating active views
│   ├── components/               # React UI Components
│   │   ├── layout/               # Header, Footer
│   │   ├── progress/             # ProgressScreen, ProgressCard, HeaderBar, ErrorStateCard
│   │   ├── results/              # ResultsScreen, FidelityScoreCard, SummaryCard, ChecklistCard
│   │   ├── ui/                   # Shared UI primitives (Button, Card, Stepper, Progress, Spinner)
│   │   └── upload/               # UploadScreen, DropZone, PreservationCard
│   ├── context/                  # ConversionContext (central state, session & view routing)
│   ├── data/                     # Preservation highlights and result metadata definitions
│   └── lib/                      # Client utilities & API integration
│       ├── conversionSession.ts  # Session storage & hydration
│       ├── downloadApi.ts        # DOCX file download handler
│       ├── errorMapping.ts       # Backend error contract to user-facing copy
│       ├── fileStorage.ts        # IndexedDB draft file storage
│       ├── jobApi.ts             # Backend job status fetcher & JobStatusError
│       ├── uploadApi.ts          # Multipart PDF upload client
│       └── usePurgeCountdown.ts  # 30-minute auto-purge countdown hook
├── public/                       # Static branding and vector icons
├── next.config.ts                # Next.js standalone output & /api/v1/* proxy rewrite
└── package.json                  # Scripts & dependencies
```

---

## Available Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Starts local Next.js dev server with Turbopack on port 3000 |
| `npm run build` | Builds optimized standalone production bundle |
| `npm run start` | Runs the production standalone server |
| `npm test` | Runs all 40 Vitest test suites (213 tests) |
| `npm run test:watch` | Runs Vitest in interactive watch mode |
| `npm run lint` | Runs ESLint 9 checks |

---

## API Proxy Configuration

The Next.js development and production servers proxy backend API requests automatically:

```typescript
// next.config.ts
async rewrites() {
  return [
    {
      source: "/api/v1/:path*",
      destination: `${process.env.BACKEND_URL ?? "http://localhost:8080"}/api/v1/:path*`,
    },
  ];
}
```

This prevents CORS complications in local development and aligns with the production deployment topology.
