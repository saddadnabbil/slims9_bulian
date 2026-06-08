/* Ebook Reader — EPUB engine (epub.js v0.3.x) */
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

    /* ---- Restore saved state ---- */
    var state = cfg.state || {};
    var settings = {};
    try { settings = state.settings ? JSON.parse(state.settings) : {}; } catch (e) { settings = {}; }

    var fontPercent  = settings.fontPercent  || 100;
    var theme        = settings.theme        || 'light';
    var currentFlow  = settings.flow         || 'paginated';
    var currentSpread= settings.spread       || 'none';
    var currentZoom  = settings.zoom         || 'fit-screen';
    var currentCfi   = state.location        || '';

    /* In-memory highlights (not persisted between sessions) */
    var highlights = [];
    var currentSelection = null;

    /* Notes loaded from DB */
    var savedNotes = [];
    var currentNoteColor = 'yellow';

    /* ---- DOM refs ---- */
    var viewerEl  = $('er-viewer');
    var viewportEl= $('er-viewport');
    var toolbar   = $('er-toolbar');
    var footer    = $('er-footer');

    /* ---- Highlight CSS injected into every chapter iframe ---- */
    var HIGHLIGHT_CSS =
        '.er-hl-yellow{background-color:rgba(255,213,0,.40)!important}'
      + '.er-hl-red{background-color:rgba(244,67,54,.35)!important}'
      + '.er-hl-green{background-color:rgba(76,175,80,.35)!important}'
      + '.er-hl-blue{background-color:rgba(33,150,243,.35)!important}'
      + '.er-hl-note-yellow{background-color:rgba(255,213,0,.55)!important;border-bottom:2px solid rgba(200,155,0,.85)!important}'
      + '.er-hl-note-red{background-color:rgba(244,67,54,.50)!important;border-bottom:2px solid rgba(195,30,20,.75)!important}'
      + '.er-hl-note-green{background-color:rgba(76,175,80,.50)!important;border-bottom:2px solid rgba(38,125,48,.75)!important}'
      + '.er-hl-note-blue{background-color:rgba(33,150,243,.50)!important;border-bottom:2px solid rgba(20,100,200,.75)!important}';

    /* ---- Theme definitions ---- */
    var THEMES = {
        light: { 'body': { 'background': '#fff !important', 'color': '#1a1a1a !important', 'line-height': '1.75 !important', 'font-family': 'Georgia,"Times New Roman",serif !important' } },
        sepia: { 'body': { 'background': '#f5f0e8 !important', 'color': '#3b2e1e !important', 'line-height': '1.75 !important', 'font-family': 'Georgia,"Times New Roman",serif !important' } },
        dark:  { 'body': { 'background': '#202124 !important', 'color': '#e8eaed !important', 'line-height': '1.75 !important', 'font-family': 'Georgia,"Times New Roman",serif !important' }, 'a': { 'color': '#8ab4f8 !important' } }
    };

    /* ================================================================
       epub.js book + dynamic rendition
       ================================================================ */
    var book = ePub(cfg.fileUrl, { openAs: 'epub' });
    var rendition;
    var locReady = false;
    var tocMap   = {};

    function initRendition(displayCfi) {
        if (rendition) {
            try { rendition.destroy(); } catch (e) {}
        }
        viewerEl.innerHTML = '';

        rendition = book.renderTo('er-viewer', {
            width: '100%',
            height: '100%',
            flow: currentFlow,
            spread: currentSpread,
            allowScriptedContent: false
        });

        /* Inject highlight CSS + cover font into every chapter */
        rendition.hooks.content.register(function (contents) {
            var doc = contents.document;
            if (!doc.getElementById('er-inject')) {
                var s = doc.createElement('style');
                s.id = 'er-inject';
                s.textContent = HIGHLIGHT_CSS;
                doc.head.appendChild(s);
            }
        });

        /* Register colour themes */
        Object.keys(THEMES).forEach(function (name) {
            rendition.themes.register(name, THEMES[name]);
        });

        /* Text selection → show highlight menu */
        rendition.on('selected', function (cfiRange, contents) {
            currentSelection = { cfi: cfiRange, contents: contents };
            positionHlMenu(contents);
        });

        /* Page relocated */
        rendition.on('relocated', function (loc) {
            currentCfi = loc.start.cfi;
            updateProgress(loc);
            updateActiveToc(loc);
            saveProgress();
            hideHlMenu();
        });

        applyTheme();
        applyFont();
        applyFlowCss();

        /* Re-apply existing highlights */
        highlights.forEach(function (h) {
            rendition.annotations.highlight(h.cfi, {}, null, 'er-hl-' + h.color);
        });

        /* Re-apply saved note highlights */
        savedNotes.forEach(function (n) {
            try { rendition.annotations.highlight(n.location, {}, null, 'er-hl-note-' + (n.color || 'yellow')); } catch (e) {}
        });

        return rendition.display(displayCfi || undefined).then(function () {
            $('er-loading').style.display = 'none';
        }).catch(function (err) {
            $('er-loading').innerHTML = '<div style="padding:20px;text-align:center;color:var(--ui-muted)">Gagal memuat EPUB.' + (err && err.message ? '<br><small>' + escHtml(err.message) + '</small>' : '') + '</div>';
            if (window.console) console.error('epub error', err);
        });
    }

    /* ---- Apply body classes for scroll/spread/paginated CSS ---- */
    function applyFlowCss() {
        document.body.classList.toggle('er-flow-scrolled',  currentFlow   === 'scrolled-doc');
        document.body.classList.toggle('er-spread-always',  currentSpread === 'always');
        var ls = $('er-layout-section');
        if (ls) ls.style.display = (currentFlow === 'paginated') ? '' : 'none';
    }

    /* ---- Theme ---- */
    function applyTheme() {
        document.body.className = document.body.className
            .replace(/er-(light|sepia|dark)\b/g, '')
            .trim() + ' er-' + theme + ' er-format-epub'
            + (currentFlow === 'scrolled-doc' ? ' er-flow-scrolled' : '');
        rendition.themes.select(theme);
        document.querySelectorAll('.er-theme-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
    }

    /* ---- Font size ---- */
    function applyFont() {
        rendition.themes.fontSize(fontPercent + '%');
        var d = $('er-font-size-display');
        if (d) d.textContent = fontPercent + '%';
    }

    /* ---- Locations (%) ---- */
    book.ready.then(function () {
        return book.locations.generate(1600);
    }).then(function () { locReady = true; });

    /* ---- TOC ---- */
    book.loaded.navigation.then(function (nav) {
        var body = $('er-toc');
        body.innerHTML = '';
        var add = function (item, depth) {
            var href0 = item.href.split('#')[0];
            tocMap[href0] = item.label.trim();
            var div = document.createElement('div');
            div.className = 'er-toc-item' + (depth > 0 ? ' sub' : '');
            div.dataset.href = href0;
            div.innerHTML = '<span class="er-toc-dot"></span><span>' + escHtml(item.label.trim()) + '</span>';
            div.addEventListener('click', function () { rendition.display(item.href); closeAll(); });
            body.appendChild(div);
            (item.subitems || []).forEach(function (s) { add(s, depth + 1); });
        };
        var toc = nav.toc || [];
        if (!toc.length) { body.innerHTML = '<div class="er-empty-state">Tidak ada daftar isi.</div>'; return; }
        toc.forEach(function (i) { add(i, 0); });
    });

    /* ---- Progress display + save ---- */
    function updateProgress(loc) {
        var pct = 0;
        if (locReady && loc && loc.start) {
            pct = (book.locations.percentageFromCfi(loc.start.cfi) || 0) * 100;
        }
        var range = $('er-range');
        var pctEl = $('er-percent');
        if (range) range.value = pct;
        if (pctEl) {
            var total = locReady ? (book.locations.total || 0) : 0;
            if (total) {
                var curr = Math.max(1, Math.round(pct / 100 * total));
                pctEl.textContent = curr + ' / ' + total;
            } else {
                pctEl.textContent = Math.round(pct) + '%';
            }
        }
    }

    function updateActiveToc(loc) {
        if (!loc || !loc.start) return;
        var href = loc.start.href ? loc.start.href.split('#')[0] : '';
        document.querySelectorAll('.er-toc-item').forEach(function (el) {
            el.classList.toggle('active', el.dataset.href === href);
        });
    }

    var saveTimer;

    /* Shared payload builder */
    function buildSavePayload() {
        var pct = 0;
        try { if (locReady) pct = (book.locations.percentageFromCfi(currentCfi) || 0) * 100; } catch (e) {}
        return {
            fid: cfg.fid, bid: cfg.bid, format: 'epub',
            location: currentCfi, percent: pct,
            settings: JSON.stringify({
                fontPercent: fontPercent, theme: theme,
                flow: currentFlow, spread: currentSpread, zoom: currentZoom
            })
        };
    }

    /* Immediate save — use for explicit setting changes (theme, flow, spread, zoom, font) */
    function saveSettings() {
        api('save_progress', 'POST', buildSavePayload());
    }

    /* Debounced save — use for position updates from page-turn events */
    function saveProgress() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
            api('save_progress', 'POST', buildSavePayload());
        }, 800);
    }

    /* Flush save on page close / refresh so settings survive immediately */
    window.addEventListener('beforeunload', function () {
        try {
            var p = buildSavePayload();
            var body = new URLSearchParams();
            body.append('fid', p.fid); body.append('bid', p.bid); body.append('format', p.format);
            body.append('location', p.location); body.append('percent', p.percent);
            body.append('settings', p.settings);
            navigator.sendBeacon(cfg.apiBase + '&act=save_progress', body);
        } catch (e) {}
    });

    function safeGetCfi() {
        try { var l = rendition.currentLocation(); return (l && l.start) ? l.start.cfi : ''; } catch (e) { return currentCfi || ''; }
    }

    /* ---- Progress range ---- */
    var rangeEl  = $('er-range');
    var rangeTip = $('er-range-tip');
    var rangeWrap= $('er-range-wrap');
    if (rangeEl) {
        rangeEl.addEventListener('change', function () {
            if (!locReady) return;
            var cfi = book.locations.cfiFromPercentage(parseFloat(this.value) / 100);
            if (cfi) rendition.display(cfi);
        });
        rangeEl.addEventListener('mousemove', function () { showRangeTip(parseFloat(this.value)); });
        rangeEl.addEventListener('input',     function () { showRangeTip(parseFloat(this.value)); });
        rangeEl.addEventListener('mouseleave',function () { if (rangeTip) rangeTip.classList.remove('show'); });
    }
    function showRangeTip(pct) {
        if (!rangeTip || !rangeWrap) return;
        var label = '';
        try { var loc = rendition.currentLocation(); if (loc && loc.start) { var h = loc.start.href.split('#')[0]; label = tocMap[h] ? tocMap[h] + ' — ' : ''; } } catch (e) {}
        var total = locReady ? (book.locations.total || 0) : 0;
        if (total) {
            var page = Math.max(1, Math.round(pct / 100 * total));
            rangeTip.textContent = label + page + ' / ' + total;
        } else {
            rangeTip.textContent = label + Math.round(pct) + '%';
        }
        var left = (pct / 100) * (rangeWrap.offsetWidth - 14) + 7;
        rangeTip.style.left = left + 'px';
        rangeTip.classList.add('show');
    }

    /* ---- Bookmarks ---- */
    function currentChapterLabel() {
        try { var l = rendition.currentLocation(); var h = l && l.start ? l.start.href.split('#')[0] : ''; return tocMap[h] || 'Halaman ini'; } catch (e) { return 'Halaman ini'; }
    }

    function buildBookmarkList(bookmarks) {
        var body = $('er-bookmarks');
        body.innerHTML = '';
        if (!bookmarks.length) { body.innerHTML = '<div class="er-empty-state">Belum ada bookmark.<br>Tekan &#9733; untuk menambah.</div>'; return; }
        bookmarks.forEach(function (b) {
            var div = document.createElement('div');
            div.className = 'er-bookmark-item';
            div.innerHTML =
                '<div class="er-bookmark-icon">&#9733;</div>'
              + '<div class="er-bookmark-body"><div class="er-bookmark-label">' + escHtml(b.label || 'Bookmark') + '</div>'
              + (b.excerpt ? '<div class="er-bookmark-excerpt">' + escHtml(b.excerpt) + '</div>' : '')
              + '</div><button class="er-bookmark-del" title="Hapus">&#x2715;</button>';
            div.querySelector('.er-bookmark-del').addEventListener('click', function (e) { e.stopPropagation(); api('remove_bookmark', 'POST', { id: b.id }).then(loadBookmarks); });
            div.addEventListener('click', function () { rendition.display(b.location); closeAll(); });
            body.appendChild(div);
        });
    }
    function loadBookmarks() {
        api('list_bookmarks', 'GET', { fid: cfg.fid }).then(function (res) { buildBookmarkList((res.ok && res.bookmarks) ? res.bookmarks : []); });
    }

    $('er-add-bookmark').addEventListener('click', function () {
        if (!currentCfi) return;
        var excerpt = '';
        try { var c = rendition.getContents()[0]; if (c && c.document) excerpt = (c.document.body.innerText || '').trim().slice(0, 120); } catch (e) {}
        api('add_bookmark', 'POST', { fid: cfg.fid, bid: cfg.bid, location: currentCfi, label: currentChapterLabel(), excerpt: excerpt })
            .then(function (res) { if (res.ok) { openPanel('er-panel-bookmarks'); loadBookmarks(); showToast('Bookmark ditambahkan'); } });
    });

    /* ================================================================
       Settings: View type (flow)
       ================================================================ */
    document.querySelectorAll('.er-seg-btn').forEach(function (btn) {
        btn.classList.toggle('er-seg-active', btn.dataset.flow === currentFlow);
        btn.addEventListener('click', function () {
            var newFlow = btn.dataset.flow;
            if (newFlow === currentFlow) return;
            currentFlow = newFlow;
            var cfi = safeGetCfi();
            document.querySelectorAll('.er-seg-btn').forEach(function (b) { b.classList.toggle('er-seg-active', b.dataset.flow === currentFlow); });
            initRendition(cfi);
            saveSettings();
        });
    });

    /* ================================================================
       Settings: Zoom (maps to font-size %)
       ================================================================ */
    var zoomEl = $('er-zoom-select');
    var ZOOM_PCT = { 'fit-screen': 100, 'fit-width': 100, '100': 100, '150': 150, '200': 200 };
    if (zoomEl) {
        zoomEl.value = currentZoom;
        zoomEl.addEventListener('change', function () {
            currentZoom = this.value;
            fontPercent = ZOOM_PCT[currentZoom] || 100;
            applyFont();
            saveSettings();
        });
    }

    /* ================================================================
       Settings: Page layout (spread)
       ================================================================ */
    document.querySelectorAll('.er-layout-btn').forEach(function (btn) {
        btn.classList.toggle('er-layout-active', btn.dataset.spread === currentSpread);
        btn.addEventListener('click', function () {
            var newSpread = btn.dataset.spread;
            if (newSpread === currentSpread) return;
            currentSpread = newSpread;
            var cfi = safeGetCfi();
            document.querySelectorAll('.er-layout-btn').forEach(function (b) { b.classList.toggle('er-layout-active', b.dataset.spread === currentSpread); });
            initRendition(cfi);
            saveSettings();
        });
    });

    /* ================================================================
       Settings: Font size (toolbar panel)
       ================================================================ */
    function changeFont(delta) {
        fontPercent = Math.max(60, Math.min(220, fontPercent + delta));
        applyFont();
        if (zoomEl) zoomEl.value = '';
        saveSettings();
    }
    var fd2 = $('er-font-dec2'), fi2 = $('er-font-inc2');
    if (fd2) fd2.addEventListener('click', function () { changeFont(-10); });
    if (fi2) fi2.addEventListener('click', function () { changeFont(+10); });

    /* ================================================================
       Settings: Theme
       ================================================================ */
    document.querySelectorAll('.er-theme-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            theme = btn.dataset.theme;
            applyTheme();
            saveSettings();
        });
    });

    /* ================================================================
       Navigation: buttons, keyboard, scroll-wheel, click zones
       ================================================================ */
    $('er-prev').addEventListener('click', function () { rendition.prev(); });
    $('er-next').addEventListener('click', function () { rendition.next(); });

    document.addEventListener('keyup', function (e) {
        if (e.key === 'ArrowLeft')  rendition.prev();
        if (e.key === 'ArrowRight') rendition.next();
        if (e.key === 'Escape')     closeAll();
    });
    /* epub.js also fires keyup from inside the iframe */
    book.ready.then(function () {
        rendition.on('keyup', function (e) {
            if (e.key === 'ArrowLeft')  rendition.prev();
            if (e.key === 'ArrowRight') rendition.next();
        });
    });

    /* Scroll wheel → page turn (paginated mode only) */
    viewportEl.addEventListener('wheel', function (e) {
        if (currentFlow !== 'paginated') return;
        e.preventDefault();
        if (e.deltaY > 0 || e.deltaX > 0) rendition.next();
        else rendition.prev();
    }, { passive: false });

    /* Ghost arrow nav zones */
    var navPrev = $('er-nav-prev'), navNext = $('er-nav-next');
    if (navPrev) navPrev.addEventListener('click', function () { rendition.prev(); });
    if (navNext) navNext.addEventListener('click', function () { rendition.next(); });

    /* Cursor hint on outer viewport hover */
    viewportEl.addEventListener('mousemove', function (e) {
        if (currentFlow !== 'paginated') { this.style.cursor = ''; return; }
        var x = e.clientX / this.offsetWidth;
        this.style.cursor = (x < 0.25) ? 'w-resize' : (x > 0.75) ? 'e-resize' : '';
    });

    /* ================================================================
       Highlight / Annotation
       ================================================================ */
    var hlMenu = $('er-hl-menu');

    function positionHlMenu(contents) {
        try {
            var sel = contents.window.getSelection();
            if (!sel || !sel.rangeCount || sel.isCollapsed) { hideHlMenu(); return; }
            var range = sel.getRangeAt(0);
            var rect  = range.getBoundingClientRect();
            var iframe= viewerEl.querySelector('iframe');
            if (!iframe) return;
            var ir = iframe.getBoundingClientRect();
            var x  = ir.left + rect.left + rect.width  / 2;
            var y  = ir.top  + rect.bottom + 10;
            /* Clamp to viewport */
            var mw = 220;
            x = Math.max(mw / 2 + 8, Math.min(window.innerWidth - mw / 2 - 8, x));
            if (y + 140 > window.innerHeight) y = ir.top + rect.top - 140;
            hlMenu.style.left = x + 'px';
            hlMenu.style.top  = y + 'px';
            hlMenu.classList.add('show');
        } catch (err) { if (window.console) console.warn('positionHlMenu', err); }
    }

    function hideHlMenu() {
        if (hlMenu) hlMenu.classList.remove('show');
        currentSelection = null;
    }

    /* Color buttons → highlight */
    document.querySelectorAll('.er-hl-dot').forEach(function (dot) {
        dot.addEventListener('click', function () {
            if (!currentSelection) return;
            var color = dot.dataset.color;
            var cfi   = currentSelection.cfi;
            try {
                rendition.annotations.highlight(cfi, {}, null, 'er-hl-' + color);
                highlights.push({ cfi: cfi, color: color });
                showToast('Highlight ditambahkan');
            } catch (e) { if (window.console) console.warn('highlight err', e); }
            hideHlMenu();
        });
    });

    /* Copy action */
    var hlCopyBtn = $('er-hl-copy');
    if (hlCopyBtn) hlCopyBtn.addEventListener('click', function () {
        try {
            var sel = currentSelection && currentSelection.contents.window.getSelection();
            var text = sel ? sel.toString() : '';
            if (text) {
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(text).then(function () { showToast('Teks disalin'); });
                } else {
                    document.execCommand('copy');
                    showToast('Teks disalin');
                }
            }
        } catch (e) {}
        hideHlMenu();
    });

    /* ================================================================
       Note modal
       ================================================================ */
    var noteModalEl          = $('er-note-modal');
    var noteTextareaEl       = $('er-note-textarea');
    var noteExcerptDisplayEl = $('er-note-excerpt-display');
    var currentNoteSelection = null;   /* {cfi, excerpt} */

    function openNoteModal(cfi, excerpt) {
        currentNoteSelection = { cfi: cfi, excerpt: excerpt };
        currentNoteColor = 'yellow';
        document.querySelectorAll('.er-note-color-dot').forEach(function (d) {
            d.classList.toggle('er-nc-active', d.dataset.noteColor === 'yellow');
        });
        if (noteExcerptDisplayEl) noteExcerptDisplayEl.textContent = excerpt ? '“' + excerpt + '”' : '';
        if (noteTextareaEl) noteTextareaEl.value = '';
        if (noteModalEl) noteModalEl.classList.add('show');
        setTimeout(function () { if (noteTextareaEl) noteTextareaEl.focus(); }, 60);
    }
    function closeNoteModal() {
        if (noteModalEl) noteModalEl.classList.remove('show');
        currentNoteSelection = null;
    }

    /* Note modal color picker */
    document.querySelectorAll('.er-note-color-dot').forEach(function (dot) {
        dot.addEventListener('click', function () {
            currentNoteColor = dot.dataset.noteColor;
            document.querySelectorAll('.er-note-color-dot').forEach(function (d) {
                d.classList.toggle('er-nc-active', d.dataset.noteColor === currentNoteColor);
            });
        });
    });

    var noteSaveBtn   = $('er-note-save');
    var noteCancelBtn = $('er-note-cancel');
    var noteCloseBtn  = $('er-note-close');

    if (noteSaveBtn) noteSaveBtn.addEventListener('click', function () {
        if (!currentNoteSelection) { closeNoteModal(); return; }
        var cfi     = currentNoteSelection.cfi;
        var excerpt = currentNoteSelection.excerpt;
        var text    = noteTextareaEl ? noteTextareaEl.value.trim() : '';
        var color   = currentNoteColor || 'yellow';

        /* Add note highlight to rendition */
        try {
            rendition.annotations.highlight(cfi, {}, null, 'er-hl-note-' + color);
        } catch (e) {}

        api('add_note', 'POST', {
            fid: cfg.fid, bid: cfg.bid,
            location: cfi, excerpt: excerpt,
            note_text: text, color: color
        }).then(function (res) {
            if (res.ok) {
                showToast('Catatan disimpan');
                loadNotes();
            } else {
                showToast('Gagal menyimpan catatan');
            }
        }).catch(function () { showToast('Gagal menyimpan catatan'); });

        closeNoteModal();
    });

    if (noteCancelBtn) noteCancelBtn.addEventListener('click', closeNoteModal);
    if (noteCloseBtn)  noteCloseBtn.addEventListener('click',  closeNoteModal);
    if (noteModalEl)   noteModalEl.addEventListener('mousedown', function (e) { if (e.target === noteModalEl) closeNoteModal(); });

    /* Note button in highlight menu — open modal */
    var hlNoteBtn   = $('er-hl-note');
    var hlSearchBtn = $('er-hl-search');
    if (hlNoteBtn) hlNoteBtn.addEventListener('click', function () {
        if (!currentSelection) { hideHlMenu(); return; }
        var excerpt = '';
        try {
            var sel = currentSelection.contents.window.getSelection();
            excerpt = sel ? sel.toString().trim().slice(0, 300) : '';
        } catch (e) {}
        hideHlMenu();
        openNoteModal(currentSelection.cfi, excerpt);
    });
    if (hlSearchBtn) hlSearchBtn.addEventListener('click', function () { showToast('Fitur pencarian segera hadir'); hideHlMenu(); });

    /* ================================================================
       Notes list (panel)
       ================================================================ */
    function buildNoteList(noteList) {
        savedNotes = noteList;
        var body = $('er-notes');
        if (!body) return;
        body.innerHTML = '';
        if (!noteList.length) {
            body.innerHTML = '<div class="er-empty-state">Belum ada catatan.<br>Pilih teks lalu tekan “Catatan”.</div>';
            return;
        }
        noteList.forEach(function (n) {
            var div = document.createElement('div');
            div.className = 'er-note-item';
            div.innerHTML =
                '<span class="er-note-color-swatch er-note-swatch-' + escHtml(n.color || 'yellow') + '"></span>'
              + '<div class="er-note-item-body">'
              + (n.note_text ? '<div class="er-note-text-body">'    + escHtml(n.note_text) + '</div>' : '')
              + (n.excerpt   ? '<div class="er-note-excerpt-body">“' + escHtml(n.excerpt) + '”</div>' : '')
              + '<div class="er-note-meta">' + escHtml(n.created_at || '') + '</div>'
              + '</div>'
              + '<button class="er-note-del" title="Hapus">&#x2715;</button>';
            div.querySelector('.er-note-del').addEventListener('click', function (e) {
                e.stopPropagation();
                api('remove_note', 'POST', { id: n.id }).then(loadNotes);
            });
            div.addEventListener('click', function () {
                try { if (n.location) rendition.display(n.location); } catch (e) {}
                closeAll();
            });
            body.appendChild(div);
        });
    }

    function loadNotes() {
        api('list_notes', 'GET', { fid: cfg.fid }).then(function (res) {
            var list = (res && res.ok && res.notes) ? res.notes : [];
            buildNoteList(list);
        }).catch(function () { buildNoteList([]); });
    }

    /* Panel tab switching */
    document.querySelectorAll('.er-panel-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            var target = tab.dataset.panelTab;
            document.querySelectorAll('.er-panel-tab').forEach(function (t) {
                t.classList.toggle('er-panel-tab-active', t.dataset.panelTab === target);
            });
            var bkDiv = $('er-bookmarks'), ntDiv = $('er-notes');
            if (bkDiv) bkDiv.style.display = target === 'bookmarks' ? '' : 'none';
            if (ntDiv) ntDiv.style.display = target === 'notes'     ? '' : 'none';
            if (target === 'notes') loadNotes();
        });
    });

    /* Close menu on outside click */
    document.addEventListener('mousedown', function (e) {
        if (hlMenu && !hlMenu.contains(e.target)) hideHlMenu();
    });

    /* ================================================================
       Panel management
       ================================================================ */
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
    document.querySelectorAll('.er-close-panel').forEach(function (btn) { btn.addEventListener('click', closeAll); });
    $('er-toggle-toc').addEventListener('click',       function () { togglePanel('er-panel-toc'); });
    $('er-toggle-bookmarks').addEventListener('click', function () { togglePanel('er-panel-bookmarks'); });
    $('er-toggle-settings').addEventListener('click',  function () { togglePanel('er-panel-settings'); });

    /* Resize → tell epub.js about new dimensions */
    var resizeTimer;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            try { rendition.resize('100%', '100%'); } catch (e) {}
        }, 200);
    });

    /* ================================================================
       Toast
       ================================================================ */
    function showToast(msg) {
        var t = $('er-toast');
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(function () { t.classList.remove('show'); }, 2200);
    }

    /* ================================================================
       Boot
       ================================================================ */
    applyFlowCss();
    loadBookmarks();
    /* Fetch notes early so highlights are ready when initRendition finishes */
    api('list_notes', 'GET', { fid: cfg.fid }).then(function (res) {
        savedNotes = (res && res.ok && res.notes) ? res.notes : [];
    }).catch(function () {});
    initRendition(currentCfi || undefined);

    /* ---- Utility ---- */
    function escHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
})();
