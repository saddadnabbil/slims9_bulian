<?php
/**
 * Shared access helpers for the Ebook Reader plugin.
 *
 * Resolves a public bibliography attachment and enforces the same member
 * access rules used by lib/contents/fstream.inc.php (public attachment +
 * optional member-type access_limit). Reused by reader.php and api.php so
 * the access decision lives in exactly one place.
 */

defined('INDEX_AUTH') OR die('Direct access not allowed!');

if (!function_exists('ebook_reader_detect_format')) {
    /**
     * Decide the reader format from mime type / filename.
     *
     * @return string|null 'pdf' | 'epub' | null (not a readable ebook)
     */
    function ebook_reader_detect_format($mime_type, $file_name = '')
    {
        $mime = strtolower(trim((string)$mime_type));
        $ext = strtolower(pathinfo((string)$file_name, PATHINFO_EXTENSION));

        if ($mime === 'application/pdf' || $ext === 'pdf') return 'pdf';
        if ($mime === 'application/epub+zip' || $ext === 'epub') return 'epub';

        return null;
    }
}

if (!function_exists('ebook_reader_get_attachment')) {
    /**
     * Fetch a public attachment row joined with its file + biblio title.
     *
     * @return array|null
     */
    function ebook_reader_get_attachment($file_id, $biblio_id)
    {
        $db = \SLiMS\DB::getInstance();
        $stmt = $db->prepare(
            'SELECT att.access_type, att.access_limit, att.biblio_id,
                    f.file_id, f.file_title, f.file_name, f.file_dir, f.mime_type,
                    b.title
             FROM biblio_attachment AS att
             LEFT JOIN files AS f ON att.file_id = f.file_id
             LEFT JOIN biblio AS b ON att.biblio_id = b.biblio_id
             WHERE att.file_id = :fid AND att.biblio_id = :bid AND att.access_type = \'public\'
             LIMIT 1'
        );
        $stmt->execute(['fid' => (int)$file_id, 'bid' => (int)$biblio_id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        return $row ?: null;
    }
}

if (!function_exists('ebook_reader_access_status')) {
    /**
     * Determine whether the current visitor may read the attachment.
     *
     * @return string 'ok' | 'login' (member login required) | 'denied'
     */
    function ebook_reader_access_status(array $file_d)
    {
        // Reading progress is per-member, so a member login is always required.
        if (!utility::isMemberLogin()) return 'login';

        // Honour per-attachment member-type restriction (access_limit).
        if (!empty($file_d['access_limit'])) {
            $allowed = @unserialize($file_d['access_limit']);
            if (is_array($allowed) && !in_array($_SESSION['m_member_type_id'], $allowed)) {
                return 'denied';
            }
        }

        return 'ok';
    }
}
