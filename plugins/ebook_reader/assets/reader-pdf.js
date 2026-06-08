/* Ebook Reader — PDF engine (continuous scroll mode) */
(function () {
    'use strict';

    var cfg = window.EBOOK_READER;
    var $ = function (id) { return document.getElementById(id); };

    /* ---- API client ---- */
    function api(act, method, data) {
        var url = cfg.apiBase + '&act=' + encodeURIComponent(act);
        var opt = { method: method, credentials: 'same-origin' };
        if (method === 'POST') {
            var body = new URLSearchParams();
            Object.keys(data || {}).forEach(function (k) { body.append(k, data[k]); });
            opt.body = body;
        } else if (data) {
            url += '&' + new URLSearchParams(data).toString();
        }
        return fetch(url, opt).then(function (r) { return r.json(); });
    }

    /* ---- State ---- */
    var state = cfg.state || {};
    var settings = {};
    try { settings = state.settings ? JSON.parse(state.settings) : {}; } catch (e) { settings = {}; }
    var theme = settings.theme || 'light';
    var pdfDoc = null, numPages = 0, currentPage = 1;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    /* ---- DOM refs ---- */
    var viewportEl = $('er-viewport');
    var viewerEl   = $('er-viewer');

    /* ---- Theme ---- */
    function applyTheme() {
        document.body.className = 'er-' + theme + ' er-format-pdf';
        document.querySelectorAll('.er-theme-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
    }
    applyTheme();

    /* ---- PDF.js ---- */
    pdfjsLib.GlobalWorkerOptions.workerSrc = cfg.pdfWorker;

    pdfjsLib.getDocument({ url: cfg.fileUrl, withCredentials: true }).promise
        .then(function (pdf) {
            pdfDoc = pdf;
            numPages = pdf.numPages;
            $('er-loading').style.display = 'none';

            var saved = parseInt(state.location, 10);
            currentPage = (saved && saved >= 1 && saved <= numPages) ? saved : 1;

            buildScrollViewer(currentPage);
            loadOutline();
            loadBookmarks();
        })
        .catch(function (err) {
            $('er-loading').textContent = 'Gagal memuat PDF.';
            if (window.console) console.error(err);
        });

    /* ---- Scale: fit to viewport width ---- */
    function computeScale(vp) {
        var pad = 32;
        var availW = viewportEl.clientWidth - pad * 2;
        return Math.min(availW / vp.width, 2.0);
    }

    /* ---- Page wrappers ---- */
    var pageWrappers = [];
    var pageObserver = null;

    function buildScrollViewer(jumpToPage) {
        viewerEl.innerHTML = '';
        pageWrappers = [];
        if (pageObserver) { pageObserver.disconnect(); pageObserver = null; }

        /* Use page 1 to size all placeholders; actual dims updated on render */
        pdfDoc.getPage(1).then(function (p1) {
            var scale = computeScale(p1.getViewport(1));
            var css   = p1.getViewport(scale);
            var pw    = Math.floor(css.width);
            var ph    = Math.floor(css.height);

            for (var i = 1; i <= numPages; i++) {
                var wrap   = document.createElement('div');
                wrap.className  = 'er-pdf-page';
                wrap.dataset.page = i;
                wrap.style.width  = pw + 'px';
                wrap.style.height = ph + 'px';

                var canvas = document.createElement('canvas');
                wrap.appendChild(canvas);
                viewerEl.appendChild(wrap);
                pageWrappers.push({ wrap: wrap, canvas: canvas, pageNum: i, rendered: false });
            }

            setupObserver();

            if (jumpToPage > 1) {
                setTimeout(function () { scrollToPage(jumpToPage, false); }, 80);
            }
            updateProgress();
        });
    }

    function setupObserver() {
        if (!window.IntersectionObserver) {
            pageWrappers.forEach(function (pw) { renderPage(pw.pageNum); });
            return;
        }
        pageObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                var num = parseInt(entry.target.dataset.page, 10);
                renderPage(num);
                if (num > 1) renderPage(num - 1);
                if (num < numPages) renderPage(num + 1);
            });
        }, { root: viewportEl, threshold: 0, rootMargin: '400px 0px' });

        pageWrappers.forEach(function (pw) { pageObserver.observe(pw.wrap); });
    }

    function renderPage(num) {
        var pw = pageWrappers[num - 1];
        if (!pw || pw.rendered) return;
        pw.rendered = true;

        pdfDoc.getPage(num).then(function (page) {
            var scale = computeScale(page.getViewport(1));
            var vp    = page.getViewport(scale * dpr);
            var css   = page.getViewport(scale);

            var canvas = pw.canvas;
            canvas.width  = Math.floor(vp.width);
            canvas.height = Math.floor(vp.height);
            canvas.style.width  = Math.floor(css.width)  + 'px';
            canvas.style.height = Math.floor(css.height) + 'px';
            pw.wrap.style.width  = Math.floor(css.width)  + 'px';
            pw.wrap.style.height = Math.floor(css.height) + 'px';

            page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        });
    }

    /* ---- Scroll tracking ---- */
    var scrollTimer = null;
    viewportEl.addEventListener('scroll', function () {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(updateCurrentPageFromScroll, 80);
    });

    function updateCurrentPageFromScroll() {
        if (!pageWrappers.length) return;
        var vpTop    = viewportEl.getBoundingClientRect().top;
        var vpBottom = vpTop + viewportEl.clientHeight;
        var best = currentPage, bestVis = -1;

        pageWrappers.forEach(function (pw) {
            var r   = pw.wrap.getBoundingClientRect();
            var vis = Math.min(r.bottom, vpBottom) - Math.max(r.top, vpTop);
            if (vis > bestVis) { bestVis = vis; best = pw.pageNum; }
        });

        if (best !== currentPage) {
            currentPage = best;
            updateProgress();
        }
    }

    /* ---- Navigation ---- */
    function scrollToPage(num, smooth) {
        var pw = pageWrappers[num - 1];
        if (!pw) return;
        if (smooth) {
            viewportEl.scrollTo({ top: pw.wrap.offsetTop, behavior: 'smooth' });
        } else {
            viewportEl.scrollTop = pw.wrap.offsetTop;
        }
    }

    $('er-range').addEventListener('change', function () {
        var target = Math.max(1, Math.min(numPages, Math.round(parseFloat(this.value) / 100 * numPages)));
        scrollToPage(target, false);
    });

    document.addEventListener('keyup', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'PageDown') scrollToPage(Math.min(numPages, currentPage + 1), true);
        if (e.key === 'ArrowUp'   || e.key === 'PageUp')   scrollToPage(Math.max(1,        currentPage - 1), true);
        if (e.key === 'Escape') closeAll();
    });

    /* ---- Progress ---- */
    var saveTimer = null;
    function updateProgress() {
        if (!numPages) return;
        var pct = (currentPage / numPages) * 100;
        $('er-range').value = pct;
        $('er-percent').textContent = currentPage + ' / ' + numPages;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
            api('save_progress', 'POST', {
                fid: cfg.fid, bid: cfg.bid, format: 'pdf',
                location: String(currentPage), percent: pct,
                settings: JSON.stringify({ theme: theme })
            });
        }, 800);
    }

    /* ---- Resize: rebuild with current page restored ---- */
    var resizeTimer = null;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            var page = currentPage;
            buildScrollViewer(page);
        }, 250);
    });

    /* ---- TOC (PDF outline) ---- */
    function loadOutline() {
        pdfDoc.getOutline().then(function (outline) {
            var body = $('er-toc');
            body.innerHTML = '';
            if (!outline || !outline.length) {
                body.innerHTML = '<div class="er-empty-state">Tidak ada daftar isi.</div>';
                return;
            }
            var add = function (item, depth) {
                var div = document.createElement('div');
                div.className = 'er-toc-item' + (depth > 0 ? ' sub' : '');
                div.innerHTML = '<span class="er-toc-dot"></span><span>' + escHtml(item.title) + '</span>';
                div.addEventListener('click', function () { gotoDest(item.dest); closeAll(); });
                body.appendChild(div);
                (item.items || []).forEach(function (s) { add(s, depth + 1); });
            };
            outline.forEach(function (i) { add(i, 0); });
        });
    }
    function gotoDest(dest) {
        var p = (typeof dest === 'string') ? pdfDoc.getDestination(dest) : Promise.resolve(dest);
        p.then(function (d) {
            if (!d) return;
            pdfDoc.getPageIndex(d[0]).then(function (idx) { scrollToPage(idx + 1, true); closeAll(); });
        });
    }

    /* ---- Bookmarks ---- */
    function buildBookmarkList(bookmarks) {
        var body = $('er-bookmarks');
        body.innerHTML = '';
        if (!bookmarks.length) {
            body.innerHTML = '<div class="er-empty-state">Belum ada bookmark.<br>Tekan &#9733; untuk menambah.</div>';
            return;
        }
        bookmarks.forEach(function (b) {
            var div = document.createElement('div');
            div.className = 'er-bookmark-item';
            div.innerHTML =
                '<div class="er-bookmark-icon">&#9733;</div>' +
                '<div class="er-bookmark-body">' +
                  '<div class="er-bookmark-label">' + escHtml(b.label || ('Halaman ' + b.location)) + '</div>' +
                '</div>' +
                '<button class="er-bookmark-del" title="Hapus">&#x2715;</button>';
            div.querySelector('.er-bookmark-del').addEventListener('click', function (e) {
                e.stopPropagation();
                api('remove_bookmark', 'POST', { id: b.id }).then(loadBookmarks);
            });
            div.addEventListener('click', function () { scrollToPage(parseInt(b.location, 10), true); closeAll(); });
            body.appendChild(div);
        });
    }
    function loadBookmarks() {
        api('list_bookmarks', 'GET', { fid: cfg.fid }).then(function (res) {
            buildBookmarkList((res.ok && res.bookmarks) ? res.bookmarks : []);
        });
    }

    $('er-add-bookmark').addEventListener('click', function () {
        api('add_bookmark', 'POST', {
            fid: cfg.fid, bid: cfg.bid,
            location: String(currentPage),
            label: 'Halaman ' + currentPage
        }).then(function (res) {
            if (res.ok) {
                openPanel('er-panel-bookmarks');
                loadBookmarks();
                showToast('Bookmark ditambahkan');
            }
        });
    });

    /* ---- Panel management ---- */
    var panels = ['er-panel-toc', 'er-panel-bookmarks', 'er-panel-settings'];
    function closeAll() {
        panels.forEach(function (id) { $(id).classList.remove('open'); });
        $('er-overlay').classList.remove('open');
    }
    function openPanel(id) {
        panels.forEach(function (pid) { $(pid).classList.remove('open'); });
        $(id).classList.add('open');
        $('er-overlay').classList.add('open');
    }
    function togglePanel(id) {
        if ($(id).classList.contains('open')) { closeAll(); } else { openPanel(id); }
    }
    $('er-overlay').addEventListener('click', closeAll);
    document.querySelectorAll('.er-close-panel').forEach(function (btn) {
        btn.addEventListener('click', closeAll);
    });
    $('er-toggle-toc').addEventListener('click',       function () { togglePanel('er-panel-toc'); });
    $('er-toggle-bookmarks').addEventListener('click', function () { togglePanel('er-panel-bookmarks'); });
    $('er-toggle-settings').addEventListener('click',  function () { togglePanel('er-panel-settings'); });

    /* ---- Theme buttons ---- */
    document.querySelectorAll('.er-theme-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            theme = btn.dataset.theme;
            applyTheme();
            updateProgress();
        });
    });

    /* ---- Progress slider tooltip ---- */
    var rangeTip  = $('er-range-tip');
    var rangeWrap = $('er-range-wrap');
    var rangeEl   = $('er-range');
    function positionTip(pct) {
        if (!rangeTip || !rangeWrap) return;
        var page = Math.max(1, Math.min(numPages, Math.round(pct / 100 * numPages)));
        rangeTip.textContent = 'Halaman ' + page + (numPages ? ' / ' + numPages : '');
        var thumbSize = 14;
        var left = (pct / 100) * (rangeWrap.offsetWidth - thumbSize) + thumbSize / 2;
        rangeTip.style.left = left + 'px';
        rangeTip.classList.add('show');
    }
    if (rangeEl) {
        rangeEl.addEventListener('mousemove',  function () { positionTip(parseFloat(this.value)); });
        rangeEl.addEventListener('input',      function () { positionTip(parseFloat(this.value)); });
        rangeEl.addEventListener('mouseleave', function () { if (rangeTip) rangeTip.classList.remove('show'); });
    }

    /* ---- Toast ---- */
    function showToast(msg) {
        var t = $('er-toast');
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(function () { t.classList.remove('show'); }, 2000);
    }

    function escHtml(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
})();
