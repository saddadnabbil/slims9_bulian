<?php
/**
 * Full-screen ebook reader — routed via index.php?p=ebook_reader&fid=N&bid=N
 *
 * This file is included by the SLiMS OPAC router (Opac::loadPluginPath).
 * SLiMS has already bootstrapped sysconfig, member_session and ob_start().
 * We clear the buffer, output a standalone HTML page and exit.
 */
defined('INDEX_AUTH') OR die('Direct access not allowed!');

require __DIR__ . '/lib/access.php';

use SLiMS\DB;

$fid = (int)($_GET['fid'] ?? 0);
$bid = (int)($_GET['bid'] ?? 0);

$file_d = ebook_reader_get_attachment($fid, $bid);
if ($file_d === null) {
    ob_end_clean();
    http_response_code(404);
    die('<div style="font-family:sans-serif;padding:2rem">Ebook tidak ditemukan.</div>');
}

$status = ebook_reader_access_status($file_d);
if ($status === 'login') {
    $dest = SWB . 'index.php?p=ebook_reader&fid=' . $fid . '&bid=' . $bid;
    ob_end_clean();
    header('Location: ' . SWB . 'index.php?p=member&destination=' . urlencode($dest));
    exit;
}
if ($status === 'denied') {
    ob_end_clean();
    http_response_code(403);
    die('<div style="font-family:sans-serif;padding:2rem">Anda tidak berhak membaca ebook ini.</div>');
}

$format = ebook_reader_detect_format($file_d['mime_type'], $file_d['file_name']);
if ($format === null) {
    ob_end_clean();
    http_response_code(415);
    die('<div style="font-family:sans-serif;padding:2rem">File ini bukan ebook PDF/EPUB yang bisa dibaca.</div>');
}

$db = DB::getInstance();
$stmt = $db->prepare('SELECT location, percent, settings FROM ebook_reading_progress WHERE member_id = :mid AND file_id = :fid LIMIT 1');
$stmt->execute(['mid' => (int)$_SESSION['mid'], 'fid' => $fid]);
$state = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;

$fileUrl = SWB . 'index.php?p=' . ($format === 'pdf' ? 'fstream-pdf' : 'fstream') . '&fid=' . $fid . '&bid=' . $bid;

$config = [
    'fid'       => $fid,
    'bid'       => $bid,
    'format'    => $format,
    'title'     => $file_d['file_title'] ?: $file_d['title'],
    'fileUrl'   => $fileUrl,
    'apiBase'   => SWB . 'index.php?p=ebook_api',
    'backUrl'   => SWB . 'index.php?p=show_detail&id=' . $bid,
    'pdfLib'    => SWB . 'js/pdfjs/build/pdf.js',
    'pdfWorker' => SWB . 'js/pdfjs/build/pdf.worker.js',
    'state'     => $state,
];

$assets = SWB . 'plugins/ebook_reader/assets/';
$title  = htmlspecialchars($config['title'], ENT_QUOTES);
$lang   = htmlspecialchars($sysconf['default_lang'] ?? 'id', ENT_QUOTES);

/* SVG icon — inline to avoid extra requests */
function er_svg($d) {
    return '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="' . $d . '"/></svg>';
}

/* Discard the OPAC template buffer and take over the full response */
while (ob_get_level()) { ob_end_clean(); }
/* epub.js renders chapters via blob: iframes — remove the restrictive default CSP */
header_remove('Content-Security-Policy');
?>
<!DOCTYPE html>
<html lang="<?= $lang ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title><?= $title ?></title>
<link rel="stylesheet" href="<?= $assets ?>reader.css">
</head>
<body class="er-light er-format-<?= $format ?>">

<div id="er-app">

    <!-- ══════════ TOP TOOLBAR ══════════ -->
    <header id="er-toolbar">
        <a id="er-back" class="er-icon-btn" href="<?= htmlspecialchars($config['backUrl'], ENT_QUOTES) ?>" title="Kembali">
            <?= er_svg('M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z') ?>
        </a>

        <h1 id="er-title" title="<?= $title ?>"><?= $title ?></h1>

        <div class="er-divider"></div>


        <button id="er-toggle-settings" class="er-icon-btn" title="Tampilan">
            <?= er_svg('M12 15.5A3.5 3.5 0 018.5 12 3.5 3.5 0 0112 8.5a3.5 3.5 0 013.5 3.5 3.5 3.5 0 01-3.5 3.5m7.43-2.92c.04-.36.07-.74.07-1.08 0-.34-.03-.73-.07-1.08l2.3-1.8c.21-.16.27-.46.13-.7l-2.18-3.78a.55.55 0 00-.67-.24l-2.72 1.1c-.56-.43-1.18-.78-1.86-1.05L14 2.42A.54.54 0 0013.45 2h-4.36a.55.55 0 00-.54.42l-.41 2.93c-.67.27-1.3.62-1.86 1.05L3.57 5.3a.55.55 0 00-.67.24L.72 9.3c-.14.24-.08.54.13.7l2.3 1.8c-.04.35-.07.73-.07 1.08 0 .35.03.72.07 1.08l-2.3 1.8c-.21.16-.27.46-.13.7l2.18 3.78c.13.24.43.31.67.24l2.72-1.1c.56.43 1.18.78 1.86 1.05l.41 2.93c.09.23.3.42.54.42h4.36c.24 0 .45-.19.54-.42l.41-2.93a7.3 7.3 0 001.86-1.05l2.72 1.1c.25.08.54 0 .67-.24l2.18-3.78c.14-.24.08-.54-.13-.7l-2.3-1.8z') ?>
        </button>

        <button id="er-add-bookmark" class="er-icon-btn" title="Tambah bookmark">
            <?= er_svg('M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z') ?>
        </button>

        <button id="er-toggle-bookmarks" class="er-icon-btn" title="Daftar bookmark">
            <?= er_svg('M17 11H3v2h14v-2zm4-4H3v2h18V7zM3 17h9v-2H3v2zm15.41-2.83L17 12.75l-1.41 1.41L18 17l5-5-1.41-1.41-3.18 3.18z') ?>
        </button>

        <div class="er-divider"></div>

        <button id="er-toggle-toc" class="er-icon-btn" title="Daftar isi">
            <?= er_svg('M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z') ?>
        </button>
    </header>

    <!-- ══════════ OVERLAY ══════════ -->
    <div id="er-overlay" class="er-overlay"></div>

    <!-- ══════════ TOC PANEL (left) ══════════ -->
    <aside id="er-panel-toc" class="er-panel">
        <div class="er-panel-head">
            <span>Daftar Isi</span>
            <button class="er-panel-close er-close-panel">&#x2715;</button>
        </div>
        <div id="er-toc" class="er-panel-body"></div>
    </aside>

    <!-- ══════════ BOOKMARK / NOTES PANEL (right) ══════════ -->
    <aside id="er-panel-bookmarks" class="er-panel er-panel-right">
        <div class="er-panel-head">
            <span>Koleksi</span>
            <button class="er-panel-close er-close-panel">&#x2715;</button>
        </div>
        <?php if ($format === 'epub'): ?>
        <div class="er-panel-tabs">
            <button class="er-panel-tab er-panel-tab-active" data-panel-tab="bookmarks">Bookmark</button>
            <button class="er-panel-tab" data-panel-tab="notes">Catatan</button>
        </div>
        <?php endif; ?>
        <div id="er-bookmarks" class="er-panel-body er-tab-pane er-tab-pane-active"></div>
        <?php if ($format === 'epub'): ?>
        <div id="er-notes" class="er-panel-body er-tab-pane" style="display:none"></div>
        <?php endif; ?>
    </aside>

    <!-- ══════════ SETTINGS PANEL (right) ══════════ -->
    <aside id="er-panel-settings" class="er-panel er-panel-right">
        <div class="er-panel-head">
            <span>Tampilan</span>
            <button class="er-panel-close er-close-panel">&#x2715;</button>
        </div>
        <div class="er-panel-body">
            <div class="er-settings-section">
                <div class="er-settings-label">Tema</div>
                <div class="er-theme-row">
                    <button class="er-theme-btn active" data-theme="light">
                        <span class="er-theme-swatch"></span>Terang
                    </button>
                    <button class="er-theme-btn" data-theme="sepia">
                        <span class="er-theme-swatch"></span>Sepia
                    </button>
                    <button class="er-theme-btn" data-theme="dark">
                        <span class="er-theme-swatch"></span>Gelap
                    </button>
                </div>
            </div>
            <?php if ($format === 'pdf'): ?>
            <div class="er-settings-section er-viewmode-section">
                <div class="er-settings-label">Tampilan Halaman</div>
                <div class="er-viewmode-row">
                    <button class="er-viewmode-btn active" data-vm="single">
                        <span class="er-viewmode-icon"><span></span></span>
                        Satu Halaman
                    </button>
                    <button class="er-viewmode-btn" data-vm="double">
                        <span class="er-viewmode-icon"><span></span><span></span></span>
                        Dua Halaman
                    </button>
                </div>
            </div>
            <?php endif; ?>
            <?php if ($format === 'epub'): ?>
            <div class="er-settings-section">
                <div class="er-settings-label">Tampilan</div>
                <div class="er-seg-row">
                    <button class="er-seg-btn er-seg-active" data-flow="paginated">
                        <?= er_svg('M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z') ?>
                        Halaman Asli
                    </button>
                    <button class="er-seg-btn" data-flow="scrolled-doc">
                        <?= er_svg('M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z') ?>
                        Teks Mengalir
                    </button>
                </div>
            </div>
            <div class="er-settings-section">
                <div class="er-settings-label">Zoom</div>
                <div class="er-select-wrap">
                    <select id="er-zoom-select" class="er-native-select">
                        <option value="fit-screen">Fit to screen</option>
                        <option value="fit-width">Fit to width</option>
                        <option value="100">100%</option>
                        <option value="150">150%</option>
                        <option value="200">200%</option>
                    </select>
                    <?= er_svg('M7 10l5 5 5-5z') ?>
                </div>
            </div>
            <div class="er-settings-section" id="er-layout-section">
                <div class="er-settings-label">Tata Letak Halaman</div>
                <div class="er-layout-row">
                    <button class="er-layout-btn" data-spread="auto" title="Otomatis">
                        <span class="er-layout-icon"><?= er_svg('M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3h5v2h-5V6zm0 4h5v2h-5v-2zm5 6h-5v-2h5v2zM7 6h4v2H7V6zm0 4h4v2H7v-2zm0 4h4v2H7v-2z') ?></span>
                        <span>Otomatis</span>
                    </button>
                    <button class="er-layout-btn" data-spread="always" title="Dua Halaman">
                        <span class="er-layout-icon"><?= er_svg('M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-6 0v18H6V4h6zm6 18h-5V4h5v14z') ?></span>
                        <span>Dua</span>
                    </button>
                    <button class="er-layout-btn er-layout-active" data-spread="none" title="Satu Halaman">
                        <span class="er-layout-icon"><?= er_svg('M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z') ?></span>
                        <span>Satu</span>
                    </button>
                </div>
            </div>
            <div class="er-settings-section">
                <div class="er-settings-label">Ukuran Teks</div>
                <div class="er-font-row">
                    <button id="er-font-dec2" class="er-font-adjust">&#x2212;</button>
                    <span id="er-font-size-display" class="er-font-size-val">100%</span>
                    <button id="er-font-inc2" class="er-font-adjust">&#x2B;</button>
                </div>
            </div>
            <?php endif; ?>
        </div>
    </aside>

    <!-- ══════════ MAIN READING AREA ══════════ -->
    <main id="er-main">
        <div id="er-viewport">
            <div id="er-viewer"></div>
        </div>

        <?php if ($format === 'epub'): ?>
        <div id="er-nav-prev" class="er-nav-zone er-nav-l" title="Halaman sebelumnya"></div>
        <div id="er-nav-next" class="er-nav-zone er-nav-r" title="Halaman berikutnya"></div>
        <?php endif; ?>

        <div id="er-loading">
            <div class="er-spinner"></div>
            <span>Memuat ebook&hellip;</span>
        </div>
    </main>

    <!-- ══════════ FOOTER PROGRESS + NAV ══════════ -->
    <footer id="er-footer">
        <div id="er-range-wrap">
            <div id="er-range-tip"></div>
            <input id="er-range" type="range" min="0" max="100" value="0" step="0.1">
        </div>
        <div class="er-footer-nav">
            <button id="er-prev" class="er-nav-btn" title="Sebelumnya">
                <?= er_svg('M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z') ?>
            </button>
            <span id="er-percent">0%</span>
            <button id="er-next" class="er-nav-btn" title="Selanjutnya">
                <?= er_svg('M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z') ?>
            </button>
        </div>
    </footer>

</div>

<?php if ($format === 'epub'): ?>
<div id="er-note-modal" class="er-note-modal">
    <div class="er-note-dialog">
        <div class="er-note-head">
            <div id="er-note-excerpt-display" class="er-note-excerpt-display"></div>
            <button id="er-note-close" class="er-note-close-btn">&#x2715;</button>
        </div>
        <textarea id="er-note-textarea" class="er-note-textarea" placeholder="Tulis catatan di sini&hellip;"></textarea>
        <div class="er-note-color-row">
            <span class="er-note-color-label">Warna sorotan:</span>
            <button class="er-note-color-dot er-nc-active" data-note-color="yellow" title="Kuning"></button>
            <button class="er-note-color-dot" data-note-color="red"    title="Merah"></button>
            <button class="er-note-color-dot" data-note-color="green"  title="Hijau"></button>
            <button class="er-note-color-dot" data-note-color="blue"   title="Biru"></button>
        </div>
        <div class="er-note-footer">
            <button id="er-note-cancel" class="er-note-btn er-note-btn-cancel">Batal</button>
            <button id="er-note-save" class="er-note-btn er-note-btn-save">Simpan Catatan</button>
        </div>
    </div>
</div>
<div id="er-hl-menu" class="er-hl-menu">
    <div class="er-hl-actions">
        <button class="er-hl-act" id="er-hl-note">
            <?= er_svg('M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z') ?>
            Catatan
        </button>
        <button class="er-hl-act" id="er-hl-copy">
            <?= er_svg('M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z') ?>
            Salin
        </button>
        <button class="er-hl-act" id="er-hl-search">
            <?= er_svg('M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z') ?>
            Cari di buku
        </button>
    </div>
    <div class="er-hl-sep"></div>
    <div class="er-hl-colors">
        <button class="er-hl-dot" data-color="yellow" title="Kuning"></button>
        <button class="er-hl-dot" data-color="red"    title="Merah"></button>
        <button class="er-hl-dot" data-color="green"  title="Hijau"></button>
        <button class="er-hl-dot" data-color="blue"   title="Biru"></button>
    </div>
</div>
<?php endif; ?>
<div id="er-toast" class="er-toast"></div>

<script>window.EBOOK_READER = <?= json_encode($config, JSON_UNESCAPED_SLASHES) ?>;</script>
<?php if ($format === 'epub'): ?>
<script src="<?= $assets ?>vendor/jszip/jszip.min.js"></script>
<script src="<?= $assets ?>vendor/epubjs/epub.min.js"></script>
<script src="<?= $assets ?>reader-epub.js"></script>
<?php else: ?>
<script src="<?= htmlspecialchars($config['pdfLib'], ENT_QUOTES) ?>"></script>
<script src="<?= $assets ?>reader-pdf.js"></script>
<?php endif; ?>
</body>
</html>
<?php exit;
