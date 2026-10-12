# Expected Outcomes

Legend: **Must** = required to pass, **Should** = nice to have (Partial if missed).

## Summary
| # | File | Pages | Focus | Result | Notes |
|---|---|---|---|---|---|
| 01 | 01_single_column_text.pdf | 2 | Plain prose | | |
| 02 | 02_two_column_article.pdf | 2 | Two-column reading order | | |
| 03 | 03_headings_and_lists.pdf | 1 | Headings, bullet/numbered/nested lists, inline styles | | |
| 04 | 04_tables.pdf | 3 | Simple, merged, borderless, multi-page tables | | |
| 05 | 05_images.pdf | 2 | Embedded images and captions | | |
| 06 | 06_mixed_layout.pdf | 1 | Columns + image + table + list | | |
| 07 | 07_scanned_image_only.pdf | 1 | No text layer (needs OCR) | | |
| 08 | 08_special_characters.pdf | 1 | Unicode, symbols, sub/superscripts | | |
| 09 | 09_password_protected.pdf | 2 | Encrypted input | | |
| 10 | 10_large_40_pages.pdf | 40 | Performance / scale | | |
| 11 | 11_mixed_orientation.pdf | 3 | Portrait + landscape, Letter + A4 | | |
| 12 | 12_header_footer_footnotes.pdf | 1 | Page furniture | | |

---

## 01 - Single column text (2 pages)
- [ ] **Must** All paragraphs present, none truncated or duplicated
- [ ] **Must** Title appears first and is visually larger/centered
- [ ] **Must** Paragraphs stay separate (no merging into one block, no one-line-per-paragraph)
- [ ] **Should** No hard line breaks inside paragraphs (text reflows when the Word window is resized)
- [ ] **Should** Title uses Word "Title" or a Heading style

## 02 - Two-column article (2 pages)
- [ ] **Must** Title and author line first, spanning the full width
- [ ] **Must** Reading order is the **entire left column, then the right column**, not alternating lines across columns
- [ ] **Must** Section headings ("Section 1".."Section 4") appear in order
- [ ] **Should** Output is a real two-column section, or clean single-column flow
- [ ] **Should** Page 2 columns also read in the correct order

## 03 - Headings and lists (1 page, A4)
- [ ] **Must** "Project Handbook" is the title; "1. Overview", "2. Process", "3. Styles" are level-1 headings
- [ ] **Must** "1.1 Goals", "2.1 Nested example" are level-2; "1.1.1 Non-goals" is level-3
- [ ] **Must** Bullet lists remain bullets; numbered list keeps 1-4 in order
- [ ] **Should** Headings use Word Heading 1/2/3 styles (check the Navigation Pane)
- [ ] **Should** Nested list (Frontend / Backend) shows two indent levels
- [ ] **Should** Bold, italic, underline, bold-italic preserved; hyperlink stays clickable

## 04 - Tables (3 pages)
- [ ] **Must** Table A: 5 rows x 4 columns, all values in the correct cells, header row distinguishable
- [ ] **Must** Table D (60 rows): no rows lost or duplicated across the page break
- [ ] **Must** Table B: values land under the right columns even if merged cells are flattened
- [ ] **Should** Table B keeps the merged header cells (Sales over Online/In-person)
- [ ] **Should** Header row repeats on each page for Table D
- [ ] **Should** Table C (borderless) becomes a table or aligned "Name: / Role:" text, not run-together text
- [ ] **Should** Tables are real Word tables (selectable cells), not images or tab-separated text

## 05 - Images (2 pages)
- [ ] **Must** All 4 images present (1 banner, 2 squares, 1 wide image)
- [ ] **Must** Images sit near their captions and in the original order
- [ ] **Must** Text after an image does not overlap it
- [ ] **Should** Aspect ratios preserved, no stretching; image resolution not visibly degraded
- [ ] **Should** Captions ("Figure 1", "Figure 2") remain as text, not baked into images
- [ ] **Should** The two side-by-side squares stay side by side (or stack cleanly)

## 06 - Mixed layout (1 page)
- [ ] **Must** Title/subtitle first, then the content in sensible reading order (left column then right column)
- [ ] **Must** Bullet list (3 items), the image, and the 3x3 pricing table all present
- [ ] **Must** No text lost
- [ ] **Should** Headings Highlights / Pricing / Outlook retained as headings
- [ ] **Should** Table and image not overlapping body text
- [ ] This is the "everything at once" test: a Partial here with Pass on 01-05 is acceptable

## 07 - Scanned, image-only (1 page)
This PDF has **no text layer**; plain text extraction returns nothing.
- [ ] **Must** No crash, no hang, no empty 0-byte download
- [ ] **Must** One of the following is true, and the user is told which:
  - (a) OCR is supported and the output contains the recognisable text, **or**
  - (b) a clear message such as "This PDF appears to be scanned; text can't be extracted"
- [ ] **Should** If the output is the page embedded as a picture, the UI says so (a silent image-only .docx is a Partial)

## 08 - Special characters (1 page)
- [ ] **Must** Accented Latin letters correct: café, naïve, señor, Müller, Ångström
- [ ] **Must** Twi letters Ɛ, ɛ, ɔ preserved (not "?" or boxes)
- [ ] **Must** Currency symbols GH₵, €, £ and punctuation (— – “ ” ‘ ’ …) preserved
- [ ] **Should** Math symbols ≤ ≥ ≠ ± √ ∑ π preserved
- [ ] **Should** H2O / CO2 / x2: digits at least present in order; ideal output keeps subscript/superscript formatting
- [ ] **Should** Long "WWWW..." string doesn't break the layout or get dropped

## 09 - Password-protected (password: `test123`)
- [ ] **Must** Without a password: clear error such as "This PDF is password protected". No crash, no garbage output
- [ ] **Must** UI error state is shown to the user (not an endless spinner)
- [ ] **Should** If password entry is supported: with `test123`, output matches sample 01

## 10 - Large, 40 pages
- [ ] **Must** Completes without timeout or crash; all 40 chapter headings present, in order ("Chapter 1" to "Chapter 40")
- [ ] **Must** UI shows progress/loading state while waiting
- [ ] **Should** Conversion time recorded in the Notes column (target: set a threshold with the backend team, e.g. under 30 s)
- [ ] **Should** Output page count is roughly similar to the source (40 +/- a few)

## 11 - Mixed orientation (3 pages)
Page 1 Letter portrait, page 2 A4 landscape (with an 8-column table), page 3 Letter portrait.
- [ ] **Must** All three pages' content present in order
- [ ] **Must** The 8-column x 8-row table is complete, with no columns cut off
- [ ] **Should** Page 2 is landscape in the .docx, or the table still fits on a portrait page
- [ ] **Should** Page sizes are preserved (or consistently normalised)

## 12 - Header, footer, footnotes (1 page)
Page furniture: "ACME Research - Confidential Draft" at the top, "Page 1" at the bottom, and four footnote-style lines.
- [ ] **Must** Body text complete
- [ ] **Must** The four footnote lines are present (as text or real footnotes)
- [ ] **Should** Header and footer are placed in the Word header/footer, not injected into the middle of the body
- [ ] **Should** Page number not duplicated inside paragraphs

---


