# Ebook Reader — SLiMS plugin

In-browser ereader for **PDF** (PDF.js) and **EPUB** (epub.js) attachments,
with per-member reading progress and bookmarks. Inspired by Koodo Reader's UX
(table of contents, bookmarks, font/theme controls) — but built with permissive
open-source libraries only.

## What it does
- Adds a **"Baca / Read"** button next to PDF/EPUB attachments on the OPAC
  bibliography detail page (`?p=show_detail`).
- Opens a **full-screen reader** (`reader.php`) that resumes from the member's
  last position and supports TOC, bookmarks, progress bar, theme toggle and
  (EPUB) font size.
- Saves progress & bookmarks per member to `ebook_reading_progress` and
  `ebook_bookmark`.
- Gives members a **"My Reading"** page (`?p=my_reading`) to continue reading
  and review bookmarks.
- Gives admins an **"Ebook Reading Report"** under the Bibliography module.

## Install
1. Copy this folder to `plugins/ebook_reader/`.
2. Admin → **System → Plugins** → activate **Ebook Reader**. Activation runs the
   migrations and creates the two tables automatically.

## How ebooks get in
Ebooks are the normal **bibliography attachments**. Upload a `.pdf` or `.epub`
to a biblio (admin → Bibliography → edit → Attachments) with
`access_type = public`. The reader detects the format from `mime_type`
(`application/pdf` / `application/epub+zip`) with a filename-extension fallback.

## Architecture (no core files edited)
- `ebook_reader_plugin.php` — manifest; registers menus + the `CONTENT_AFTER_LOAD`
  hook that injects the Read button.
- `reader.php` — full-screen reader page (bootstraps SLiMS, enforces member
  access via `lib/access.php`).
- `api.php` — JSON endpoints: `attachment_meta`, `get_state`, `save_progress`,
  `add_bookmark`, `remove_bookmark`, `list_bookmarks`. `member_id` always comes
  from the session.
- `my_reading.php` — OPAC "My Reading" page.
- `index.php` — admin reading report.
- `assets/` — reader UI (CSS/JS) + vendored epub.js & JSZip. PDF.js is reused
  from the SLiMS-bundled `js/pdfjs/build/`. See `assets/vendor/CREDITS.md`.

## Access control
Reading requires a member login (progress is per-member). Per-attachment
member-type restrictions (`access_limit`) are honoured, mirroring
`lib/contents/fstream.inc.php`. File bytes are served through the existing
`?p=fstream` / `?p=fstream-pdf` endpoints, which re-validate access server-side.
