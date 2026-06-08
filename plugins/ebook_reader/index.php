<?php
/**
 * Admin page (Bibliography module): Ebook Reading Report.
 *
 * Read-only overview of member reading progress. Reached through the
 * plugin container at admin/plugin_container.php?mod=bibliography&id=...
 */

defined('INDEX_AUTH') OR die('Direct access not allowed!');

// IP based access limitation
require LIB . 'ip_based_access.inc.php';
do_checkIP('smc');
do_checkIP('smc-bibliography');

// start the admin session
require SB . 'admin/default/session.inc.php';

use SLiMS\DB;

// privilege checking
if (!utility::havePrivilege('bibliography', 'r')) {
    die('<div class="errorBox">' . __('You are not authorized to view this section') . '</div>');
}

$db = DB::getInstance();
$rows = $db->query(
    'SELECT m.member_name, b.title, f.file_title, p.format, p.percent, p.last_read
     FROM ebook_reading_progress AS p
     JOIN biblio AS b ON p.biblio_id = b.biblio_id
     LEFT JOIN member AS m ON p.member_id = m.member_id
     LEFT JOIN files AS f ON p.file_id = f.file_id
     ORDER BY p.last_read DESC
     LIMIT 500'
)->fetchAll(PDO::FETCH_ASSOC);
?>

<div class="menuBox">
    <div class="menuBoxInner printIcon">
        <div class="per_title">
            <h2><?= __('Ebook Reading Report') ?></h2>
        </div>
        <div class="infoBox">
            <?= __('Members reading activity for PDF/EPUB ebooks.') ?>
        </div>
    </div>
</div>

<table class="table table-striped">
    <thead>
        <tr>
            <th><?= __('Member') ?></th>
            <th><?= __('Title') ?></th>
            <th><?= __('File') ?></th>
            <th><?= __('Format') ?></th>
            <th><?= __('Progress') ?></th>
            <th><?= __('Last Read') ?></th>
        </tr>
    </thead>
    <tbody>
    <?php if (!$rows): ?>
        <tr><td colspan="6"><?= __('No reading activity yet.') ?></td></tr>
    <?php else: foreach ($rows as $r): ?>
        <tr>
            <td><?= htmlspecialchars($r['member_name'] ?? '-', ENT_QUOTES) ?></td>
            <td><?= htmlspecialchars($r['title'], ENT_QUOTES) ?></td>
            <td><?= htmlspecialchars($r['file_title'] ?? '-', ENT_QUOTES) ?></td>
            <td><?= strtoupper(htmlspecialchars($r['format'], ENT_QUOTES)) ?></td>
            <td><?= round((float)$r['percent']) ?>%</td>
            <td><?= htmlspecialchars($r['last_read'], ENT_QUOTES) ?></td>
        </tr>
    <?php endforeach; endif; ?>
    </tbody>
</table>
