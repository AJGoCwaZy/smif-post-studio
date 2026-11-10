/* SMIF Post Studio: the editor.
   Runs entirely in the browser. No network calls, no tracking, photos never leave the device. */
(function () {
  'use strict';
  var B = SMIF.brand;
  var TPL = SMIF.templates;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var STORE_KEY = 'smif-post-studio:v1';
  var MAX_PHOTO_BYTES = 25 * 1024 * 1024;
  var MAX_LONG_SIDE = 2400;
  var MAX_JSON_BYTES = 40 * 1024 * 1024;
  var MAX_DATAURL_BYTES = 15 * 1024 * 1024;
  var MAX_PIXELS = 50 * 1000 * 1000;   // reject photos bigger than about 50 megapixels before decoding them

  /* ---------- brand tokens into CSS variables ---------- */
  (function applyBrand() {
    var r = document.documentElement.style;
    for (var k in B.colors) r.setProperty('--' + k, B.colors[k]);
    r.setProperty('--font-ui', B.fonts.uiStack);
    r.setProperty('--font-display', B.fonts.displayStack);
    r.setProperty('--radius', B.ui.radius);
  })();

  /* ---------- state ---------- */
  var S = {
    tpl: TPL[0].id,
    size: 'post',
    theme: 'green',
    safe: true,
    fields: {},   // fields[templateId] = { fieldId: value }
    photos: {},   // photos[templateId][slotId] = { canvas, x, y, scale }
    fontsOk: false
  };
  var logos = {};
  var lastReport = { over: {}, frames: {} };
  var storageOK = true;
  var ready = false;      // preview drawing waits for logos and the font check
  var epoch = 0;          // bumped when the whole design is replaced (Start over, Open design)
  var designSeq = 0;
  var photoSeq = {};      // latest upload per template and slot
  function hasTheme(id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(B.themes, id); }

  function tplById(id) { for (var i = 0; i < TPL.length; i++) if (TPL[i].id === id) return TPL[i]; return null; }
  function sizeById(id) { for (var i = 0; i < B.sizes.length; i++) if (B.sizes[i].id === id) return B.sizes[i]; return B.sizes[0]; }
  function curTpl() { return tplById(S.tpl); }
  function curFields() {
    var t = curTpl();
    if (!S.fields[t.id]) {
      S.fields[t.id] = {};
      t.fields.forEach(function (f) { S.fields[t.id][f.id] = f.default; });
    }
    return S.fields[t.id];
  }
  function curPhotos() { return (S.photos[S.tpl] = S.photos[S.tpl] || {}); }
  function supports(t, sizeId) { return !t.sizes || t.sizes.indexOf(sizeId) >= 0; }

  /* ---------- toast ---------- */
  var toastTimer;
  function toast(msg, isErr) {
    var el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, isErr ? 4200 : 1800);
  }

  /* ---------- fonts ---------- */
  var fontsPromise = null, fontsFailed = false;
  function ensureFonts() {
    if (S.fontsOk) return Promise.resolve(true);
    if (fontsPromise) return fontsPromise;
    var load = Promise.all(B.fontLoads.map(function (spec) {
      return document.fonts.load(spec).then(function (faces) {
        return faces.length > 0 && faces.every(function (f) { return f.status === 'loaded'; });
      }, function () { return false; });
    })).then(function (rs) { return rs.every(Boolean); });
    var timeout = new Promise(function (res) { setTimeout(function () { res(false); }, 5000); });
    fontsPromise = Promise.race([load, timeout]).then(function (ok) {
      S.fontsOk = ok;
      $('#fontBanner').hidden = ok;
      if (!ok) { fontsPromise = null; fontsFailed = true; } // allow a retry on the next export
      else if (fontsFailed && ready) { fontsFailed = false; renderThumbs(); schedule(); } // fonts arrived late
      return ok;
    });
    return fontsPromise;
  }

  /* ---------- logos ---------- */
  function loadLogos() {
    var all = Object.keys(window.SMIF_LOGOS || {}).map(function (id) {
      return new Promise(function (res) {
        var img = new Image();
        img.onload = function () { logos[id] = img; res(); };
        img.onerror = function () { res(); };
        img.src = window.SMIF_LOGOS[id];
      });
    });
    return Promise.all(all);
  }

  /* ---------- drawing ---------- */
  function themeObj() { return B.themes[S.theme]; }

  function buildAssets(preview) {
    var photos = {};
    var mine = curPhotos();
    Object.keys(mine).forEach(function (k) { photos[k] = mine[k]; });
    return { logos: logos, photos: photos, preview: preview, report: { over: {}, frames: {}, missing: [] } };
  }

  function renderTo(canvas, W, H, preview, tpl, data, theme, photos, extra) {
    var ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (extra && extra.scale) ctx.scale(extra.scale, extra.scale);
    var assets = { logos: logos, photos: photos, preview: preview, report: { over: {}, frames: {}, missing: [] } };
    try {
      tpl.draw(ctx, W, H, data, theme, assets);
    } catch (e) {
      if (window.console) console.error('Draw failed for ' + tpl.id, e);
    }
    tpl.photoSlots.forEach(function (s) {
      if (s.required && !(photos[s.id] && photos[s.id].canvas)) assets.report.missing.push(s);
    });
    return assets.report;
  }

  var raf = 0;
  function schedule() {
    if (raf || !ready) return;
    raf = requestAnimationFrame(function () { raf = 0; draw(); });
  }

  function draw() {
    var t = curTpl(), sz = sizeById(S.size);
    var cv = $('#preview');
    if (cv.width !== sz.w || cv.height !== sz.h) { cv.width = sz.w; cv.height = sz.h; }
    lastReport = renderTo(cv, sz.w, sz.h, true, t, curFields(), themeObj(), curPhotos());
    if (S.size === 'story' && S.safe) drawSafe(cv.getContext('2d'), sz);
    updateWarnings();
    $('#preview').classList.toggle('can-drag', hasDraggable());
  }

  function drawSafe(ctx, sz) {
    var s = B.storySafe;
    ctx.save();
    ctx.setLineDash([18, 12]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,60,60,0.85)';
    ctx.beginPath();
    ctx.moveTo(0, s.top); ctx.lineTo(sz.w, s.top);
    ctx.moveTo(0, sz.h - s.bottom); ctx.lineTo(sz.w, sz.h - s.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,60,60,0.9)';
    ctx.font = '600 22px Montserrat, Arial, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('Instagram covers this area', 20, 12);
    ctx.fillText('Instagram covers this area', 20, sz.h - s.bottom + 12);
    ctx.restore();
  }

  function hasDraggable() {
    var t = curTpl(), p = curPhotos();
    return t.photoSlots.some(function (s) { return s.kind !== 'qr' && p[s.id] && p[s.id].canvas; });
  }

  function updateWarnings() {
    $$('.field').forEach(function (el) {
      el.classList.toggle('is-warn', !!lastReport.over[el.getAttribute('data-field')]);
    });
    var any = Object.keys(lastReport.over).length > 0;
    var note = $('#exportNote');
    note.textContent = any ? 'Some text is too long for this template. Shorten it for the best result.' : '';
  }

  /* ---------- gallery thumbnails (rendered once) ---------- */
  function renderThumbs() {
    TPL.forEach(function (t) {
      var cv = $('#thumb-' + t.id);
      if (!cv) return;
      var sz = sizeById('post');
      var data = {};
      t.fields.forEach(function (f) { data[f.id] = f.default; });
      var tw = 216, scale = tw / sz.w;
      cv.width = tw; cv.height = Math.round(sz.h * scale);
      renderTo(cv, sz.w, sz.h, false, t, data, B.themes.green, {}, { scale: scale });
    });
  }

  function buildGallery() {
    var g = $('#gallery');
    g.textContent = '';
    TPL.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'card';
      b.setAttribute('data-tpl', t.id);
      var cv = document.createElement('canvas');
      cv.id = 'thumb-' + t.id;
      cv.width = 216; cv.height = 270;
      var nm = document.createElement('span');
      nm.className = 'cardname';
      nm.textContent = t.name;
      b.appendChild(cv); b.appendChild(nm);
      b.addEventListener('click', function () { selectTemplate(t.id, true); });
      g.appendChild(b);
    });
  }

  function markGallery() {
    $$('.card').forEach(function (c) { c.classList.toggle('is-on', c.getAttribute('data-tpl') === S.tpl); });
  }

  /* ---------- size and theme controls ---------- */
  function buildSizes() {
    var seg = $('#sizeSeg');
    seg.textContent = '';
    B.sizes.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'segbtn'; b.setAttribute('data-size', s.id);
      b.setAttribute('role', 'radio');
      var a = document.createElement('b'); a.textContent = s.label;
      var n = document.createElement('span'); n.textContent = s.note;
      b.appendChild(a); b.appendChild(n);
      b.addEventListener('click', function () { setSize(s.id); });
      seg.appendChild(b);
    });
  }
  function markSizes() {
    var t = curTpl();
    $$('.segbtn').forEach(function (b) {
      var id = b.getAttribute('data-size');
      b.classList.toggle('is-on', id === S.size);
      b.setAttribute('aria-checked', id === S.size ? 'true' : 'false');
      b.disabled = !supports(t, id);
    });
    $('#safeWrap').hidden = S.size !== 'story';
    $('#safeToggle').checked = S.safe;
  }
  function setSize(id) {
    if (!supports(curTpl(), id)) return;
    S.size = id; markSizes(); updateTitle(); schedule(); save();
  }

  function buildThemes() {
    var row = $('#themeRow');
    row.textContent = '';
    Object.keys(B.themes).forEach(function (id) {
      var t = B.themes[id];
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'themebtn'; b.setAttribute('data-theme', id);
      b.setAttribute('role', 'radio');
      var sw = document.createElement('i'); sw.style.background = t.bg;
      var lb = document.createElement('span'); lb.textContent = t.label;
      b.appendChild(sw); b.appendChild(lb);
      b.addEventListener('click', function () { S.theme = id; markThemes(); schedule(); save(); });
      row.appendChild(b);
    });
  }
  function markThemes() {
    $$('.themebtn').forEach(function (b) {
      var on = b.getAttribute('data-theme') === S.theme;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function updateTitle() {
    var sz = sizeById(S.size);
    $('#stageTitle').textContent = curTpl().name + '  |  ' + sz.label + ' ' + sz.w + ' x ' + sz.h;
  }

  /* ---------- fields ---------- */
  function buildFields() {
    var t = curTpl(), data = curFields();
    var box = $('#fields');
    box.textContent = '';
    t.fields.forEach(function (f) {
      var wrap = document.createElement('div');
      wrap.className = 'field';
      wrap.setAttribute('data-field', f.id);
      var id = 'f-' + f.id;
      var lab = document.createElement('label');
      lab.htmlFor = id; lab.textContent = f.label;
      var el;
      if (f.type === 'textarea') { el = document.createElement('textarea'); el.rows = 3; }
      else if (f.type === 'select') {
        el = document.createElement('select');
        f.options.forEach(function (o) {
          var op = document.createElement('option'); op.value = o.value; op.textContent = o.label; el.appendChild(op);
        });
      } else {
        el = document.createElement('input');
        el.type = f.type === 'date' ? 'date' : 'text';
      }
      el.id = id;
      if (f.maxLength && f.type !== 'select' && f.type !== 'date') el.maxLength = f.maxLength;
      if (f.placeholder) el.placeholder = f.placeholder;
      el.value = data[f.id] == null ? '' : data[f.id];
      el.addEventListener('input', function () {
        data[f.id] = el.value;
        schedule(); save();
      });
      el.addEventListener('change', function () { data[f.id] = el.value; schedule(); save(); });
      var chip = document.createElement('div');
      chip.className = 'warnchip';
      chip.textContent = 'Text is too long for this template';
      wrap.appendChild(lab); wrap.appendChild(el); wrap.appendChild(chip);
      box.appendChild(wrap);
    });
  }

  /* ---------- photos ---------- */
  function readHead(file, n) { return file.slice(0, n).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }

  function sniff(bytes) {
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'jpeg';
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'png';
    var riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    var webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (riff === 'RIFF' && webp === 'WEBP') return 'webp';
    var ftyp = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    var brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (ftyp === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)/.test(brand)) return 'heic';
    return '';
  }

  function toScaledCanvas(src, w, h) {
    var s = Math.min(1, MAX_LONG_SIDE / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
    var cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, cw, ch);
    return cv;
  }

  function tooBig(w, h) {
    if (w * h <= MAX_PIXELS) return null;
    var e = new Error('That photo is too large (over 50 megapixels). Resize it or take a screenshot of it.');
    e.friendly = true;
    return e;
  }

  /* Read the size from the image header only, before anything is fully decoded. */
  function probeBlob(blob) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { var e = tooBig(img.naturalWidth, img.naturalHeight); URL.revokeObjectURL(url); img.src = ''; if (e) rej(e); else res(); };
      img.onerror = function () { URL.revokeObjectURL(url); res(); }; // let the real decode report the problem
      img.src = url;
    });
  }

  function decodeBlob(blob) {
    return probeBlob(blob).then(function () { return decodeBlobNow(blob); });
  }

  function decodeBlobNow(blob) {
    var viaBitmap = typeof createImageBitmap === 'function'
      ? createImageBitmap(blob, { imageOrientation: 'from-image' }).then(function (bm) {
          var cv = toScaledCanvas(bm, bm.width, bm.height);
          if (bm.close) bm.close();
          return cv;
        })
      : Promise.reject(new Error('no bitmap'));
    return viaBitmap.catch(function () {
      return new Promise(function (res, rej) {
        var url = URL.createObjectURL(blob);
        var img = new Image();
        img.onload = function () {
          try { var cv = toScaledCanvas(img, img.naturalWidth, img.naturalHeight); URL.revokeObjectURL(url); res(cv); }
          catch (e) { URL.revokeObjectURL(url); rej(e); }
        };
        img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('decode')); };
        img.src = url;
      });
    });
  }

  function photoError(slotId, msg) {
    var el = $('[data-slot="' + slotId + '"] .photoerr');
    if (el) { el.textContent = msg; el.hidden = !msg; }
    if (msg) toast(msg, true);
  }

  function addPhotoFile(slotId, file) {
    // remember where this photo belongs, so a slow decode never lands on another template or after a reset
    var tplId = S.tpl, myEpoch = epoch, key = tplId + ':' + slotId, token = (photoSeq[key] = (photoSeq[key] || 0) + 1);
    var stale = function () { return myEpoch !== epoch || photoSeq[key] !== token; };
    var fail = function (msg) { if (S.tpl === tplId) photoError(slotId, msg); else toast(msg, true); };
    photoError(slotId, '');
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) { fail('That photo is over 25 MB. Pick a smaller one or take a screenshot of it.'); return; }
    if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
      fail("iPhone HEIC photos are not supported here. In Photos, share the photo and pick 'Save as JPEG', or take a screenshot."); return;
    }
    readHead(file, 16).then(function (bytes) {
      var kind = sniff(bytes);
      if (kind === 'heic') { fail("iPhone HEIC photos are not supported here. In Photos, share the photo and pick 'Save as JPEG', or take a screenshot."); return null; }
      if (!kind) { fail('Please pick a JPEG, PNG or WebP photo.'); return null; }
      return decodeBlob(file).then(function (cv) {
        if (stale()) return;
        (S.photos[tplId] = S.photos[tplId] || {})[slotId] = { canvas: cv, x: 0.5, y: 0.5, scale: 1, kind: kind };
        if (S.tpl === tplId) { buildPhotos(); schedule(); }
      });
    }).catch(function (e) {
      if (stale()) return;
      fail(e && e.friendly ? e.message : 'This photo could not be opened. Try a JPEG or a screenshot.');
    });
  }

  function buildPhotos() {
    var t = curTpl(), box = $('#photos');
    box.textContent = '';
    $('#photoHead').hidden = !t.photoSlots.length;
    t.photoSlots.forEach(function (slot) {
      var has = !!(curPhotos()[slot.id] && curPhotos()[slot.id].canvas);
      var wrap = document.createElement('div');
      wrap.className = 'photoslot';
      wrap.setAttribute('data-slot', slot.id);
      var h = document.createElement('h3');
      h.textContent = slot.label;
      wrap.appendChild(h);
      var row = document.createElement('div');
      row.className = 'photorow';
      var input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp'; input.hidden = true;
      input.addEventListener('change', function () { addPhotoFile(slot.id, input.files[0]); input.value = ''; });
      var add = document.createElement('button');
      add.type = 'button'; add.className = 'primary';
      add.textContent = has ? 'Replace photo' : (slot.kind === 'qr' ? 'Add QR image' : 'Add photo');
      add.addEventListener('click', function () { input.click(); });
      row.appendChild(add);
      if (has) {
        var rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'smallbtn'; rm.textContent = 'Remove';
        rm.addEventListener('click', function () { delete curPhotos()[slot.id]; buildPhotos(); schedule(); });
        row.appendChild(rm);
      }
      wrap.appendChild(row);
      if (has && slot.kind !== 'qr') {
        var zr = document.createElement('div');
        zr.className = 'zoomrow';
        var zl = document.createElement('label'); zl.textContent = 'Zoom'; zl.htmlFor = 'zoom-' + slot.id;
        var z = document.createElement('input');
        z.type = 'range'; z.min = '1'; z.max = '3'; z.step = '0.01'; z.id = 'zoom-' + slot.id;
        z.value = curPhotos()[slot.id].scale;
        z.addEventListener('input', function () { curPhotos()[slot.id].scale = parseFloat(z.value); schedule(); });
        var rs = document.createElement('button');
        rs.type = 'button'; rs.className = 'smallbtn'; rs.textContent = 'Reset';
        rs.addEventListener('click', function () { var p = curPhotos()[slot.id]; p.x = 0.5; p.y = 0.5; p.scale = 1; z.value = 1; schedule(); });
        zr.appendChild(zl); zr.appendChild(z); zr.appendChild(rs);
        wrap.appendChild(zr);
        var n = document.createElement('p'); n.className = 'photonote'; n.textContent = 'Drag the picture in the preview to move it.';
        wrap.appendChild(n);
      } else if (slot.kind === 'qr') {
        var n2 = document.createElement('p'); n2.className = 'photonote'; n2.textContent = 'Use a square image of the code. It stays square and sits on a light tile so it scans.';
        wrap.appendChild(n2);
      } else {
        var n3 = document.createElement('p'); n3.className = 'photonote'; n3.textContent = 'JPEG, PNG or WebP. You can also drop a photo on the preview. It stays on your device.';
        wrap.appendChild(n3);
      }
      var err = document.createElement('p'); err.className = 'photoerr'; err.hidden = true; err.setAttribute('role', 'alert');
      wrap.appendChild(err);
      wrap.appendChild(input);
      // drag and drop onto the slot box
      wrap.addEventListener('dragover', function (e) { e.preventDefault(); wrap.classList.add('is-over'); });
      wrap.addEventListener('dragleave', function () { wrap.classList.remove('is-over'); });
      wrap.addEventListener('drop', function (e) {
        e.preventDefault(); wrap.classList.remove('is-over');
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) addPhotoFile(slot.id, f);
      });
      box.appendChild(wrap);
    });
  }

  /* ---------- drag on preview ---------- */
  function canvasPoint(e) {
    var cv = $('#preview'), r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) };
  }
  function frameAt(p) {
    var t = curTpl(), photos = curPhotos();
    for (var i = 0; i < t.photoSlots.length; i++) {
      var s = t.photoSlots[i];
      if (s.kind === 'qr' || !(photos[s.id] && photos[s.id].canvas)) continue;
      var f = lastReport.frames[s.id];
      if (f && p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h) return { slot: s.id, frame: f };
    }
    return null;
  }
  var drag = null;
  (function bindPreview() {
    var cv = $('#preview');
    cv.addEventListener('pointerdown', function (e) {
      var p = canvasPoint(e), hit = frameAt(p);
      if (!hit) return;
      var ph = curPhotos()[hit.slot];
      drag = { slot: hit.slot, frame: hit.frame, sx: p.x, sy: p.y, x0: ph.x, y0: ph.y };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      cv.classList.add('dragging');
      e.preventDefault();
    });
    cv.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var p = canvasPoint(e), ph = curPhotos()[drag.slot];
      var f = lastReport.frames[drag.slot] || drag.frame;
      if (f.ow > 0.5) ph.x = Math.max(0, Math.min(1, drag.x0 - (p.x - drag.sx) / f.ow));
      if (f.oh > 0.5) ph.y = Math.max(0, Math.min(1, drag.y0 - (p.y - drag.sy) / f.oh));
      schedule();
    });
    function end() { drag = null; cv.classList.remove('dragging'); }
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    // drop a photo on the preview
    cv.addEventListener('dragover', function (e) { e.preventDefault(); });
    cv.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      var t = curTpl();
      var slot = t.photoSlots.filter(function (s) { return s.kind !== 'qr'; })[0] || t.photoSlots[0];
      if (f && slot) addPhotoFile(slot.id, f);
    });
  })();

  /* ---------- template selection ---------- */
  function selectTemplate(id, goEdit) {
    S.tpl = id;
    if (!supports(curTpl(), S.size)) S.size = 'post';
    markGallery(); markSizes(); buildFields(); buildPhotos(); updateTitle(); schedule(); save();
    if (goEdit && window.matchMedia('(max-width: 799px)').matches) setTab('edit');
  }

  /* ---------- tabs and views ---------- */
  function setTab(t) {
    document.body.setAttribute('data-tab', t);
    $$('.tab').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-tab-btn') === t); });
  }
  function setView(v) {
    document.body.setAttribute('data-view', v);
    $('#studio').hidden = v !== 'studio';
    $('#brandkit').hidden = v !== 'brand';
    $$('.navbtn').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-view-btn') === v); });
    if (v === 'studio') schedule();
  }
  $$('.tab').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.getAttribute('data-tab-btn');
      if (t === 'brand') setView('brand'); else setTab(t);
    });
  });
  $$('.navbtn').forEach(function (b) { b.addEventListener('click', function () { setView(b.getAttribute('data-view-btn')); }); });

  /* ---------- autosave (text, template, size, theme only. Never photos.) ---------- */
  var saveTimer;
  function setSaveState(msg) { $('#saveState').textContent = msg; }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, template: S.tpl, size: S.size, theme: S.theme, safe: S.safe, fields: S.fields }));
        storageOK = true; setSaveState('Saved on this device');
      } catch (e) { storageOK = false; setSaveState('Not saved (browser storage is off)'); }
    }, 300);
  }
  function loadSaved() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (!o || o.v !== 1) return;
      if (tplById(o.template)) S.tpl = o.template;
      if (B.sizes.some(function (s) { return s.id === o.size; })) S.size = o.size;
      if (hasTheme(o.theme)) S.theme = o.theme;
      if (typeof o.safe === 'boolean') S.safe = o.safe;
      if (o.fields && typeof o.fields === 'object') {
        TPL.forEach(function (t) {
          var src = o.fields[t.id]; if (!src || typeof src !== 'object') return;
          var d = {};
          t.fields.forEach(function (f) { d[f.id] = cleanField(f, src[f.id]); });
          S.fields[t.id] = d;
        });
      }
      setSaveState('Saved on this device');
    } catch (e) { /* ignore a broken save */ }
  }
  function cleanField(f, v) {
    if (typeof v !== 'string') return f.default;
    if (f.type === 'select') return f.options.some(function (o) { return o.value === v; }) ? v : f.default;
    if (f.type === 'date') return v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : f.default; // empty means no date
    return f.maxLength ? v.slice(0, f.maxLength) : v;
  }

  $('#resetBtn').addEventListener('click', function () {
    if (!window.confirm('Start over? This clears your saved text and photos on this device.')) return;
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    epoch++;
    S.fields = {}; S.photos = {}; S.theme = 'green'; S.size = 'post'; S.safe = true; S.tpl = TPL[0].id;
    markGallery(); markSizes(); markThemes(); buildFields(); buildPhotos(); updateTitle(); schedule();
    setSaveState('');
    toast('Cleared');
  });

  $('#safeToggle').addEventListener('change', function (e) { S.safe = e.target.checked; schedule(); save(); });

  /* ---------- export ---------- */
  var modalUrl = null;
  function todayStr() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function fileName() { return 'smif-' + curTpl().slug + '-' + todayStr() + '.png'; }

  function makeBlob() {
    return ensureFonts().then(function (ok) {
      if (!ok) { toast('Fonts did not load, refresh the page.', true); return null; }
      var t = curTpl(), sz = sizeById(S.size);
      var cv = document.createElement('canvas');
      cv.width = sz.w; cv.height = sz.h; // exact pixels, never multiplied by pixel ratio
      var rep = renderTo(cv, sz.w, sz.h, false, t, curFields(), themeObj(), curPhotos());
      var cut = Object.keys(rep.over).length > 0;
      var msgs = [];
      if (rep.missing.length) msgs.push('No photo added yet.');
      if (cut) msgs.push('Some text is cut off.');
      if (msgs.length && !window.confirm(msgs.join(' ') + ' Download anyway?')) return null;
      return new Promise(function (res) {
        cv.toBlob(function (b) {
          if (!b) { toast('Could not make the image. Try a smaller photo or another browser.', true); res(null); return; }
          res(b);
        }, 'image/png');
      });
    });
  }

  function isIOS() {
    return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function showModal(blob) {
    closeModal();
    modalUrl = URL.createObjectURL(blob);
    $('#modalImg').src = modalUrl;
    $('#modal').hidden = false;
    $('#modalClose').focus();
  }
  function closeModal() {
    $('#modal').hidden = true;
    $('#modalImg').removeAttribute('src');
    if (modalUrl) { URL.revokeObjectURL(modalUrl); modalUrl = null; }
  }
  $('#modalClose').addEventListener('click', closeModal);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 20000);
  }

  $('#downloadBtn').addEventListener('click', function () {
    makeBlob().then(function (b) {
      if (!b) return;
      if (isIOS()) { showModal(b); } else { downloadBlob(b, fileName()); toast('Downloaded'); }
    });
  });
  $('#showBtn').addEventListener('click', function () {
    makeBlob().then(function (b) { if (b) showModal(b); });
  });
  $('#shareBtn').addEventListener('click', function () {
    makeBlob().then(function (b) {
      if (!b) return;
      var file = new File([b], fileName(), { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'SMIF post' }).catch(function (e) {
          if (e && e.name !== 'AbortError') showModal(b);
        });
      } else showModal(b);
    });
  });
  (function checkShare() {
    try {
      var f = new File([new Blob(['x'], { type: 'image/png' })], 'a.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        $('#shareBtn').hidden = false;
        $('#actions').classList.add('has-share');
      }
    } catch (e) { /* no share */ }
  })();

  /* ---------- save and open a design file ---------- */
  function hasAlpha(cv) {
    var d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    for (var i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
    return false;
  }
  /* JPEG for ordinary photos (small files), PNG for QR codes and anything with transparency.
     The result is kept on the photo, so saving again does not encode it again. */
  function photoToData(p, kind) {
    if (p.data) return p.data;
    var png = kind === 'qr' || (p.kind !== 'jpeg' && hasAlpha(p.canvas));
    p.data = png ? p.canvas.toDataURL('image/png') : p.canvas.toDataURL('image/jpeg', 0.9);
    return p.data;
  }
  $('#saveBtn').addEventListener('click', function () {
    var t = curTpl(), photos = {};
    var mine = curPhotos();
    try {
      t.photoSlots.forEach(function (s) {
        var p = mine[s.id];
        if (p && p.canvas) photos[s.id] = { dataUrl: photoToData(p, s.kind), x: p.x, y: p.y, scale: p.scale };
      });
      var doc = { app: 'smif-post-studio', version: 1, template: t.id, size: S.size, theme: S.theme, fields: curFields(), photos: photos };
      var blob = new Blob([JSON.stringify(doc)], { type: 'application/json' });
      downloadBlob(blob, 'smif-' + t.slug + '-' + todayStr() + '.smif.json');
      toast('Design saved to your downloads');
    } catch (e) { toast('Could not save this design.', true); }
  });

  $('#openBtn').addEventListener('click', function () { $('#openFile').click(); });
  $('#openFile').addEventListener('change', function (e) {
    var file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    if (file.size > MAX_JSON_BYTES) { toast('That file is too big to be a SMIF design.', true); return; }
    file.text().then(function (txt) {
      var doc;
      try { doc = JSON.parse(txt); } catch (err) { throw new Error('This is not a SMIF design file.'); }
      return applyDesign(doc);
    }).then(function () { toast('Design opened'); }, function (err) { toast(err && err.message ? err.message : 'Could not open that file.', true); });
  });

  function dataUrlToCanvas(u) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        if (tooBig(img.naturalWidth, img.naturalHeight)) { rej(new Error('This design has a photo that is too large to open.')); return; }
        try { res(toScaledCanvas(img, img.naturalWidth, img.naturalHeight)); } catch (e) { rej(e); }
      };
      img.onerror = function () { rej(new Error('This design has a photo that could not be opened.')); };
      img.src = u;
    });
  }

  function applyDesign(doc) {
    if (!doc || doc.app !== 'smif-post-studio' || doc.version !== 1) throw new Error('This is not a SMIF design file.');
    var t = tplById(doc.template);
    if (!t) throw new Error('This design uses a template this version does not have.');
    if (!B.sizes.some(function (s) { return s.id === doc.size; })) throw new Error('This design has an unknown size.');
    if (!hasTheme(doc.theme)) throw new Error('This design has an unknown theme.');
    var src = doc.fields && typeof doc.fields === 'object' ? doc.fields : {};
    var data = {};
    t.fields.forEach(function (f) { data[f.id] = cleanField(f, src[f.id]); });
    var jobs = [];
    var photos = {};
    var mySeq = ++designSeq;
    var pin = doc.photos && typeof doc.photos === 'object' ? doc.photos : {};
    t.photoSlots.forEach(function (s) {
      var p = pin[s.id];
      if (!p || typeof p.dataUrl !== 'string') return;
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.dataUrl) || p.dataUrl.length > MAX_DATAURL_BYTES) throw new Error('This design has a photo in a format that is not allowed.');
      jobs.push(dataUrlToCanvas(p.dataUrl).then(function (cv) {
        var num = function (v, lo, hi, d) { return typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
        photos[s.id] = { canvas: cv, x: num(p.x, 0, 1, 0.5), y: num(p.y, 0, 1, 0.5), scale: num(p.scale, 1, 3, 1), data: p.dataUrl };
      }));
    });
    return Promise.all(jobs).then(function () {
      if (mySeq !== designSeq) return; // a newer Open design replaced this one
      epoch++;
      S.tpl = t.id; S.size = doc.size; S.theme = doc.theme;
      S.fields[t.id] = data; S.photos[t.id] = photos;
      markGallery(); markSizes(); markThemes(); buildFields(); buildPhotos(); updateTitle(); schedule(); save();
    });
  }

  /* ---------- brand kit ---------- */
  function copyText(txt) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove(); return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(txt).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }

  function buildBrandKit() {
    var lg = $('#logoGrid'); lg.textContent = '';
    B.logos.forEach(function (l) {
      var card = document.createElement('div'); card.className = 'logocard';
      var view = document.createElement('div'); view.className = 'logoview';
      view.style.background = B.themes[l.onTheme].bg;
      var img = document.createElement('img'); img.src = l.file; img.alt = 'SMIF logo, ' + l.label;
      view.appendChild(img);
      var foot = document.createElement('div'); foot.className = 'logofoot';
      var nm = document.createElement('span'); nm.textContent = l.label;
      var a = document.createElement('a'); a.href = l.file; a.download = 'smif-logo-' + l.id + '.png'; a.textContent = 'Download';
      foot.appendChild(nm); foot.appendChild(a);
      card.appendChild(view); card.appendChild(foot); lg.appendChild(card);
    });
    var sw = $('#swatches'); sw.textContent = '';
    var names = { green: 'Club green', gold: 'Gold', ivory: 'Ivory', charcoal: 'Charcoal' };
    var list = Object.keys(names).map(function (k) { return { name: names[k], hex: B.colors[k] }; });
    B.divisions.forEach(function (d) { list.push({ name: d.name, hex: d.color }); });
    list.forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'swatch';
      b.setAttribute('aria-label', 'Copy ' + c.name + ' ' + c.hex);
      var chip = document.createElement('span'); chip.className = 'chip'; chip.style.background = c.hex;
      var meta = document.createElement('span'); meta.className = 'meta';
      var n = document.createElement('b'); n.textContent = c.name;
      var h = document.createElement('span'); h.textContent = c.hex.toUpperCase();
      meta.appendChild(n); meta.appendChild(h);
      b.appendChild(chip); b.appendChild(meta);
      b.addEventListener('click', function () {
        copyText(c.hex.toUpperCase()).then(function (ok) { toast(ok ? 'Copied ' + c.hex.toUpperCase() : 'Could not copy', !ok); });
      });
      sw.appendChild(b);
    });
    var fl = $('#fontList'); fl.textContent = '';
    B.fontLinks.forEach(function (f, i) {
      var card = document.createElement('div'); card.className = 'fontcard';
      var s = document.createElement('div'); s.className = 'sample';
      s.style.fontFamily = i === 0 ? B.fonts.displayStack : B.fonts.uiStack;
      s.style.fontWeight = i === 0 ? '800' : '600';
      s.textContent = f.name;
      var u = document.createElement('div'); u.textContent = f.use + '. Free to use.';
      var a = document.createElement('a'); a.href = f.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'Get it on Google Fonts';
      card.appendChild(s); card.appendChild(u); card.appendChild(a); fl.appendChild(card);
    });
  }

  /* ---------- start ---------- */
  function init() {
    loadSaved();
    buildGallery(); buildSizes(); buildThemes(); buildBrandKit();
    markGallery(); markSizes(); markThemes(); buildFields(); buildPhotos(); updateTitle();
    setView('studio'); setTab('templates');
    if (!storageOK) setSaveState('');
    // draw only once logos are in and the font check has finished (if fonts fail, the banner shows and export stays blocked)
    Promise.all([loadLogos(), ensureFonts()]).then(function () {
      ready = true;
      renderThumbs(); draw();
    });
    // redraw once more when any late font arrives
    if (document.fonts && document.fonts.addEventListener) {
      document.fonts.addEventListener('loadingdone', function () { schedule(); });
    }
    window.addEventListener('resize', function () { /* canvas scales with CSS, nothing to redraw */ });
    // expose a small hook so tests can set photos and state
    SMIF.app = { state: S, draw: draw, selectTemplate: selectTemplate, setSize: setSize, setTheme: function (id) { S.theme = id; markThemes(); schedule(); }, renderTo: renderTo, ensureFonts: ensureFonts };
  }
  init();
})();
