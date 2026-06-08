# Third-party libraries used by Ebook Reader

All libraries are self-hosted (no CDN at runtime) and use permissive licenses
compatible with SLiMS (GPLv3). None of these are Koodo Reader's proprietary
"Kookit" engine.

| Library  | Version | License      | Path                      | Purpose                         |
|----------|---------|--------------|---------------------------|---------------------------------|
| epub.js  | 0.3.93  | BSD-3-Clause | `epubjs/epub.min.js`      | EPUB parsing & pagination       |
| JSZip    | 3.10.1  | MIT          | `jszip/jszip.min.js`      | Unzip EPUB (epub.js dependency) |
| PDF.js   | bundled | Apache-2.0   | reused from `../../../../js/pdfjs/build/` | PDF rendering    |

PDF.js is reused from the PDF.js build that already ships with SLiMS
(`js/pdfjs/build/pdf.js` + `pdf.worker.js`, exposed as `window.pdfjsLib`),
so it is not duplicated here.
