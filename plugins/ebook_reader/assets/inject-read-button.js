/* Ebook Reader — inject Read button (detail page) + ebook badges (list/search/homepage) */
(function () {
    'use strict';

    var me = document.currentScript;
    if (!me) {
        var scripts = document.getElementsByTagName('script');
        me = scripts[scripts.length - 1];
    }

    var swb = (me.getAttribute('data-swb') || '').replace(/\/?$/, '/');
    var apiBase    = swb + 'index.php?p=ebook_api';
    var readerBase = swb + 'index.php?p=ebook_reader';

    /* ── Shared CSS ─────────────────────────────────────── */
    function injectStyles() {
        if (document.getElementById('er-inject-style')) return;
        var s = document.createElement('style');
        s.id = 'er-inject-style';
        s.textContent = [
            '.er-read-btn{',
            '  display:inline-flex;align-items:center;gap:8px;',
            '  padding:11px 24px;margin-top:12px;',
            '  background:#1a73e8;color:#fff;',
            '  border:none;border-radius:24px;',
            '  font-size:14px;font-weight:600;cursor:pointer;',
            '  text-decoration:none;line-height:1;',
            '  box-shadow:0 2px 8px rgba(26,115,232,.35);',
            '  transition:background .15s,transform .1s,box-shadow .15s;',
            '}',
            '.er-read-btn:hover{',
            '  background:#1557b0;box-shadow:0 4px 14px rgba(26,115,232,.45);',
            '  transform:translateY(-1px);color:#fff;text-decoration:none;',
            '}',
            '.er-read-btn:active{transform:none;}',
            '.er-read-btn svg{width:18px;height:18px;fill:currentColor;flex-shrink:0;}',
            '.er-read-btn-wrap{margin:10px 0;}',
            '.er-ebook-badge{',
            '  display:inline-flex;align-items:center;gap:4px;',
            '  padding:2px 8px;border-radius:10px;',
            '  background:#e8f0fe;color:#1a73e8;',
            '  font-size:11px;font-weight:600;',
            '  letter-spacing:.03em;line-height:1.7;',
            '  margin:3px 0;cursor:pointer;',
            '  text-decoration:none;',
            '  transition:background .15s;',
            '  vertical-align:middle;',
            '}',
            '.er-ebook-badge:hover{background:#d2e3fc;color:#1a73e8;text-decoration:none;}',
            '.er-ebook-badge svg{width:11px;height:11px;fill:currentColor;}',
        ].join('');
        document.head.appendChild(s);
    }

    var BOOK_ICON = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H6V4h2v8l2.5-1.5L13 12V4h5v16z"/></svg>';
    var READ_ICON  = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 14H8v-2h8v2zm0-4H8v-2h8v2zm0-4H8V6h8v2z"/></svg>';

    /* ── DETAIL PAGE — big "Baca" CTA button ────────────── */
    function injectDetailButtons() {
        var anchors = document.querySelectorAll('.attachList a[href*="p=fstream"]');
        if (!anchors.length) return;

        var byFid = {}, bid = null;
        anchors.forEach(function (a) {
            var p = new URLSearchParams(a.href.split('?')[1] || '');
            var fid = p.get('fid');
            if (fid) { byFid[fid] = a; if (!bid) bid = p.get('bid'); }
        });
        if (!bid) return;

        fetch(apiBase + '&act=attachment_meta&bid=' + encodeURIComponent(bid), { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (!res.ok) return;
                res.items.forEach(function (item) {
                    var anchor = byFid[String(item.fid)];
                    if (!anchor) return;
                    if (anchor.parentNode.querySelector('.er-read-btn')) return;

                    var label = item.format === 'pdf' ? 'Baca PDF' : 'Baca EPUB';
                    var btn = document.createElement('a');
                    btn.href = readerBase + '&fid=' + item.fid + '&bid=' + item.bid;
                    btn.target = '_blank';
                    btn.rel = 'noopener';
                    btn.className = 'er-read-btn';
                    btn.setAttribute('aria-label', label);
                    btn.innerHTML = READ_ICON + label;

                    var wrap = document.createElement('div');
                    wrap.className = 'er-read-btn-wrap';
                    wrap.appendChild(btn);

                    var parent = anchor.closest('li') || anchor.parentNode;
                    parent.appendChild(wrap);
                });
            })
            .catch(function () {});
    }

    /* ── BADGE INJECTION — works for both static & Vue-rendered cards ─── */
    /*
     * Two card types:
     *  1. Static (search/browse): <div id="card-N">...</div>
     *  2. Vue (homepage slims-collection): <a href="...show_detail&id=N" ...>...</a>
     *     rendered inside <div class="flex flex-wrap ... collection">
     */

    var pendingTimer = null;

    function scheduleBadgeCheck() {
        clearTimeout(pendingTimer);
        pendingTimer = setTimeout(processBadges, 250);
    }

    function processBadges() {
        var bidMap = {};  /* bid -> { container, insertFn } */

        /* ── Type 1: static id="card-N" cards ── */
        document.querySelectorAll('[id^="card-"]:not([data-er-checked])').forEach(function (el) {
            var m = el.id.match(/^card-(\d+)$/);
            if (!m) return;
            el.setAttribute('data-er-checked', '1');
            bidMap[m[1]] = {
                container: el,
                insertBadge: function (badge) {
                    var target = el.querySelector('.card-title,.item-title,h3,h4,h5')
                               || el.firstElementChild;
                    if (target) target.insertAdjacentElement('afterend', badge);
                    else el.prepend(badge);
                }
            };
        });

        /* ── Type 2: Vue show_detail links (homepage slims-collection) ── */
        document.querySelectorAll('a[href*="p=show_detail&id="]:not([data-er-link-checked])').forEach(function (link) {
            var m = link.href.match(/[?&]id=(\d+)/);
            if (!m) return;
            link.setAttribute('data-er-link-checked', '1');
            var bid = m[1];
            if (bidMap[bid]) return; /* already handled by Type 1 */

            var cardBody = link.querySelector('.card-body') || link;
            var titleEl  = link.querySelector('.card-text');
            bidMap[bid] = {
                container: link,
                insertBadge: function (badge) {
                    if (titleEl) titleEl.insertAdjacentElement('afterend', badge);
                    else cardBody.appendChild(badge);
                }
            };
        });

        var bids = Object.keys(bidMap);
        if (!bids.length) return;

        fetch(apiBase + '&act=batch_ebook_check&bids=' + encodeURIComponent(bids.join(',')), { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (!res.ok || !res.ebooks) return;
                res.ebooks.forEach(function (item) {
                    var info = bidMap[String(item.bid)];
                    if (!info || info.container.querySelector('.er-ebook-badge')) return;

                    var badge = document.createElement('a');
                    badge.href = readerBase + '&fid=' + item.fid + '&bid=' + item.bid;
                    badge.target = '_blank';
                    badge.rel = 'noopener';
                    badge.className = 'er-ebook-badge';
                    badge.title = 'Baca Ebook ' + (item.format === 'pdf' ? 'PDF' : 'EPUB');
                    badge.innerHTML = BOOK_ICON + 'Ebook';

                    info.insertBadge(badge);
                });
            })
            .catch(function () {});
    }

    /* Watch for Vue-rendered cards being added asynchronously */
    function watchForCards() {
        if (typeof MutationObserver === 'undefined') return;
        var obs = new MutationObserver(function (mutations) {
            var relevant = mutations.some(function (m) {
                return m.addedNodes.length > 0;
            });
            if (relevant) scheduleBadgeCheck();
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    /* ── Entry point ─────────────────────────────────────── */
    function run() {
        injectStyles();
        injectDetailButtons();
        processBadges();     /* handle static cards immediately */
        watchForCards();     /* then watch for Vue-rendered cards */
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();
