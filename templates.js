/* SMIF Post Studio: templates and drawing helpers.
   Every template is one object in SMIF.templates. To add a template, copy one object,
   give it a new id, change the fields and rewrite its draw function.

   Template shape:
     id, name, blurb, slug (used in the file name)
     fields:     [{ id, label, type: 'text'|'textarea'|'select'|'date', default, maxLength, placeholder, options? }]
     photoSlots: [{ id, label, required, kind? }]   (kind 'qr' means a square code that is never cropped)
     sizes:      optional list of size ids it supports (default: all)
     draw(ctx, W, H, data, theme, assets)
   The draw function branches on c.k: 'tall' (story), 'portrait' (post), 'square', 'wide' (LinkedIn). */
window.SMIF = window.SMIF || {};

(function () {
  var B = SMIF.brand;
  var D = (SMIF.draw = {});
  var DISPLAY = B.fonts.displayStack;
  var UI = B.fonts.uiStack;
  var LOGO_RATIO = 426 / 968;

  /* ---------- basic helpers ---------- */
  function kindOf(W, H) {
    var r = H / W;
    if (r > 1.6) return 'tall';
    if (r > 1.2) return 'portrait';
    if (r > 0.9) return 'square';
    return 'wide';
  }
  D.kindOf = kindOf;

  D.rgba = function (hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };

  D.date = function (iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return { long: iso || '', mon: '', day: '', wd: '' };
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    var o = { timeZone: 'UTC' };
    return {
      long: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }),
      mon: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase(),
      day: String(+m[3]),
      wd: d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
    };
  };

  /* Context object handed around while drawing one template. */
  D.ctx = function (ctx, W, H, data, theme, assets, opts) {
    opts = opts || {};
    var k = kindOf(W, H);
    var u = { tall: 1.1, portrait: 1, square: 0.9, wide: 0.64 }[k];
    var m = k === 'wide' ? Math.round(W * 0.055) : Math.round(W * 0.07);
    var safe = B.storySafe;
    var c = {
      ctx: ctx, W: W, H: H, k: k, u: u, m: m, data: data, theme: theme, assets: assets,
      top: k === 'tall' ? safe.top + 14 : m,
      bottom: k === 'tall' ? H - safe.bottom : H - m,
      x0: m, x1: W - m,
      split: !!opts.split,
      px: function (n) { return Math.round(n * u); }
    };
    c.cw = c.x1 - c.x0;
    if (c.split) {
      c.tx1 = c.x0 + Math.round((c.x1 - c.x0) * (opts.splitRatio || 0.58));
      c.mx0 = c.tx1 + Math.round(c.cw * 0.06); // media column
    } else {
      c.tx1 = c.x1;
    }
    c.tw = c.tx1 - c.x0;
    return c;
  };

  /* ---------- background and decoration ---------- */
  D.bg = function (c, o) {
    var ctx = c.ctx, t = c.theme;
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, c.W, c.H);
    var g = ctx.createRadialGradient(c.W * 0.15, 0, 0, c.W * 0.15, 0, Math.max(c.W, c.H) * 1.1);
    g.addColorStop(0, t.bg2);
    g.addColorStop(1, t.bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.W, c.H);
    if (!o || o.deco !== false) {
      // faint concentric arcs in the bottom right corner
      ctx.save();
      ctx.strokeStyle = D.rgba(t.accent, 0.16);
      ctx.lineWidth = Math.max(1.5, 2 * c.u);
      var cx = c.W, cy = c.H, base = Math.min(c.W, c.H) * 0.32;
      for (var i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, base + i * base * 0.22, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  D.rule = function (c, x1, x2, y, o) {
    o = o || {};
    var ctx = c.ctx;
    ctx.save();
    ctx.strokeStyle = o.color || c.theme.accent;
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.lineWidth = o.width || Math.max(2, Math.round(2.5 * c.u));
    ctx.beginPath();
    ctx.moveTo(x1, y + 0.5);
    ctx.lineTo(x2, y + 0.5);
    ctx.stroke();
    ctx.restore();
  };

  D.roundRectPath = function (ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  /* ---------- text ---------- */
  function fontStr(o, size) {
    var fam = o.fam === 'display' ? DISPLAY : UI;
    return (o.italic ? 'italic ' : '') + (o.weight || 500) + ' ' + size + 'px ' + fam;
  }

  function wrap(ctx, text, maxW) {
    var out = [], broke = false;
    var paras = String(text == null ? '' : text).split(/\r?\n/);
    for (var p = 0; p < paras.length; p++) {
      var words = paras[p].split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(''); continue; }
      var line = '';
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        while (ctx.measureText(w).width > maxW && w.length > 1) {
          var n = w.length;
          while (n > 1 && ctx.measureText(w.slice(0, n)).width > maxW) n--;
          if (line) { out.push(line); line = ''; }
          out.push(w.slice(0, n));
          w = w.slice(n);
          broke = true;
        }
        var t = line ? line + ' ' + w : w;
        if (ctx.measureText(t).width <= maxW) line = t;
        else { out.push(line); line = w; }
      }
      out.push(line);
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    return { lines: out, broke: broke };
  }

  /* Measure a text block: wraps to box width, shrinks step by step until it fits box height.
     o: fam('display'|'ui'), weight, italic, maxSize, minSize, lh, w, h, upper, maxLines, field */
  D.fit = function (c, text, o) {
    var ctx = c.ctx;
    text = String(text == null ? '' : text).trim();
    if (o.upper) text = text.toUpperCase();
    var lh = o.lh || 1.2;
    var step = Math.max(1, Math.round(o.maxSize * 0.04));
    var res = null;
    if (!text) return { lines: [], size: o.maxSize, lh: lh, h: 0, over: false, o: o, empty: true };
    for (var s = o.maxSize; s >= o.minSize - 0.01; s -= step) {
      var size = Math.max(s, o.minSize);
      ctx.font = fontStr(o, size);
      var wr = wrap(ctx, text, o.w);
      var okLines = !o.maxLines || wr.lines.length <= o.maxLines;
      var hh = wr.lines.length * size * lh;
      if (okLines && hh <= o.h + 0.5 && (!wr.broke || size <= o.minSize)) {
        res = { lines: wr.lines, size: size, lh: lh, h: hh, over: false, o: o };
        break;
      }
      if (size <= o.minSize) break;
    }
    if (!res) {
      ctx.font = fontStr(o, o.minSize);
      var w2 = wrap(ctx, text, o.w);
      var cap = Math.floor(o.h / (o.minSize * lh) + 0.02);
      var tooShort = cap < 1;
      if (tooShort) cap = o.h > 0 ? 1 : 0; // a box shorter than one line: show one line but flag it, none if there is no room at all
      if (o.maxLines) cap = Math.min(cap, o.maxLines);
      var over = tooShort || w2.lines.length > cap;
      var lines = w2.lines.slice(0, cap);
      res = { lines: lines, size: o.minSize, lh: lh, h: lines.length * o.minSize * lh, over: over, o: o };
    }
    if (res.over && o.field && c.assets && c.assets.report) c.assets.report.over[o.field] = true;
    return res;
  };

  /* Draw a measured block. align: left, center, right. x is the left edge for left,
     the center for center, the right edge for right. */
  D.drawFit = function (c, f, x, y, color, align) {
    var ctx = c.ctx;
    ctx.save();
    ctx.font = fontStr(f.o, f.size);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    var pad = f.size * (f.lh - 1) / 2;
    for (var i = 0; i < f.lines.length; i++) {
      ctx.fillText(f.lines[i], x, y + i * f.size * f.lh + pad * 0.6);
    }
    ctx.restore();
    return f.h;
  };

  /* Measure and draw in one go. Returns the height used. */
  D.block = function (c, text, o, x, y, color, align) {
    var f = D.fit(c, text, o);
    D.drawFit(c, f, x, y, color, align);
    return f.h;
  };

  /* Uppercase, letter spaced, one line. Returns the width drawn. */
  D.label = function (c, text, x, y, o) {
    o = o || {};
    var ctx = c.ctx;
    var size = o.size || c.px(24);
    var t = String(text == null ? '' : text).toUpperCase();
    if (!t) return 0;
    var spacing = o.spacing == null ? 0.2 : o.spacing;
    var weight = o.weight || 600;
    function widthAt(s) {
      ctx.font = weight + ' ' + s + 'px ' + UI;
      var w = 0;
      for (var i = 0; i < t.length; i++) w += ctx.measureText(t[i]).width;
      return w + spacing * s * (t.length - 1);
    }
    var s = size, w = widthAt(s);
    while (o.maxW && w > o.maxW && s > size * 0.55) { s -= 1; w = widthAt(s); }
    var clipped = !!(o.maxW && w > o.maxW + 0.5);
    if (clipped && o.field && c.assets && c.assets.report) c.assets.report.over[o.field] = true;
    var sx = x;
    if (o.align === 'right') sx = x - w;
    else if (o.align === 'center') sx = x - w / 2;
    ctx.save();
    if (clipped) { // still too wide at the smallest size: keep it inside its box
      var cl0 = o.align === 'right' ? x - o.maxW : o.align === 'center' ? x - o.maxW / 2 : x;
      ctx.beginPath(); ctx.rect(cl0, y - s, o.maxW, s * 3); ctx.clip();
      sx = cl0;
    }
    ctx.font = weight + ' ' + s + 'px ' + UI;
    ctx.fillStyle = o.color || c.theme.accentText;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    var cx = sx;
    for (var i = 0; i < t.length; i++) {
      ctx.fillText(t[i], cx, y);
      cx += ctx.measureText(t[i]).width + spacing * s;
    }
    ctx.restore();
    return w;
  };

  /* ---------- logo, header, footer ---------- */
  D.logo = function (c, x, y, w, align) {
    var img = c.assets.logos[c.theme.logo];
    var h = w * LOGO_RATIO;
    var lx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    if (img) c.ctx.drawImage(img, lx, y, w, h);
    return h;
  };

  /* Small gold label at the top with a thin gold rule running to the right edge. */
  D.eyebrow = function (c, text, o) {
    o = o || {};
    var size = c.px(25);
    var y = c.top;
    var w = D.label(c, text, c.x0, y, { size: size, maxW: c.tw * 0.7, field: o.field });
    var gap = c.px(22);
    D.rule(c, c.x0 + w + gap, c.tx1, y + size * 0.5, { alpha: 0.9 });
    return y + size * 1.2;
  };

  /* Logo at the bottom, thin rule above it. Returns the y where content must stop. */
  D.footer = function (c) {
    var ctx = c.ctx;
    var lw = Math.round(c.W * (c.k === 'wide' ? 0.17 : c.k === 'square' ? 0.2 : 0.22));
    var lh = lw * LOGO_RATIO;
    var ly = c.bottom - lh;
    var ry = ly - c.px(26);
    D.rule(c, c.x0, c.tx1, ry, { alpha: 0.55, width: Math.max(1.5, 2 * c.u) });
    D.logo(c, c.x0, ly, lw, 'left');
    var tag = B.tagline || [];
    if (tag.length && !c.split) {
      var size = c.px(21);
      var lh2 = size * 1.5;
      var ty = ly + lh / 2 - (tag.length * lh2) / 2 + size * 0.1;
      for (var i = 0; i < tag.length; i++) {
        D.label(c, tag[i], c.tx1, ty + i * lh2, { size: size, align: 'right', color: c.theme.muted, spacing: 0.22, weight: 500 });
      }
    }
    return ry - c.px(24);
  };

  /* ---------- photos ---------- */
  D.placeholder = function (c, r, o) {
    o = o || {};
    var ctx = c.ctx, t = c.theme;
    ctx.save();
    if (o.circle) { ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2); ctx.closePath(); }
    else D.roundRectPath(ctx, r.x, r.y, r.w, r.h, o.radius || 0);
    ctx.clip();
    ctx.fillStyle = t.panel;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // rising bars, a quiet market motif
    var n = 9, bw = r.w / n;
    ctx.fillStyle = D.rgba(t.accent, 0.2);
    for (var i = 0; i < n; i++) {
      var bh = r.h * (0.18 + 0.5 * ((i * 37) % 10) / 10 + i * 0.03);
      ctx.fillRect(r.x + i * bw + bw * 0.14, r.y + r.h - bh, bw * 0.72, bh);
    }
    ctx.strokeStyle = D.rgba(t.accent, 0.6);
    ctx.lineWidth = Math.max(2, 3 * c.u);
    ctx.beginPath();
    for (var j = 0; j <= 6; j++) {
      var px = r.x + (r.w * j) / 6, py = r.y + r.h * (0.72 - j * 0.085 + ((j * 5) % 3) * 0.03);
      if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
    if (c.assets.preview && !o.quiet) {
      ctx.save();
      ctx.fillStyle = t.text;
      ctx.globalAlpha = 0.85;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var fs = Math.max(16, Math.min(r.w, r.h) * 0.07);
      ctx.font = '600 ' + fs + 'px ' + UI;
      ctx.fillText('Add a photo', r.x + r.w / 2, r.y + r.h / 2);
      ctx.restore();
    }
  };

  /* Draw the photo for a slot cover-cropped into rect r, using the crop {x,y,scale}.
     x,y are 0..1 (0.5 is centered): where the visible window sits in the extra image area. */
  D.photo = function (c, slotId, r, o) {
    o = o || {};
    var ctx = c.ctx;
    var ph = c.assets.photos[slotId];
    if (c.assets.report) c.assets.report.frames[slotId] = { x: r.x, y: r.y, w: r.w, h: r.h, ow: 0, oh: 0 };
    if (!ph || !ph.canvas) {
      D.placeholder(c, r, o);
      return false;
    }
    var iw = ph.canvas.width, ih = ph.canvas.height;
    var s0 = Math.max(r.w / iw, r.h / ih) * Math.max(1, ph.scale || 1);
    var dw = iw * s0, dh = ih * s0;
    var ox = dw - r.w, oy = dh - r.h;
    var dx = r.x - ox * (ph.x == null ? 0.5 : ph.x);
    var dy = r.y - oy * (ph.y == null ? 0.5 : ph.y);
    if (c.assets.report) { var fr = c.assets.report.frames[slotId]; fr.ow = ox; fr.oh = oy; fr.circle = !!o.circle; }
    ctx.save();
    if (o.circle) { ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2); ctx.closePath(); }
    else D.roundRectPath(ctx, r.x, r.y, r.w, r.h, o.radius || 0);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(ph.canvas, dx, dy, dw, dh);
    ctx.restore();
    return true;
  };

  /* Thin gold outline offset around a photo frame. */
  D.frameOutline = function (c, r, o) {
    o = o || {};
    var ctx = c.ctx, off = c.px(14);
    ctx.save();
    ctx.strokeStyle = c.theme.accent;
    ctx.lineWidth = Math.max(2, 2.5 * c.u);
    if (o.circle) {
      ctx.beginPath();
      ctx.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + off, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      D.roundRectPath(ctx, r.x - off, r.y - off, r.w + 2 * off, r.h + 2 * off, (o.radius || 0) + off * 0.4);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* The QR tile: ivory or white square, QR kept square, margin 10 percent of the QR size or more.
     Returns the tile rect. size is the tile edge. */
  D.qrTile = function (c, slotId, x, y, tile) {
    var ctx = c.ctx, t = c.theme;
    var qr = Math.floor(tile / 1.24);
    var pad = (tile - qr) / 2;
    ctx.save();
    ctx.fillStyle = t.tile;
    D.roundRectPath(ctx, x, y, tile, tile, c.px(10));
    ctx.fill();
    ctx.restore();
    var ph = c.assets.photos[slotId];
    if (c.assets.report) c.assets.report.frames[slotId] = { x: x + pad, y: y + pad, w: qr, h: qr, ow: 0, oh: 0 };
    if (ph && ph.canvas) {
      var iw = ph.canvas.width, ih = ph.canvas.height;
      var s = Math.min(qr / iw, qr / ih);
      var dw = iw * s, dh = ih * s;
      ctx.save();
      ctx.imageSmoothingEnabled = s < 1; // keep a small code crisp when enlarged
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x + pad, y + pad, qr, qr);
      ctx.drawImage(ph.canvas, x + pad + (qr - dw) / 2, y + pad + (qr - dh) / 2, dw, dh);
      ctx.restore();
    } else {
      // drawn guide squares, only a placeholder
      ctx.save();
      ctx.strokeStyle = t.onTile;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = Math.max(2, 3 * c.u);
      var q = qr * 0.26;
      [[0, 0], [1, 0], [0, 1]].forEach(function (p) {
        ctx.strokeRect(x + pad + p[0] * (qr - q), y + pad + p[1] * (qr - q), q, q);
      });
      if (c.assets.preview) {
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = t.onTile;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '600 ' + Math.max(14, qr * 0.075) + 'px ' + UI;
        ctx.fillText('Add QR code', x + tile / 2, y + tile / 2);
      }
      ctx.restore();
    }
    return { x: x, y: y, w: tile, h: tile, qr: qr };
  };

  /* Date card used when an event has no photo. */
  D.dateCard = function (c, r, iso) {
    var ctx = c.ctx, t = c.theme, d = D.date(iso);
    ctx.save();
    D.roundRectPath(ctx, r.x, r.y, r.w, r.h, c.px(8));
    ctx.fillStyle = t.panel;
    ctx.fill();
    ctx.lineWidth = Math.max(2, 2.5 * c.u);
    ctx.strokeStyle = D.rgba(t.accent, 0.7);
    ctx.stroke();
    ctx.restore();
    var cx = r.x + r.w / 2;
    var tall = r.h > r.w * 0.9;
    var monSize = Math.min(r.h * 0.12, r.w * 0.12);
    var daySize = Math.min(r.h * (tall ? 0.38 : 0.5), r.w * 0.52);
    var total = monSize * 1.4 + daySize * 0.95 + monSize * 1.2;
    var y = r.y + (r.h - total) / 2;
    D.label(c, d.mon, cx, y, { size: monSize, align: 'center', spacing: 0.3, weight: 700 });
    ctx.save();
    ctx.fillStyle = t.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '800 ' + daySize + 'px ' + DISPLAY;
    ctx.fillText(d.day, cx, y + monSize * 1.2);
    ctx.restore();
    D.label(c, d.wd, cx, y + monSize * 1.2 + daySize * 1.02, { size: monSize * 0.8, align: 'center', color: t.muted, weight: 500, spacing: 0.25 });
  };

  /* Rows of "LABEL   value" separated by hairlines. rows: [{label, value, field}] */
  D.infoRows = function (c, rows, x, y, w, o) {
    o = o || {};
    var size = o.size || c.px(34);
    var labelW = o.labelW || c.px(170);
    var pad = o.pad || c.px(16);
    var ctx = c.ctx, total = 0;
    rows = rows.filter(function (r) { return String(r.value || '').trim(); });
    for (var i = 0; i < rows.length; i++) {
      var f = D.fit(c, rows[i].value, { fam: 'ui', weight: 600, maxSize: size, minSize: Math.max(20, size * 0.62), lh: 1.25, w: w - labelW, h: size * 1.25 * 2, maxLines: 2, field: rows[i].field });
      var rh = Math.max(f.h, size * 1.25) + pad * 2;
      D.rule(c, x, x + w, y + total, { alpha: 0.35, width: Math.max(1, 1.5 * c.u) });
      D.label(c, rows[i].label, x, y + total + pad + size * 0.3, { size: Math.max(14, size * 0.58), spacing: 0.2 });
      D.drawFit(c, f, x + labelW, y + total + pad, c.theme.text);
      total += rh;
    }
    if (rows.length) D.rule(c, x, x + w, y + total, { alpha: 0.35, width: Math.max(1, 1.5 * c.u) });
    return total;
  };

  /* ---------- sample fields helper ---------- */
  function F(id, label, type, def, max, ph, extra) {
    var f = { id: id, label: label, type: type, default: def, maxLength: max, placeholder: ph || '' };
    if (extra) for (var k in extra) f[k] = extra[k];
    return f;
  }

  /* =====================================================================
     TEMPLATES
     ===================================================================== */
  var T = (SMIF.templates = []);

  /* ---------- 1. Event announcement ---------- */
  T.push({
    id: 'event', name: 'Event announcement', slug: 'event', blurb: 'Date, time, place and a photo.',
    fields: [
      F('kicker', 'Small label on top', 'text', 'Upcoming event', 30, 'Upcoming event'),
      F('title', 'Event title', 'textarea', 'Portfolio Pitch Night', 70, 'Portfolio Pitch Night'),
      F('date', 'Date', 'date', '2026-11-19', 10, ''),
      F('time', 'Time', 'text', '6:30 PM', 30, '6:30 PM'),
      F('place', 'Place', 'text', 'Business Building, Room 101', 60, 'Room or address'),
      F('details', 'Extra line (optional)', 'text', 'Pizza provided. Open to all majors.', 80, 'Optional')
    ],
    photoSlots: [{ id: 'photo', label: 'Photo (optional)', required: false }],
    draw: function (ctx, W, H, data, theme, assets) {
      var hasPhoto = !!(assets.photos.photo && assets.photos.photo.canvas);
      var c = D.ctx(ctx, W, H, data, theme, assets, { split: W / H > 0.9, splitRatio: 0.6 });
      D.bg(c);
      var ey = D.eyebrow(c, data.kicker || 'Upcoming event', { field: 'kicker' });
      var fb = D.footer(c);
      var u = c.u, gap = c.px(30);
      var tx = c.x0, tw = c.tw;
      var dt = D.date(data.date);
      var rows = [
        { label: 'Date', value: dt.long, field: 'date' },
        { label: 'Time', value: data.time, field: 'time' },
        { label: 'Place', value: data.place, field: 'place' }
      ];
      var y0 = ey + gap;
      if (c.split) {
        // text left, photo or date card right
        var mr = { x: c.mx0, y: c.top, w: c.x1 - c.mx0, h: fb + c.px(24) - c.top };
        if (c.k === 'wide') mr.h = c.bottom - c.top;
        if (hasPhoto) D.photo(c, 'photo', mr, { radius: c.px(8) }); else D.dateCard(c, mr, data.date);
        var infoSize = c.px(34);
        var rowsH = D.infoRows(c, rows, -9999, -9999, tw, { size: infoSize, labelW: c.px(150), pad: c.px(12) });
        var detailsH = String(data.details || '').trim() ? c.px(70) : 0;
        var titleH = fb - y0 - rowsH - detailsH - gap * 1.5;
        var tf = D.fit(c, data.title, { fam: 'display', weight: 800, maxSize: c.px(112), minSize: c.px(44), lh: 1.06, w: tw, h: Math.max(titleH, c.px(120)), field: 'title' });
        D.drawFit(c, tf, tx, y0, theme.text);
        var yy = y0 + tf.h + gap;
        yy += D.infoRows(c, rows, tx, yy, tw, { size: infoSize, labelW: c.px(150), pad: c.px(12) });
        if (detailsH) D.block(c, data.details, { fam: 'ui', weight: 500, maxSize: c.px(28), minSize: Math.max(18, c.px(22)), lh: 1.35, w: tw, h: c.px(70), field: 'details' }, tx, yy + c.px(18), theme.muted);
        return;
      }
      // stacked (portrait, tall)
      var infoSz = c.px(33);
      var rowsH2 = D.infoRows(c, rows, -9999, -9999, tw, { size: infoSz, labelW: c.px(170), pad: c.px(12) });
      var detH = String(data.details || '').trim() ? c.px(48) + c.px(24) : 0;
      var avail = fb - y0;
      var titleMax = avail * 0.22;
      var tf2 = D.fit(c, data.title, { fam: 'display', weight: 800, maxSize: c.px(118), minSize: c.px(52), lh: 1.05, w: tw, h: titleMax, field: 'title' });
      var mediaH = avail - tf2.h - rowsH2 - detH - gap * 3;
      mediaH = Math.max(c.px(220), Math.min(mediaH, avail * (c.k === 'tall' ? 0.6 : 0.56)));
      var y = y0;
      var mr2 = { x: tx, y: y, w: tw, h: mediaH };
      if (hasPhoto) D.photo(c, 'photo', mr2, { radius: c.px(8) }); else D.dateCard(c, mr2, data.date);
      y += mediaH + gap;
      D.drawFit(c, tf2, tx, y, theme.text);
      y += tf2.h + gap;
      y += D.infoRows(c, rows, tx, y, tw, { size: infoSz, labelW: c.px(170), pad: c.px(12) });
      if (detH) D.block(c, data.details, { fam: 'ui', weight: 500, maxSize: c.px(28), minSize: c.px(22), lh: 1.3, w: tw, h: c.px(48), maxLines: 1, field: 'details' }, tx, y + c.px(22), theme.muted);
    }
  });

  /* ---------- 2. Speaker spotlight ---------- */
  T.push({
    id: 'speaker', name: 'Speaker spotlight', slug: 'speaker', blurb: 'Photo, name, role and talk title.',
    fields: [
      F('name', 'Speaker name', 'text', 'Jordan Rivera', 36, 'Full name'),
      F('role', 'Role', 'text', 'Managing Director', 40, 'Role'),
      F('company', 'Company', 'text', 'Sample Capital', 40, 'Company'),
      F('talk', 'Talk title', 'textarea', 'Reading a balance sheet like an investor', 90, 'Talk title'),
      F('date', 'Date', 'date', '2026-11-19', 10, ''),
      F('time', 'Time and place (optional)', 'text', '6:30 PM, Business Building', 50, 'Optional')
    ],
    photoSlots: [{ id: 'photo', label: 'Speaker photo', required: true }],
    draw: function (ctx, W, H, data, theme, assets) {
      var c = D.ctx(ctx, W, H, data, theme, assets, { split: W / H > 0.9, splitRatio: 0.56 });
      D.bg(c);
      var fb = D.footer(c);
      var ey = c.top + c.px(30);
      var gap = c.px(26), y0 = ey + gap, tx = c.x0, tw = c.tw;
      var dt = D.date(data.date);
      var when = [dt.long, data.time].filter(function (s) { return String(s || '').trim(); }).join('  |  ');
      var roleLine = [data.role, data.company].filter(function (s) { return String(s || '').trim(); }).join('  |  ');
      var nameMax = c.px(104);
      function textStack(x, y, w, maxBottom) {
        var avail = maxBottom - y;
        var nf = D.fit(c, data.name, { fam: 'display', weight: 800, maxSize: nameMax, minSize: c.px(46), lh: 1.04, w: w, h: avail * 0.3, field: 'name' });
        D.drawFit(c, nf, x, y, theme.text);
        y += nf.h + c.px(14);
        if (roleLine) y += D.block(c, roleLine, { fam: 'ui', weight: 700, maxSize: c.px(27), minSize: Math.max(15, c.px(19)), lh: 1.3, w: w, h: c.px(27) * 1.3 * 2, upper: true, maxLines: 2, field: 'role' }, x, y, theme.accentText) + c.px(18);
        D.rule(c, x, x + Math.min(w, c.px(120)), y, { width: Math.max(3, 4 * c.u) });
        y += c.px(26);
        D.label(c, 'Talk', x, y, { size: c.px(20), color: theme.muted, weight: 600 });
        y += c.px(34);
        var tf = D.fit(c, data.talk, { fam: 'display', italic: true, weight: 600, maxSize: c.px(50), minSize: c.px(26), lh: 1.2, w: w, h: Math.max(c.px(80), maxBottom - y - c.px(70)), field: 'talk' });
        D.drawFit(c, tf, x, y, theme.text);
        y += tf.h + c.px(22);
        D.block(c, when, { fam: 'ui', weight: 600, maxSize: c.px(28), minSize: Math.max(15, c.px(20)), lh: 1.3, w: w, h: c.px(28) * 1.3 * 2, maxLines: 2, field: 'time' }, x, y, theme.accentText);
      }
      if (c.split) {
        var pr = { x: c.mx0, y: c.top, w: c.x1 - c.mx0, h: (c.k === 'wide' ? c.bottom : fb + c.px(24)) - c.top };
        D.photo(c, 'photo', pr, { radius: c.px(8) });
        D.eyebrow(c, 'Speaker spotlight');
        textStack(tx, y0, tw, fb);
        return;
      }
      // stacked: full-width photo at the top that fades into the background
      var pb = Math.round(c.H * (c.k === 'tall' ? 0.47 : 0.52));
      D.photo(c, 'photo', { x: 0, y: 0, w: c.W, h: pb }, {});
      var g = ctx.createLinearGradient(0, pb * 0.5, 0, pb);
      g.addColorStop(0, D.rgba(theme.bg, 0));
      g.addColorStop(1, theme.bg);
      ctx.fillStyle = g;
      ctx.fillRect(0, pb * 0.5, c.W, pb * 0.5 + 1);
      // darker band behind the label so it stays readable over any photo
      var sh = c.top + c.px(170);
      var g2 = ctx.createLinearGradient(0, 0, 0, sh);
      g2.addColorStop(0, D.rgba(theme.bg, 0.9));
      g2.addColorStop(Math.min(0.95, (c.top + c.px(40)) / sh), D.rgba(theme.bg, 0.75));
      g2.addColorStop(1, D.rgba(theme.bg, 0));
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, c.W, sh);
      D.eyebrow(c, 'Speaker spotlight');
      textStack(tx, pb - c.px(80), tw, fb);
    }
  });

  /* ---------- 3. This week at SMIF ---------- */
  var WEEK = [['Mon', 'General meeting, 6:30 PM'], ['Wed', 'Stock pitch workshop'], ['Thu', 'Speaker night with a guest from industry'], ['Fri', 'Social and portfolio review']];
  var weekFields = [
    F('title', 'Headline', 'textarea', 'This week at SMIF', 40, 'This week at SMIF'),
    F('range', 'Dates', 'text', 'Nov 16 to Nov 20', 30, 'Nov 16 to Nov 20')
  ];
  WEEK.forEach(function (r, i) {
    weekFields.push(F('d' + (i + 1), 'Day ' + (i + 1), 'text', r[0], 12, 'Mon'));
    weekFields.push(F('t' + (i + 1), 'What ' + (i + 1), 'text', r[1], 60, 'What is happening'));
  });
  T.push({
    id: 'week', name: 'This week at SMIF', slug: 'week', blurb: 'Up to 4 lines with day labels.',
    fields: weekFields, photoSlots: [],
    draw: function (ctx, W, H, data, theme, assets) {
      var wide = W / H > 1.2;
      var c = D.ctx(ctx, W, H, data, theme, assets, { split: wide, splitRatio: 0.36 });
      D.bg(c);
      var gap = c.px(28), tx = c.x0, tw = c.tw;
      var items = [];
      for (var i = 1; i <= 4; i++) if (String(data['t' + i] || '').trim() || String(data['d' + i] || '').trim()) items.push({ d: data['d' + i], t: data['t' + i], i: i });
      var ey = D.eyebrow(c, 'Weekly schedule');
      var fb = D.footer(c);
      var y0 = ey + gap;
      var rx = tx, rw = tw, ry0, ry1;
      if (wide) {
        var tf0 = D.fit(c, data.title, { fam: 'display', weight: 800, maxSize: c.px(120), minSize: c.px(50), lh: 1.05, w: tw, h: fb - y0 - c.px(80), field: 'title' });
        D.drawFit(c, tf0, tx, y0, theme.text);
        D.label(c, data.range, tx, y0 + tf0.h + c.px(18), { size: c.px(26), maxW: tw, field: 'range' });
        rx = c.mx0 - c.px(10); rw = c.x1 - rx; ry0 = c.top; ry1 = c.bottom;
      } else {
        var tf = D.fit(c, data.title, { fam: 'display', weight: 800, maxSize: c.px(124), minSize: c.px(52), lh: 1.04, w: tw, h: (fb - y0) * 0.22, field: 'title' });
        D.drawFit(c, tf, tx, y0, theme.text);
        var yy = y0 + tf.h + c.px(14);
        D.label(c, data.range, tx, yy, { size: c.px(27), maxW: tw, field: 'range' });
        ry0 = yy + c.px(27) * 1.3 + gap; ry1 = fb;
      }
      if (!items.length) return;
      var rowH = (ry1 - ry0) / items.length;
      rowH = Math.min(rowH, c.px(170));
      var totalH = rowH * items.length;
      var start = ry0 + (wide ? ((ry1 - ry0) - totalH) / 2 : 0);
      var dayW = Math.round(rw * (wide ? 0.2 : 0.2));
      for (var j = 0; j < items.length; j++) {
        var ry = start + j * rowH;
        D.rule(c, rx, rx + rw, ry, { alpha: j === 0 ? 0.9 : 0.4, width: Math.max(1.5, (j === 0 ? 2.5 : 1.5) * c.u) });
        D.label(c, items[j].d, rx, ry + rowH / 2 - c.px(14), { size: c.px(27), weight: 700, maxW: dayW - c.px(14), field: 'd' + items[j].i });
        var f = D.fit(c, items[j].t, { fam: 'display', weight: 600, maxSize: c.px(52), minSize: Math.max(18, c.px(28)), lh: 1.15, w: rw - dayW, h: rowH - c.px(24), maxLines: 2, field: 't' + items[j].i });
        D.drawFit(c, f, rx + dayW, ry + (rowH - f.h) / 2, theme.text);
      }
      D.rule(c, rx, rx + rw, start + totalH, { alpha: 0.4, width: Math.max(1.5, 1.5 * c.u) });
    }
  });

  /* ---------- 4. Division post ---------- */
  T.push({
    id: 'division', name: 'Division post', slug: 'division', blurb: 'Pick a division, add a headline.',
    fields: [
      F('division', 'Division', 'select', 'equities', 20, '', { options: B.divisions.map(function (d) { return { value: d.id, label: d.name }; }) }),
      F('headline', 'Headline', 'textarea', 'How we found our next stock pitch', 90, 'Headline'),
      F('body', 'Body text', 'textarea', 'Our analysts screened 40 names, narrowed the list to five and presented the final pitch to the full club. Join us to see how the process works.', 260, 'A few sentences')
    ],
    photoSlots: [],
    draw: function (ctx, W, H, data, theme, assets) {
      var c = D.ctx(ctx, W, H, data, theme, assets, {});
      var div = B.divisions.filter(function (d) { return d.id === data.division; })[0] || B.divisions[0];
      D.bg(c, { deco: false });
      // oversized soft ring in the division color
      ctx.save();
      ctx.strokeStyle = D.rgba(div.color, 0.5);
      ctx.lineWidth = c.px(26);
      ctx.beginPath();
      ctx.arc(c.W * (c.k === 'wide' ? 0.92 : 1.0), c.H * (c.k === 'wide' ? 0.12 : 0.2), Math.min(c.W, c.H) * (c.k === 'wide' ? 0.36 : 0.38), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // top accent band
      ctx.fillStyle = div.color;
      ctx.fillRect(0, 0, c.W, c.px(18));
      var fb = D.footer(c);
      var gap = c.px(30), y = c.top + c.px(10);
      // tag
      var ts = c.px(25);
      ctx.font = '700 ' + ts + 'px ' + UI;
      var lw = D.label(c, div.name + ' division', -9999, -9999, { size: ts });
      var padX = c.px(26), padY = c.px(15);
      ctx.save();
      ctx.fillStyle = div.color;
      D.roundRectPath(ctx, c.x0, y, lw + padX * 2, ts + padY * 2, c.px(6));
      ctx.fill();
      ctx.restore();
      D.label(c, div.name + ' division', c.x0 + padX, y + padY, { size: ts, color: '#F4EFE6', weight: 700 });
      y += ts + padY * 2 + gap * 1.2;
      var minY = y;
      var hasBody = String(data.body || '').trim();
      var wide = c.k === 'wide';
      var bf = hasBody ? D.fit(c, data.body, { fam: 'ui', weight: 500, maxSize: c.px(38), minSize: Math.max(18, c.px(28)), lh: 1.42, w: c.tw * (wide ? 0.82 : 0.94), h: (fb - minY) * 0.36, field: 'body' }) : null;
      var below = bf ? gap * 2 + bf.h : 0;
      var hf = D.fit(c, data.headline, { fam: 'display', weight: 800, maxSize: c.px(118), minSize: c.px(46), lh: 1.05, w: c.tw * (wide ? 0.8 : 1), h: fb - minY - below, field: 'headline' });
      var start = Math.max(minY, fb - hf.h - below);
      D.drawFit(c, hf, c.x0, start, theme.text);
      if (bf) {
        var ry = start + hf.h + gap;
        D.rule(c, c.x0, c.x0 + c.px(120), ry, { width: Math.max(3, 4 * c.u) });
        D.drawFit(c, bf, c.x0, ry + gap, theme.muted);
      }
    }
  });

  /* ---------- 5. Member win ---------- */
  T.push({
    id: 'win', name: 'Member win', slug: 'member-win', blurb: 'Celebrate an offer or a promotion.',
    fields: [
      F('congrats', 'Greeting', 'text', 'Congratulations', 24, 'Congratulations'),
      F('name', 'Name', 'text', 'Jordan Rivera', 36, 'Full name'),
      F('role', 'New role', 'text', 'Incoming Analyst', 40, 'Incoming Analyst'),
      F('company', 'Company', 'text', 'Sample Capital', 40, 'Company'),
      F('note', 'Short note (optional)', 'textarea', 'SMIF member since 2025. Proud of you!', 100, 'Optional')
    ],
    photoSlots: [{ id: 'photo', label: 'Member photo', required: true }],
    draw: function (ctx, W, H, data, theme, assets) {
      var c = D.ctx(ctx, W, H, data, theme, assets, { split: W / H > 0.9, splitRatio: 0.56 });
      D.bg(c);
      var ey = D.eyebrow(c, 'Member win');
      var fb = D.footer(c);
      var gap = c.px(26), y0 = ey + gap;
      var roleLine = [data.role, data.company].filter(function (s) { return String(s || '').trim(); }).join(' at ');
      if (c.split) {
        var colW = c.x1 - c.mx0;
        var d = Math.min(colW, (c.k === 'wide' ? c.bottom - c.top : fb - c.top) - c.px(40));
        var r = { x: c.mx0 + (colW - d) / 2, y: c.top + ((c.k === 'wide' ? c.bottom - c.top : fb - c.top) - d) / 2, w: d, h: d };
        D.photo(c, 'photo', r, { circle: true });
        D.frameOutline(c, r, { circle: true });
        var y = y0 + gap;
        y += D.block(c, data.congrats, { fam: 'display', italic: true, weight: 600, maxSize: c.px(58), minSize: c.px(30), lh: 1.15, w: c.tw, h: c.px(80), field: 'congrats' }, c.x0, y, theme.accentText) + c.px(10);
        var nf = D.fit(c, data.name, { fam: 'display', weight: 800, maxSize: c.px(108), minSize: c.px(46), lh: 1.04, w: c.tw, h: (fb - y) * 0.4, field: 'name' });
        D.drawFit(c, nf, c.x0, y, theme.text);
        y += nf.h + c.px(20);
        D.rule(c, c.x0, c.x0 + c.px(110), y, { width: Math.max(3, 4 * c.u) });
        y += c.px(24);
        y += D.block(c, roleLine, { fam: 'ui', weight: 700, maxSize: c.px(30), minSize: Math.max(15, c.px(20)), lh: 1.3, w: c.tw, h: c.px(100), upper: true, field: 'role' }, c.x0, y, theme.text) + c.px(18);
        D.block(c, data.note, { fam: 'ui', weight: 500, maxSize: c.px(28), minSize: Math.max(16, c.px(22)), lh: 1.4, w: c.tw, h: Math.max(0, fb - y), field: 'note' }, c.x0, y, theme.muted);
        return;
      }
      // stacked, centered
      var cx = c.W / 2;
      var avail = fb - y0;
      var d2 = Math.min(c.tw * 0.62, avail * 0.5);
      var r2 = { x: cx - d2 / 2, y: y0 + c.px(20), w: d2, h: d2 };
      D.photo(c, 'photo', r2, { circle: true });
      D.frameOutline(c, r2, { circle: true });
      var yy = r2.y + d2 + c.px(48);
      yy += D.block(c, data.congrats, { fam: 'display', italic: true, weight: 600, maxSize: c.px(64), minSize: c.px(32), lh: 1.15, w: c.tw, h: c.px(80), field: 'congrats' }, cx, yy, theme.accentText, 'center') + c.px(6);
      var nf2 = D.fit(c, data.name, { fam: 'display', weight: 800, maxSize: c.px(112), minSize: c.px(48), lh: 1.04, w: c.tw, h: c.px(240), field: 'name' });
      D.drawFit(c, nf2, cx, yy, theme.text, 'center');
      yy += nf2.h + c.px(22);
      D.rule(c, cx - c.px(60), cx + c.px(60), yy, { width: Math.max(3, 4 * c.u) });
      yy += c.px(26);
      yy += D.block(c, roleLine, { fam: 'ui', weight: 700, maxSize: c.px(32), minSize: Math.max(16, c.px(22)), lh: 1.3, w: c.tw, h: c.px(100), upper: true, field: 'role' }, cx, yy, theme.text, 'center') + c.px(18);
      D.block(c, data.note, { fam: 'ui', weight: 500, maxSize: c.px(30), minSize: c.px(22), lh: 1.4, w: c.tw * 0.9, h: Math.max(0, fb - yy), field: 'note' }, cx, yy, theme.muted, 'center');
    }
  });

  /* ---------- 6. Join SMIF ---------- */
  T.push({
    id: 'join', name: 'Join SMIF', slug: 'join', blurb: 'Recruiting post with a QR code.',
    fields: [
      F('headline', 'Headline', 'textarea', 'Join SMIF', 40, 'Join SMIF'),
      F('sub', 'Sub line', 'text', 'Applications are open', 60, 'Applications are open'),
      F('b1', 'Point 1', 'text', 'Manage a real student portfolio', 60, ''),
      F('b2', 'Point 2', 'text', 'Learn valuation from analysts and alumni', 60, ''),
      F('b3', 'Point 3', 'text', 'Open to every major and class year', 60, ''),
      F('cta', 'Call to action', 'text', 'Scan to apply', 36, 'Scan to apply')
    ],
    photoSlots: [{ id: 'qr', label: 'QR code image (optional)', required: false, kind: 'qr' }],
    draw: function (ctx, W, H, data, theme, assets) {
      var c = D.ctx(ctx, W, H, data, theme, assets, { split: W / H > 0.9, splitRatio: W / H > 1.2 ? 0.6 : 0.54 });
      D.bg(c);
      var ey = D.eyebrow(c, 'Recruiting');
      var fb = D.footer(c);
      var gap = c.px(26), y0 = ey + gap, tx = c.x0, tw = c.tw;
      var bullets = [data.b1, data.b2, data.b3].filter(function (s) { return String(s || '').trim(); });
      var hasQR = !!(assets.photos.qr && assets.photos.qr.canvas);
      var tile = c.k === 'wide' ? 340 : c.k === 'square' ? 350 : 360;
      tile = Math.max(tile, 348);
      function bulletList(x, y, w, h) {
        var n = bullets.length; if (!n) return;
        var rowH = Math.min(h / n, c.px(170));
        var numW = c.px(84);
        for (var i = 0; i < n; i++) {
          var ry = y + i * rowH;
          D.rule(c, x, x + w, ry, { alpha: 0.4, width: Math.max(1.5, 1.5 * c.u) });
          ctx.save();
          ctx.fillStyle = theme.accentText;
          ctx.font = '700 ' + c.px(40) + 'px ' + DISPLAY;
          ctx.textBaseline = 'top';
          ctx.fillText('0' + (i + 1), x, ry + rowH / 2 - c.px(22));
          ctx.restore();
          var f = D.fit(c, bullets[i], { fam: 'ui', weight: 600, maxSize: c.px(38), minSize: Math.max(18, c.px(24)), lh: 1.25, w: w - numW, h: rowH - c.px(16), maxLines: 2, field: 'b' + (i + 1) });
          D.drawFit(c, f, x + numW, ry + (rowH - f.h) / 2, theme.text);
        }
      }
      function ctaBlock(x, y, w, align) {
        var f = D.fit(c, data.cta, { fam: 'display', italic: true, weight: 600, maxSize: c.px(54), minSize: c.px(28), lh: 1.15, w: w, h: c.px(130), field: 'cta' });
        D.drawFit(c, f, x, y, theme.accentText, align);
        return f.h;
      }
      if (c.split) {
        var colX = c.mx0, colW = c.x1 - c.mx0;
        // text column
        var hf = D.fit(c, data.headline, { fam: 'display', weight: 800, maxSize: c.px(124), minSize: c.px(50), lh: 1.04, w: tw, h: (fb - y0) * 0.3, field: 'headline' });
        D.drawFit(c, hf, tx, y0, theme.text);
        var y = y0 + hf.h + c.px(14);
        y += D.block(c, data.sub, { fam: 'ui', weight: 500, maxSize: c.px(30), minSize: Math.max(16, c.px(22)), lh: 1.3, w: tw, h: c.px(60), maxLines: 1, field: 'sub' }, tx, y, theme.muted) + gap;
        bulletList(tx, y, tw, fb - y);
        // media column: QR tile or call to action card
        var tileS = Math.min(tile, colW);
        tileS = Math.min(tileS, 348);
        var ty = c.top + Math.max(0, ((c.bottom - c.top) - (tileS + c.px(90))) / 2);
        if (hasQR) {
          var tr = D.qrTile(c, 'qr', colX + (colW - tileS) / 2, ty, tileS);
          ctaBlock(colX + colW / 2, ty + tileS + c.px(24), colW, 'center');
        } else {
          D.qrTile(c, 'qr', colX + (colW - tileS) / 2, ty, tileS);
          ctaBlock(colX + colW / 2, ty + tileS + c.px(24), colW, 'center');
        }
        return;
      }
      // stacked
      var bottomRowH = tile;
      var hf2 = D.fit(c, data.headline, { fam: 'display', weight: 800, maxSize: c.px(140), minSize: c.px(56), lh: 1.04, w: tw, h: (fb - y0) * 0.2, field: 'headline' });
      D.drawFit(c, hf2, tx, y0, theme.text);
      var yy = y0 + hf2.h + c.px(14);
      yy += D.block(c, data.sub, { fam: 'ui', weight: 500, maxSize: c.px(34), minSize: c.px(24), lh: 1.3, w: tw, h: c.px(60), maxLines: 1, field: 'sub' }, tx, yy, theme.muted) + gap;
      var bulletsBottom = fb - bottomRowH - gap;
      bulletList(tx, yy, tw, bulletsBottom - yy);
      var by = fb - bottomRowH;
      var qx = c.x1 - tile;
      D.qrTile(c, 'qr', qx, by, tile);
      var ch = D.fit(c, data.cta, { fam: 'display', italic: true, weight: 600, maxSize: c.px(62), minSize: c.px(30), lh: 1.15, w: qx - tx - gap, h: c.px(200), field: 'cta' });
      D.drawFit(c, ch, tx, by + (tile - ch.h) / 2, theme.accentText);
    }
  });

  /* ---------- 7. Quote card ---------- */
  T.push({
    id: 'quote', name: 'Quote card', slug: 'quote', blurb: 'A quote and who said it.',
    fields: [
      F('quote', 'Quote', 'textarea', 'Risk comes from not knowing what you are doing.', 220, 'The quote'),
      F('who', 'Who said it', 'text', 'Warren Buffett', 40, 'Name'),
      F('role', 'Source (optional)', 'text', 'Chairman, Berkshire Hathaway', 50, 'Optional')
    ],
    photoSlots: [],
    draw: function (ctx, W, H, data, theme, assets) {
      var c = D.ctx(ctx, W, H, data, theme, assets, {});
      D.bg(c);
      var ey = D.eyebrow(c, 'Words to invest by');
      var fb = D.footer(c);
      var gap = c.px(30), y0 = ey + gap;
      var wide = c.k === 'wide';
      var attrH = c.px(wide ? 120 : 150);
      var glyph = c.px(wide ? 230 : 330);
      var glyphH = glyph * (wide ? 0.38 : 0.42);
      var avail = fb - y0;
      var qf = D.fit(c, data.quote, { fam: 'display', italic: true, weight: 600, maxSize: c.px(wide ? 78 : 104), minSize: Math.max(24, c.px(36)), lh: 1.18, w: c.tw * (wide ? 0.92 : 0.96), h: Math.max(avail - glyphH - attrH - gap * 2, c.px(120)), field: 'quote' });
      var blockH = glyphH + qf.h + gap + attrH;
      var startY = y0 + Math.max(0, (avail - blockH) / 2);
      ctx.save();
      ctx.fillStyle = D.rgba(theme.accent, 0.9);
      ctx.font = '800 ' + glyph + 'px ' + DISPLAY;
      ctx.textBaseline = 'top';
      ctx.fillText('“', c.x0 - c.px(8), startY - glyph * (wide ? 0.2 : 0.22));
      ctx.restore();
      var qy = startY + glyphH;
      D.drawFit(c, qf, c.x0, qy, theme.text);
      var y = qy + qf.h + gap;
      D.rule(c, c.x0, c.x0 + c.px(110), y, { width: Math.max(3, 4 * c.u) });
      y += c.px(26);
      D.label(c, data.who, c.x0, y, { size: c.px(30), color: theme.text, weight: 700, maxW: c.tw, spacing: 0.16, field: 'who' });
      if (String(data.role || '').trim()) {
        D.block(c, data.role, { fam: 'ui', weight: 500, maxSize: c.px(26), minSize: Math.max(15, c.px(20)), lh: 1.3, w: c.tw, h: c.px(40), maxLines: 1, field: 'role' }, c.x0, y + c.px(50), theme.muted);
      }
    }
  });

  /* ---------- 8. Number of the week ---------- */
  T.push({
    id: 'number', name: 'Number of the week', slug: 'number', blurb: 'One big number and what it means.',
    fields: [
      F('kicker', 'Small label on top', 'text', 'Number of the week', 30, 'Number of the week'),
      F('number', 'Big number', 'text', '4.2%', 10, '4.2%'),
      F('caption', 'What it means', 'textarea', 'Sample figure for the quarterly student portfolio return, shown here as an example only.', 160, 'Short explanation'),
      F('source', 'Source line', 'text', 'Source: sample data for illustration', 70, 'Source: ...')
    ],
    photoSlots: [],
    draw: function (ctx, W, H, data, theme, assets) {
      var c = D.ctx(ctx, W, H, data, theme, assets, {});
      D.bg(c);
      var ey = D.eyebrow(c, data.kicker || 'Number of the week', { field: 'kicker' });
      var fb = D.footer(c);
      var gap = c.px(30), y0 = ey + gap;
      var wide = c.k === 'wide';
      var srcH = String(data.source || '').trim() ? c.px(40) : 0;
      var avail = fb - y0 - srcH - gap;
      var nf = D.fit(c, data.number, { fam: 'display', weight: 800, maxSize: wide ? c.px(520) : c.px(430), minSize: c.px(100), lh: 1.0, w: c.tw, h: avail * (wide ? 0.62 : 0.5), maxLines: 1, field: 'number' });
      var cf = D.fit(c, data.caption, { fam: 'ui', weight: 500, maxSize: c.px(42), minSize: Math.max(18, c.px(28)), lh: 1.4, w: c.tw * (wide ? 0.8 : 0.92), h: Math.max(c.px(100), avail - nf.h - c.px(80)), field: 'caption' });
      var total = nf.h + c.px(50) + cf.h;
      var y = y0 + Math.max(0, (avail - total) / 2);
      D.drawFit(c, nf, c.x0 - c.px(4), y, theme.text);
      y += nf.h + c.px(14);
      D.rule(c, c.x0, c.x0 + c.px(150), y, { width: Math.max(4, 7 * c.u) });
      y += c.px(36);
      D.drawFit(c, cf, c.x0, y, theme.muted);
      if (srcH) D.block(c, data.source, { fam: 'ui', weight: 500, maxSize: c.px(24), minSize: Math.max(14, c.px(18)), lh: 1.3, w: c.tw, h: c.px(34), maxLines: 1, field: 'source' }, c.x0, fb - srcH, theme.accentText);
    }
  });
})();
