<?php
/**
 * Ebook Reader JSON API — routed via index.php?p=ebook_api&act=...
 *
 * This file is included by SLiMS OPAC router. Bootstrap is already done.
 * We clear the output buffer, set JSON headers and respond.
 */
defined('INDEX_AUTH') OR die('Direct access not allowed!');

require __DIR__ . '/lib/access.php';

use SLiMS\DB;

/* Clear OPAC buffer and take over the response */
while (ob_get_level()) { ob_end_clean(); }
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function ebook_reader_json($data, $code = 200)
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

$act = $_GET['act'] ?? '';
$db  = DB::getInstance();

/* ── attachment_meta ── */
if ($act === 'attachment_meta') {
    $bid  = (int)($_GET['bid'] ?? 0);
    $stmt = $db->prepare(
        "SELECT f.file_id, f.file_title, f.file_name, f.mime_type
         FROM biblio_attachment AS att
         LEFT JOIN files AS f ON att.file_id = f.file_id
         WHERE att.biblio_id = :bid AND att.access_type = 'public'"
    );
    $stmt->execute(['bid' => $bid]);

    $items = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $format = ebook_reader_detect_format($row['mime_type'], $row['file_name']);
        if ($format === null) continue;
        $items[] = [
            'fid'    => (int)$row['file_id'],
            'bid'    => $bid,
            'format' => $format,
            'title'  => $row['file_title'],
        ];
    }
    ebook_reader_json(['ok' => true, 'items' => $items]);
}

/* ── batch_ebook_check ── */
if ($act === 'batch_ebook_check') {
    $raw  = (string)($_GET['bids'] ?? '');
    $bids = array_values(array_filter(array_map('intval', explode(',', $raw))));
    if (empty($bids)) {
        ebook_reader_json(['ok' => true, 'ebooks' => []]);
    }

    $in   = implode(',', array_fill(0, count($bids), '?'));
    $stmt = $db->prepare(
        "SELECT att.biblio_id, f.file_id, f.file_name, f.mime_type
         FROM biblio_attachment AS att
         LEFT JOIN files AS f ON att.file_id = f.file_id
         WHERE att.biblio_id IN ($in) AND att.access_type = 'public'
         ORDER BY att.biblio_id, att.file_id"
    );
    $stmt->execute($bids);

    $seen   = [];
    $ebooks = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $bid = (int)$row['biblio_id'];
        if (isset($seen[$bid])) continue;
        $format = ebook_reader_detect_format($row['mime_type'], $row['file_name']);
        if ($format === null) continue;
        $seen[$bid] = true;
        $ebooks[]   = ['bid' => $bid, 'fid' => (int)$row['file_id'], 'format' => $format];
    }
    ebook_reader_json(['ok' => true, 'ebooks' => $ebooks]);
}

/* All remaining actions require a member session */
if (!utility::isMemberLogin()) {
    ebook_reader_json(['ok' => false, 'error' => 'login_required'], 401);
}
$memberId = (int)$_SESSION['mid'];

/* ── get_state ── */
if ($act === 'get_state') {
    $fid  = (int)($_GET['fid'] ?? 0);
    $stmt = $db->prepare(
        'SELECT location, percent, settings FROM ebook_reading_progress
         WHERE member_id = :mid AND file_id = :fid LIMIT 1'
    );
    $stmt->execute(['mid' => $memberId, 'fid' => $fid]);
    ebook_reader_json(['ok' => true, 'state' => $stmt->fetch(PDO::FETCH_ASSOC) ?: null]);
}

/* ── list_bookmarks ── */
if ($act === 'list_bookmarks') {
    $fid  = (int)($_GET['fid'] ?? 0);
    $stmt = $db->prepare(
        'SELECT id, location, label, excerpt, created_at FROM ebook_bookmark
         WHERE member_id = :mid AND file_id = :fid ORDER BY id DESC'
    );
    $stmt->execute(['mid' => $memberId, 'fid' => $fid]);
    ebook_reader_json(['ok' => true, 'bookmarks' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

/* ── list_notes ── */
if ($act === 'list_notes') {
    $fid  = (int)($_GET['fid'] ?? 0);
    $stmt = $db->prepare(
        'SELECT id, location, excerpt, note_text, color, created_at FROM ebook_note
         WHERE member_id = :mid AND file_id = :fid ORDER BY id DESC'
    );
    $stmt->execute(['mid' => $memberId, 'fid' => $fid]);
    ebook_reader_json(['ok' => true, 'notes' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

/* Write actions: POST only */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    ebook_reader_json(['ok' => false, 'error' => 'method_not_allowed'], 405);
}

/* ── remove_bookmark ── */
if ($act === 'remove_bookmark') {
    $id   = (int)($_POST['id'] ?? 0);
    $stmt = $db->prepare('DELETE FROM ebook_bookmark WHERE id = :id AND member_id = :mid');
    $stmt->execute(['id' => $id, 'mid' => $memberId]);
    ebook_reader_json(['ok' => true, 'deleted' => $stmt->rowCount()]);
}

/* ── remove_note ── */
if ($act === 'remove_note') {
    $id   = (int)($_POST['id'] ?? 0);
    $stmt = $db->prepare('DELETE FROM ebook_note WHERE id = :id AND member_id = :mid');
    $stmt->execute(['id' => $id, 'mid' => $memberId]);
    ebook_reader_json(['ok' => true, 'deleted' => $stmt->rowCount()]);
}

/* Attachment validation for write actions */
$fid    = (int)($_POST['fid'] ?? 0);
$bid    = (int)($_POST['bid'] ?? 0);
$file_d = ebook_reader_get_attachment($fid, $bid);
if ($file_d === null || ebook_reader_access_status($file_d) !== 'ok') {
    ebook_reader_json(['ok' => false, 'error' => 'forbidden'], 403);
}

/* ── save_progress ── */
if ($act === 'save_progress') {
    $format   = ebook_reader_detect_format($file_d['mime_type'], $file_d['file_name']) ?? 'pdf';
    $location = (string)($_POST['location'] ?? '');
    $percent  = (float)($_POST['percent'] ?? 0);
    $settings = (string)($_POST['settings'] ?? '');
    $now      = date('Y-m-d H:i:s');

    $stmt = $db->prepare(
        'INSERT INTO ebook_reading_progress
            (member_id, biblio_id, file_id, format, location, percent, settings, last_read, created_at)
         VALUES (:mid, :bid, :fid, :format, :location, :percent, :settings, :now, :now)
         ON DUPLICATE KEY UPDATE
            biblio_id = VALUES(biblio_id),
            format    = VALUES(format),
            location  = VALUES(location),
            percent   = VALUES(percent),
            settings  = VALUES(settings),
            last_read = VALUES(last_read)'
    );
    $stmt->execute([
        'mid' => $memberId, 'bid' => $bid, 'fid' => $fid, 'format' => $format,
        'location' => $location, 'percent' => $percent, 'settings' => $settings, 'now' => $now,
    ]);
    ebook_reader_json(['ok' => true]);
}

/* ── add_bookmark ── */
if ($act === 'add_bookmark') {
    $location = (string)($_POST['location'] ?? '');
    if ($location === '') ebook_reader_json(['ok' => false, 'error' => 'empty_location'], 422);

    $label   = mb_substr((string)($_POST['label'] ?? ''), 0, 255);
    $excerpt = (string)($_POST['excerpt'] ?? '');

    $stmt = $db->prepare(
        'INSERT INTO ebook_bookmark (member_id, biblio_id, file_id, location, label, excerpt, created_at)
         VALUES (:mid, :bid, :fid, :location, :label, :excerpt, :now)'
    );
    $stmt->execute([
        'mid' => $memberId, 'bid' => $bid, 'fid' => $fid,
        'location' => $location, 'label' => $label, 'excerpt' => $excerpt,
        'now' => date('Y-m-d H:i:s'),
    ]);
    ebook_reader_json(['ok' => true, 'id' => (int)$db->lastInsertId()]);
}

/* ── add_note ── */
if ($act === 'add_note') {
    $location  = (string)($_POST['location'] ?? '');
    if ($location === '') ebook_reader_json(['ok' => false, 'error' => 'empty_location'], 422);

    $excerpt   = mb_substr((string)($_POST['excerpt'] ?? ''), 0, 1000);
    $note_text = (string)($_POST['note_text'] ?? '');
    $color_raw = (string)($_POST['color'] ?? 'yellow');
    $color     = preg_match('/^(yellow|red|green|blue)$/', $color_raw) ? $color_raw : 'yellow';

    $stmt = $db->prepare(
        'INSERT INTO ebook_note (member_id, biblio_id, file_id, location, excerpt, note_text, color, created_at)
         VALUES (:mid, :bid, :fid, :location, :excerpt, :note_text, :color, :now)'
    );
    $stmt->execute([
        'mid' => $memberId, 'bid' => $bid, 'fid' => $fid,
        'location' => $location, 'excerpt' => $excerpt,
        'note_text' => $note_text, 'color' => $color,
        'now' => date('Y-m-d H:i:s'),
    ]);
    ebook_reader_json(['ok' => true, 'id' => (int)$db->lastInsertId()]);
}

ebook_reader_json(['ok' => false, 'error' => 'unknown_action'], 400);
