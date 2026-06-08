<?php
/**
 * OPAC page: "My Reading" (?p=my_reading)
 * Rendered inside the OPAC template.
 */
defined('INDEX_AUTH') OR die('Direct access not allowed!');

use SLiMS\DB;

$readerUrl = SWB . 'plugins/ebook_reader/reader.php';
?>
<style>
.mr-wrap { max-width: 900px; margin: 0 auto; padding: 24px 16px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.mr-h2 { font-size: 22px; font-weight: 700; margin: 0 0 24px; color: #1a1a1a; }
.mr-h3 { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #5f6368; margin: 0 0 16px; }
.mr-section { margin-bottom: 40px; }
.mr-grid { display: flex; flex-wrap: wrap; gap: 20px; }
.mr-card {
    width: 160px; display: flex; flex-direction: column;
    border: 1px solid #e8eaed; border-radius: 12px; overflow: hidden;
    box-shadow: 0 1px 4px rgba(0,0,0,.06);
    transition: box-shadow .2s, transform .2s;
    text-decoration: none; color: inherit;
}
.mr-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,.12); transform: translateY(-2px); text-decoration: none; }
.mr-card-img { width: 100%; height: 200px; object-fit: cover; display: block; }
.mr-card-body { padding: 10px; flex: 1; display: flex; flex-direction: column; gap: 6px; }
.mr-card-title { font-size: 13px; font-weight: 600; line-height: 1.3; color: #1a1a1a; }
.mr-bar { height: 5px; background: #e8eaed; border-radius: 3px; overflow: hidden; }
.mr-bar-fill { height: 5px; background: #1a73e8; border-radius: 3px; }
.mr-card-meta { font-size: 11px; color: #5f6368; }
.mr-btn {
    display: block; text-align: center; margin-top: auto; padding: 7px;
    background: #1a73e8; color: #fff; border-radius: 6px;
    font-size: 12px; font-weight: 600; text-decoration: none;
    transition: background .15s;
}
.mr-btn:hover { background: #1557b0; color: #fff; text-decoration: none; }
.mr-empty { padding: 28px 0; color: #5f6368; font-size: 14px; }
.mr-bookmark-list { list-style: none; margin: 0; padding: 0; }
.mr-bookmark-item {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 12px 0; border-bottom: 1px solid #e8eaed;
}
.mr-bookmark-item:last-child { border-bottom: none; }
.mr-bookmark-icon { color: #1a73e8; font-size: 18px; flex-shrink: 0; margin-top: 1px; }
.mr-bookmark-body { flex: 1; }
.mr-bookmark-label { font-size: 14px; font-weight: 600; color: #1a1a1a; }
.mr-bookmark-book { font-size: 12px; color: #5f6368; margin-top: 2px; }
.mr-bookmark-excerpt { font-size: 12px; color: #888; margin-top: 4px; line-height: 1.4; }
.mr-login-box { padding: 32px; text-align: center; color: #5f6368; font-size: 15px; }
.mr-login-box a { color: #1a73e8; font-weight: 600; }
@media (max-width: 600px) { .mr-card { width: 140px; } .mr-card-img { height: 170px; } }
</style>

<div class="mr-wrap">
<h2 class="mr-h2"><?= __('My Reading') ?></h2>

<?php if (!utility::isMemberLogin()): ?>
<div class="mr-login-box">
    <?= __('Silakan login sebagai anggota untuk melihat daftar bacaan.') ?><br><br>
    <a href="<?= SWB ?>index.php?p=member"><?= __('Login Anggota') ?></a>
</div>
<?php else:
    $memberId = (int)$_SESSION['mid'];
    $db = DB::getInstance();

    /* ── Continue Reading ── */
    $stmt = $db->prepare(
        'SELECT p.file_id, p.biblio_id, p.format, p.percent, p.last_read,
                f.file_title, b.title, b.image
         FROM ebook_reading_progress AS p
         JOIN biblio AS b ON p.biblio_id = b.biblio_id
         LEFT JOIN files AS f ON p.file_id = f.file_id
         WHERE p.member_id = :mid
         ORDER BY p.last_read DESC'
    );
    $stmt->execute(['mid' => $memberId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
?>
<div class="mr-section">
    <div class="mr-h3"><?= __('Lanjut Membaca') ?></div>
    <?php if (!$rows): ?>
        <div class="mr-empty"><?= __('Kamu belum mulai membaca ebook apapun.') ?></div>
    <?php else: ?>
    <div class="mr-grid">
    <?php foreach ($rows as $r):
        $cover   = trim($r['image'] ?? '');
        $imgSrc  = $cover ? (SWB . 'images/docs/' . rawurlencode($cover)) : (SWB . 'images/default/image.png');
        $ttl     = htmlspecialchars($r['file_title'] ?: $r['title'], ENT_QUOTES);
        $pct     = round((float)$r['percent']);
        $url     = htmlspecialchars($readerUrl . '?fid=' . (int)$r['file_id'] . '&bid=' . (int)$r['biblio_id'], ENT_QUOTES);
        $fmt     = strtoupper(htmlspecialchars($r['format'], ENT_QUOTES));
    ?>
    <div class="mr-card">
        <a href="<?= $url ?>" target="_blank" rel="noopener">
            <img class="mr-card-img" src="<?= $imgSrc ?>" alt="">
        </a>
        <div class="mr-card-body">
            <div class="mr-card-title"><?= $ttl ?></div>
            <div class="mr-bar"><div class="mr-bar-fill" style="width:<?= $pct ?>%"></div></div>
            <div class="mr-card-meta"><?= $fmt ?> &middot; <?= $pct ?>%</div>
            <a class="mr-btn" href="<?= $url ?>" target="_blank" rel="noopener"><?= __('Lanjutkan') ?></a>
        </div>
    </div>
    <?php endforeach; ?>
    </div>
    <?php endif; ?>
</div>

<?php
    /* ── Bookmarks ── */
    $stmt = $db->prepare(
        'SELECT bm.id, bm.file_id, bm.biblio_id, bm.label, bm.excerpt,
                f.file_title, b.title
         FROM ebook_bookmark AS bm
         JOIN biblio AS b ON bm.biblio_id = b.biblio_id
         LEFT JOIN files AS f ON bm.file_id = f.file_id
         WHERE bm.member_id = :mid
         ORDER BY bm.id DESC LIMIT 100'
    );
    $stmt->execute(['mid' => $memberId]);
    $marks = $stmt->fetchAll(PDO::FETCH_ASSOC);
?>
<div class="mr-section">
    <div class="mr-h3"><?= __('Bookmark Saya') ?></div>
    <?php if (!$marks): ?>
        <div class="mr-empty"><?= __('Belum ada bookmark.') ?></div>
    <?php else: ?>
    <ul class="mr-bookmark-list">
    <?php foreach ($marks as $m):
        $title = htmlspecialchars($m['file_title'] ?: $m['title'], ENT_QUOTES);
        $label = htmlspecialchars($m['label'] ?: 'Bookmark', ENT_QUOTES);
        $url   = htmlspecialchars($readerUrl . '?fid=' . (int)$m['file_id'] . '&bid=' . (int)$m['biblio_id'], ENT_QUOTES);
    ?>
    <li class="mr-bookmark-item">
        <div class="mr-bookmark-icon">&#9733;</div>
        <div class="mr-bookmark-body">
            <a class="mr-bookmark-label" href="<?= $url ?>" target="_blank" rel="noopener"><?= $label ?></a>
            <div class="mr-bookmark-book"><?= $title ?></div>
            <?php if (!empty($m['excerpt'])): ?>
            <div class="mr-bookmark-excerpt"><?= htmlspecialchars($m['excerpt'], ENT_QUOTES) ?></div>
            <?php endif; ?>
        </div>
    </li>
    <?php endforeach; ?>
    </ul>
    <?php endif; ?>
</div>

<?php endif; ?>
</div>
