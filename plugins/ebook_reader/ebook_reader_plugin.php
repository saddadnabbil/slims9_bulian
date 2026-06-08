<?php
/**
 * Plugin Name: Ebook Reader
 * Plugin URI: https://github.com/slims/ebook_reader
 * Description: In-browser ereader for PDF & EPUB attachments (PDF.js + epub.js) with per-member reading progress, bookmarks, theme and font controls. Inspired by Google Play Books.
 * Version: 1.1.0
 * Author: SLiMS
 * Author URI: https://slims.web.id
 */

use SLiMS\Plugins;

defined('INDEX_AUTH') OR die('Direct access not allowed!');

$plugin = Plugins::getInstance();

/* OPAC hidden route: full-screen reader (?p=ebook_reader&fid=N&bid=N) */
$plugin->registerMenu('opac', 'Ebook Reader', __DIR__ . '/reader.php');

/* OPAC hidden route: JSON API (?p=ebook_api&act=...) */
$plugin->registerMenu('opac', 'Ebook Api', __DIR__ . '/api.php');

/* OPAC visible page: member's reading list */
$plugin->registerMenu('opac', 'My Reading', __DIR__ . '/my_reading.php');

/* Admin menu under Bibliography: reading stats */
$plugin->registerMenu('bibliography', __('Ebook Reading Report'), __DIR__ . '/index.php');

/**
 * Inject the Read button (detail page) and ebook badges (list/search pages).
 *
 * CONTENT_BEFORE_LOAD is the correct hook (CONTENT_AFTER_LOAD is unreachable
 * because parseToTemplate() calls exit before hookAfterContent ever runs).
 *
 * We use ob_start() with an output-filter callback to inject the script tag
 * just before </body>. This avoids the problem of show_detail.inc.php
 * overwriting $opac->metadata with Dublin Core tags.
 *
 * Stack: our ob_start($filter) is the OUTER buffer. handle() adds an INNER
 * ob_start(). parseToTemplate() pops the inner buffer with ob_get_clean() and
 * the template renders into the outer (our) buffer. exit flushes it through
 * the callback.
 *
 * data-swb passes the site base URL so the script can build index.php?p= routes
 * (plugins/ directory blocks direct PHP execution).
 */
$plugin->registerHook(Plugins::CONTENT_BEFORE_LOAD, function ($opac) {
    $p = $_GET['p'] ?? '';
    $injectPages = ['show_detail', 'search', 'browse_subject', 'browse_author', 'browse_title', ''];
    if (!in_array($p, $injectPages, true)) return;

    $src = SWB . 'plugins/ebook_reader/assets/inject-read-button.js';
    $swb = htmlspecialchars(SWB, ENT_QUOTES);
    $tag = '<script src="' . $src . '" data-swb="' . $swb . '" defer></script>';

    ob_start(function ($buffer) use ($tag) {
        return str_replace('</body>', $tag . "\n</body>", $buffer);
    });
});
