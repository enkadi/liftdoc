# PDF → Word Converter: Test Set

Sample PDFs for manually and automatically testing the DocLift (upload → convert → download `.docx`).

## Layout
```
test-pdfs/
├── README.md                  <- this file (usage notes)
├── EXPECTED_OUTCOMES.md       <- per-sample checklist and pass/fail notes
└── samples/                   <- 12 PDFs (all synthetic)
```

## Quick start
1. Upload each PDF in `samples/` through the web UI (or POST it to the backend endpoint).
2. Download the resulting `.docx` and open it in Microsoft Word (and ideally Google Docs / LibreOffice).
3. Walk through the matching section in `EXPECTED_OUTCOMES.md` and tick each item.
4. Record the result in the **Result** column of the summary table (Pass / Partial / Fail + a short note).


## Groups
| Group | Samples | Purpose |
|---|---|---|
| Core layout | 01-06 | The cases the converter must handle well |
| Robustness | 07-09 | Unsupported or failure-path inputs; must fail gracefully |
| Scale and variety | 10-12 | Performance, page-size changes, repeated page furniture |

## Rating scale
- **Pass**: every "Must" item met.
- **Partial**: all "Must" items met except minor formatting; or "Should" items missed.
- **Fail**: any "Must" item missed (lost text, scrambled order, crash, silent bad output).

## Notes
- The error-path samples (07, 09) pass when the user sees a clear message, not when a `.docx` is produced.
- Password for `09_password_protected.pdf` is `test123`.
- Keep the files small; add new edge cases as `13_...pdf` onward and add a section to `EXPECTED_OUTCOMES.md`.
- For frontend testing, the error-path files are the best way to check your UI's error state.
