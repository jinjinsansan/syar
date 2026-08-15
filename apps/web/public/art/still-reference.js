/**
 * ★STAR 静止画レンダラ（ハンドオフ用の参照実装）
 *
 * この 1 ファイルが handoff/mockup/final.png と確認ページの両方を描きます。
 * ★16進をここに書きません。すべて palette.json から役割名で引きます。
 * ★層の y・高さ・速度比・タイル幅はすべて layers.json から読みます。
 *
 * 使い方:
 *   const atlas = await STARStill.buildAtlas(sheetImg, palette, layers);
 *   STARStill.drawStill(ctx, { palette, layers, atlas, parts, scene, scroll });
 */
(function (g) {
  'use strict';

  var SPRITE_W = 220, SPRITE_H = 140;
  /** ★接地線（コマ内 y）。6コマの最下端は 121〜139、胴体基準で揃えた上での平均接地は 136 */
  var GROUND_LINE = 136;
  /**
   * ★**上下動の増幅**（躍動感）。
   *
   * 【なぜ要るか】
   *   元の素材は**絵は良いが、駆歩の伸縮が浅い**（体長の変化 5.5%。必要 6%以上）。
   *   ⚠️ 絵を作り直すと**筋肉の陰影と手綱を失います**（一度やって戻しました）。
   *   ★**絵はそのままに、上下動だけを増幅**します。
   *
   * 【★数字の根拠】コマごとの実測の浮き（地面線 139 から）:
   *     0:19px  1:6px  2:1px  3:0px  4:7px  5:4px
   *   これが駆歩の周期そのものなので、**その形のまま持ち上げます**。
   *   ⚠️ 接地しているコマ（3）は**動かしません**。動かすと地面から浮きます。
   */
  /**
   * ★**上下動の増幅はやめました。**
   *   ⚠️ 持ち上げただけでは「**ぴょこぴょこ跳ねている**」ように見えます（オーナー判定）。
   *   ★駆歩の躍動感は**四肢の伸展と収縮**から来るもので、**上下動は結果でしかありません**。
   *     原因（絵の伸縮が浅い）を、結果（上下動）で埋めることはできませんでした。
   */
  var BOB = [0, 0, 0, 0, 0, 0];
  /** ★ゼッケンの当て布を描く位置（コマ内・1×）。番号は必ずここに描く＝2桁が欠けない */
  /**
   * ★ゼッケンの位置と大きさ（コマ内・1×）。
   * ⚠️ 30×20 は馬体（220px）の 14% で、**実際のゼッケンより小さく読めません**。
   *    実物は馬体の 1/4 ほどあります。→ **48×32**（22%）に広げました。
   */
  var CLOTH = { x: 92, y: 58, w: 48, h: 32 };

  // ── 5×7 のドット数字（tools/lib/pixel-font.mjs と同じ字形） ──
  var GLYPHS = {
    '0': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100']
  };
  var GW = 5, GH = 7, TRACK = 1;
  function textWidth(t, s) { return (String(t).length * (GW + TRACK) - TRACK) * s; }
  function drawDigits(ctx, t, x, y, s, fg, ol) {
    var str = String(t), on = {};
    var ox = 0, i, gx, gy, ch, glyph;
    for (i = 0; i < str.length; i++) {
      glyph = GLYPHS[str[i]];
      if (!glyph) continue;
      for (gy = 0; gy < GH; gy++) for (gx = 0; gx < GW; gx++) {
        if (glyph[gy][gx] === '1') on[(ox + gx) + ',' + gy] = 1;
      }
      ox += GW + TRACK;
    }
    if (ol) {
      ctx.fillStyle = ol;
      var edge = {};
      for (var k in on) {
        var p = k.split(',').map(Number);
        var nb = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
        for (var n = 0; n < nb.length; n++) {
          var kk = (p[0] + nb[n][0]) + ',' + (p[1] + nb[n][1]);
          if (!on[kk]) edge[kk] = 1;
        }
      }
      for (var e in edge) { var q = e.split(',').map(Number); ctx.fillRect(x + q[0] * s, y + q[1] * s, s, s); }
    }
    ctx.fillStyle = fg;
    for (var m in on) { var r = m.split(',').map(Number); ctx.fillRect(x + r[0] * s, y + r[1] * s, s, s); }
  }

  // ── 色ユーティリティ ──
  function hex2rgb(h) { var v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function rgba(h, a) { var c = hex2rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function hueOf(r, gg, b) {
    var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), d = mx - mn;
    if (d === 0) return -1;
    var h;
    if (mx === r) h = ((gg - b) / d) % 6; else if (mx === gg) h = (b - r) / d + 2; else h = (r - gg) / d + 4;
    h *= 60; if (h < 0) h += 360; return h;
  }
  var COATS = ['kage', 'kurokage', 'kuri', 'ashi', 'ao'];
  function coatOf(gate) { return COATS[gate % COATS.length]; }

  /**
   * ★1頭ぶんの帯（1320×140）を作る。
   *   ① 勝負服の青（hue 200〜260・彩度 0.35 以上）→ 枠順色
   *   ② 馬体の茶（hue 10〜45）→ 毛色の4階調
   *   ③ 逆光で全体を落とす（bodyMul）
   */
  /**
   * ★**毛色と逆光は、切れるようにします。**
   *   ⚠️ どちらも元の絵の階調を殺します。オーナー判定は
   *      「元の素材の馬と騎手のクオリティにしてほしい」でした。
   *   → **既定は「切」**。背景と UI はハンドオフのまま、馬は元の絵のままにできます。
   */
  var OPT = { coat: false, backlight: false };
  function setOptions(o) { OPT = { coat: !!o.coat, backlight: !!o.backlight }; }

  function bakeStrip(sheet, pal, gate, tier) {
    var c = document.createElement('canvas');
    c.width = SPRITE_W * 6; c.height = SPRITE_H;
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(sheet, 0, 0);
    var im = x.getImageData(0, 0, c.width, c.height), d = im.data;
    var silk = hex2rgb(pal['silk-' + gate] || pal['silk-1']);
    var coat = coatOf(gate);
    var ramp = [pal['coat-' + coat + '-0'], pal['coat-' + coat + '-1'], pal['coat-' + coat + '-2'], pal['coat-' + coat + '-3']].map(hex2rgb);
    var mul = OPT.backlight ? (tier === 'front' ? pal.$backlight.bodyMulNear : pal.$backlight.bodyMul) : 1;
    for (var i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) { d[i + 3] = 0; continue; }
      var r = d[i], gg = d[i + 1], b = d[i + 2];
      var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      var s = mx === 0 ? 0 : (mx - mn) / mx, h = hueOf(r, gg, b), v = mx / 255;
      if (s >= 0.35 && h >= 200 && h <= 260) {
        d[i] = silk[0] * v; d[i + 1] = silk[1] * v; d[i + 2] = silk[2] * v;
      } else if (OPT.coat && s >= 0.18 && h >= 8 && h <= 48) {
        /**
         * ★**4階調への量子化をやめ、連続に補間します。**
         *
         * ⚠️ 4段だと**筋肉の陰影が4色に潰れ**、馬が平板になります
         *    （オーナー判定「劣化している」の原因）。
         *    元の素材は約 7,000 色あり、その明暗が馬体の立体を作っています。
         * ★毛色の意図（4色の階調）はそのままに、**その間を明るさで補間**します。
         */
        var tt = (0.72 - Math.min(0.72, Math.max(0.16, v))) / (0.72 - 0.16) * 3;
        var i0 = Math.min(2, Math.floor(tt)), f0 = tt - i0;
        var a0 = ramp[i0], b0 = ramp[i0 + 1];
        d[i] = a0[0] + (b0[0] - a0[0]) * f0;
        d[i + 1] = a0[1] + (b0[1] - a0[1]) * f0;
        d[i + 2] = a0[2] + (b0[2] - a0[2]) * f0;
      }
      d[i] *= mul; d[i + 1] *= mul; d[i + 2] *= mul;
    }
    x.putImageData(im, 0, 0);
    return c;
  }

  /** ★逆光の縁取り用シルエット（不透明画素をすべて縁の色で塗った帯） */
  function bakeRim(strip, pal) {
    var c = document.createElement('canvas');
    c.width = strip.width; c.height = strip.height;
    var x = c.getContext('2d');
    x.drawImage(strip, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = pal.$backlight.rim;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function buildAtlas(sheet, pal, layers) {
    var out = {};
    layers.horsePlan.rows.forEach(function (row) {
      row.gates.forEach(function (gate) {
        var strip = bakeStrip(sheet, pal, gate, row.id);
        out[gate] = { strip: strip, rim: bakeRim(strip, pal), coat: coatOf(gate) };
      });
    });
    return out;
  }

  // ── 層の模様 ──
  function bandNoise(ctx, x0, y0, w, h, cA, cB, stepX, stepY, sw, sh, seedA, seedB) {
    for (var y = y0; y < y0 + h; y += stepY) {
      for (var x = x0; x < x0 + w; x += stepX) {
        ctx.fillStyle = (((x * seedA + y * seedB) % 11) < 5) ? cA : cB;
        ctx.fillRect(x, y, sw, sh);
      }
    }
  }

  function drawLayer(ctx, L, pal, scroll, V) {
    var off = L.tileWidth > 0 ? Math.floor(scroll * L.speedRatio) % L.tileWidth : 0;
    var y = L.y, h = L.height, W = V.width;
    if (L.id === 'sky') {
      // ★水平の帯だけで空を作る（斜め・縦・格子を入れない）。上が暗く、地平線に向かって抜ける
      var ramp = ['sky-0', 'sky-1', 'sky-2', 'sky-3'];
      for (var yy = 0; yy < h; yy++) {
        var t = yy / (h - 1);
        var seg = Math.min(ramp.length - 2, Math.floor(t * (ramp.length - 1)));
        var local = t * (ramp.length - 1) - seg;
        ctx.fillStyle = pal[ramp[seg]];
        ctx.fillRect(0, y + yy, W, 1);
        ctx.fillStyle = rgba(pal[ramp[seg + 1]], local);
        ctx.fillRect(0, y + yy, W, 1);
      }
      // ★逆光のグレア（地平線直上・44px）
      for (var k = 0; k < 44; k++) {
        ctx.fillStyle = rgba(pal['sky-5'], 0.04 + 0.62 * Math.pow(k / 43, 1.7));
        ctx.fillRect(0, y + h - 44 + k, W, 1);
      }
      // 横に流れる薄い雲
      [[0.26, 4], [0.34, 2], [0.46, 3], [0.56, 2]].forEach(function (b) {
        ctx.fillStyle = rgba(pal['sky-4'], 0.20);
        ctx.fillRect(0, y + Math.round(h * b[0]), W, b[1]);
      });
    } else if (L.id === 'stand') {
      // ★屋根（逆光でほぼ黒くなる）。下端だけ光の縁が出る
      ctx.fillStyle = pal['stand-0']; ctx.fillRect(0, y, W, 14);
      ctx.fillStyle = rgba(pal['sky-5'], 0.6); ctx.fillRect(0, y + 14, W, 2);
      // ★庇の下の深い陰（ここが暗いから座席が明るく見える）
      ctx.fillStyle = rgba(pal['ink-0'], 0.55); ctx.fillRect(0, y + 16, W, 6);
      // ★上段の座席（明るい）
      ctx.fillStyle = pal['stand-3']; ctx.fillRect(0, y + 22, W, 34);
      bandNoise(ctx, -off, y + 24, W + L.tileWidth, 30, rgba(pal['stand-5'], 0.85), rgba(pal['stand-0'], 0.6), 5, 4, 2, 2, 3, 7);
      // ★下段の座席（一段暗い＝段差が読める）
      ctx.fillStyle = pal['stand-2']; ctx.fillRect(0, y + 56, W, 14);
      bandNoise(ctx, -off + 2, y + 58, W + L.tileWidth, 10, rgba(pal['stand-4'], 0.7), rgba(pal['ink-0'], 0.45), 6, 4, 2, 2, 5, 11);
      // ★腰壁（コンクリ）。ここで「建物」になる
      ctx.fillStyle = pal['fence-1']; ctx.fillRect(0, y + 70, W, 10);
      ctx.fillStyle = rgba(pal['ink-0'], 0.30); ctx.fillRect(0, y + 70, W, 2);
      ctx.fillStyle = rgba(pal['ink-0'], 0.5); ctx.fillRect(0, y + h - 4, W, 4);
      // ★階段の刻み（縦の要素はここだけ・タイル幅で反復）
      ctx.fillStyle = rgba(pal['ink-0'], 0.42);
      for (var stx = -off; stx < W + L.tileWidth; stx += L.tileWidth) ctx.fillRect(stx, y + 22, 4, 48);
    } else if (L.id === 'hedge') {
      ctx.fillStyle = pal['hedge-1']; ctx.fillRect(0, y, W, 22);
      ctx.fillStyle = pal['hedge-0']; ctx.fillRect(0, y, W, 4);
      ctx.fillStyle = pal['hedge-2']; ctx.fillRect(0, y + 22, W, h - 22);
      ctx.fillStyle = rgba(pal['hedge-0'], 0.55); ctx.fillRect(0, y + 22, W, 2);
      ctx.fillStyle = pal['hedge-4']; ctx.fillRect(0, y + h - 5, W, 5);
      bandNoise(ctx, -off, y + 5, W + L.tileWidth, 16, rgba(pal['hedge-0'], 0.5), rgba(pal['hedge-4'], 0.55), 4, 3, 3, 2, 5, 3);
      bandNoise(ctx, -off + 3, y + 25, W + L.tileWidth, h - 32, rgba(pal['hedge-1'], 0.55), rgba(pal['hedge-4'], 0.6), 5, 3, 3, 2, 7, 5);
    } else if (L.id === 'fenceFar') {
      ctx.fillStyle = pal['fence-2'];
      for (var fx = -off; fx < W + L.tileWidth; fx += L.tileWidth) ctx.fillRect(fx, y, 2, h);
      ctx.fillStyle = pal['fence-0']; ctx.fillRect(0, y + 1, W, 4);
      ctx.fillStyle = rgba(pal['fence-3'], 0.5); ctx.fillRect(0, y + 5, W, 2);
      ctx.fillStyle = pal['fence-1']; ctx.fillRect(0, y + 9, W, 3);
      ctx.fillStyle = rgba(pal['fence-3'], 0.7); ctx.fillRect(0, y + h - 3, W, 3);
    } else if (L.id === 'turfFar') {
      var band = 8, dark = false, ty = y;
      while (ty < y + h) {
        ctx.fillStyle = dark ? pal['turf-1'] : pal['turf-0'];
        ctx.fillRect(0, ty, W, band); ty += band; dark = !dark;
      }
    } else if (L.id === 'turfMain') {
      // ★下地：奥から手前へなめらかに暗くなる（段差を作らない＝刈り目だけが読める）
      var steps = ['turf-2', 'turf-3', 'turf-4', 'turf-5'];
      for (var sy = 0; sy < h; sy++) {
        var tt = (sy / (h - 1)) * (steps.length - 1);
        var si = Math.min(steps.length - 2, Math.floor(tt));
        ctx.fillStyle = pal[steps[si]];
        ctx.fillRect(0, y + sy, W, 1);
        ctx.fillStyle = rgba(pal[steps[si + 1]], tt - si);
        ctx.fillRect(0, y + sy, W, 1);
      }
      // ★刈り目。手前ほど帯が広い＝奥行きの主たる手掛かり
      var b2 = 11, y2 = y, n = 0;
      while (y2 < y + h) {
        var bh2 = Math.min(b2, y + h - y2);
        ctx.fillStyle = (n % 2 === 0) ? rgba(pal['sky-5'], 0.115) : rgba(pal['turf-7'], 0.22);
        ctx.fillRect(0, y2, W, bh2);
        y2 += b2; b2 = Math.round(b2 * 1.21); n++;
      }
      // ★奥の柵の足元の落ち込み
      for (var g2 = 0; g2 < 14; g2++) {
        ctx.fillStyle = rgba(pal['turf-7'], 0.20 * (1 - g2 / 14));
        ctx.fillRect(0, y + g2, W, 1);
      }
    } else if (L.id === 'railFront') {
      for (var px = -off; px < W + L.tileWidth; px += L.tileWidth) {
        ctx.fillStyle = pal['rail-2']; ctx.fillRect(px, y, 6, h);
        ctx.fillStyle = pal['rail-3']; ctx.fillRect(px + 4, y, 2, h);
      }
      // ★上の横棒（主役）。逆光の光は上辺の 3px だけ
      ctx.fillStyle = pal['rail-1']; ctx.fillRect(0, y, W, 9);
      ctx.fillStyle = pal['rail-0']; ctx.fillRect(0, y, W, 3);
      ctx.fillStyle = rgba(pal['rail-4'], 0.55); ctx.fillRect(0, y + 9, W, 3);
      // ★下の横棒（細い）
      ctx.fillStyle = pal['rail-2']; ctx.fillRect(0, y + 26, W, 7);
      ctx.fillStyle = rgba(pal['rail-1'], 0.9); ctx.fillRect(0, y + 26, W, 2);
      ctx.fillStyle = rgba(pal['rail-4'], 0.5); ctx.fillRect(0, y + 33, W, 2);
    } else if (L.id === 'turfNear') {
      ctx.fillStyle = pal['turf-6']; ctx.fillRect(0, y, W, 22);
      ctx.fillStyle = pal['turf-7']; ctx.fillRect(0, y + 22, W, h - 22);
      ctx.fillStyle = rgba(pal['turf-6'], 0.55); ctx.fillRect(0, y + 44, W, 10);
    }
    // ★空気遠近（霞）。これが「手前と奥の差」を作る
    var a = pal.$air.alpha[L.id];
    if (a) { ctx.fillStyle = rgba(pal[pal.$air.color], a); ctx.fillRect(0, y, W, h); }
  }

  // ── 部品 ──
  function paperBox(ctx, pal, x, y, w, h) {
    ctx.fillStyle = pal['paper-1']; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = pal['paper-3']; ctx.fillRect(x, y + h - 2, w, 2); ctx.fillRect(x + w - 2, y, 2, h);
    ctx.fillStyle = pal['ink-0'];
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
    ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
  }

  function drawHorse(ctx, pal, atlas, gate, frame, cx, groundY, scale, parts, opts) {
    var e = atlas[gate];
    if (!e) return;
    var w = SPRITE_W * scale, h = SPRITE_H * scale;
    var x = Math.round(cx - w / 2);
    // ★上下動を増幅（絵はそのまま・接地コマは動かさない）
    var y = Math.round(groundY - GROUND_LINE * scale - (BOB[frame % 6] || 0) * scale);
    var sx = frame * SPRITE_W;

    if (parts.dust) {
      // ★砂煙：地面すれすれに横へ流れる平たい帯（丸を並べない）。逆光なので明るく光る
      for (var i = 0; i < 5; i++) {
        ctx.fillStyle = rgba(pal[pal.$backlight.dust], (0.30 - i * 0.055) * (scale === 2 ? 1 : 0.7));
        var dw = (54 - i * 7) * scale, dh = (3 + i) * scale;
        ctx.fillRect(Math.round(cx - w * 0.26 - i * 26 * scale), Math.round(groundY - dh - i * 3 * scale), dw, dh);
      }
    }
    if (parts.shadow) {
      ctx.save();
      ctx.globalAlpha = 0.30;
      ctx.fillStyle = pal['turf-7'];
      ctx.beginPath();
      ctx.ellipse(cx - w * 0.02, groundY - 1 * scale, w * 0.085, w * 0.020, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (parts.backlight) {
      // ★逆光の縁：右上へずらしたシルエットを後ろに置く（3px（1×）/6px（2×））
      ctx.save();
      ctx.globalAlpha = pal.$backlight.rimAlpha;
      var o = 3 * scale;
      ctx.drawImage(e.rim, sx, 0, SPRITE_W, SPRITE_H, x + o, y - o, w, h);
      ctx.drawImage(e.rim, sx, 0, SPRITE_W, SPRITE_H, x + o, y, w, h);
      ctx.drawImage(e.rim, sx, 0, SPRITE_W, SPRITE_H, x, y - o, w, h);
      ctx.restore();
    }
    ctx.drawImage(e.strip, sx, 0, SPRITE_W, SPRITE_H, x, y, w, h);

    if (parts.air && opts.air > 0) {
      ctx.save();
      ctx.globalAlpha = opts.air;
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = pal[pal.$air.color];
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }

    if (parts.bib) {
      // ★ゼッケン：レンダラが必ず描く。2桁でも欠けない
      var bx = x + CLOTH.x * scale, by = y + CLOTH.y * scale;
      var bw = CLOTH.w * scale, bh = CLOTH.h * scale;
      var col = hex2rgb(pal['silk-' + gate]);
      var darkBg = (col[0] * 299 + col[1] * 587 + col[2] * 114) / 1000 < 140;
      ctx.fillStyle = pal['paper-0']; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = rgba(pal['ink-0'], 0.55); ctx.fillRect(bx, by + bh - scale, bw, scale);
      ctx.fillStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
      ctx.fillRect(bx, by, bw, 3 * scale);
      var ds = scale * 3;
      var tw = textWidth(String(gate), ds);
      drawDigits(ctx, gate, Math.round(bx + (bw - tw) / 2), Math.round(by + (bh - GH * ds) / 2 + scale), ds,
        pal['ink-0'], darkBg ? null : null);
    }
    if (parts.effort && opts.effort !== undefined) {
      var ew = 30 * scale, eh = 3 * scale;
      var ex = Math.round(cx - ew / 2), ey = y - 7 * scale;
      ctx.fillStyle = rgba(pal['ink-0'], 0.55); ctx.fillRect(ex - scale, ey - scale, ew + 2 * scale, eh + 2 * scale);
      ctx.fillStyle = rgba(pal['paper-3'], 0.7); ctx.fillRect(ex, ey, ew, eh);
      ctx.fillStyle = opts.effort < 0.3 ? pal['mark-red'] : pal['mark-gold'];
      ctx.fillRect(ex, ey, Math.round(ew * opts.effort), eh);
      // ★色だけに頼らない：刻みの数でも残量が読める
      ctx.fillStyle = rgba(pal['ink-0'], 0.45);
      for (var t = 1; t < 4; t++) ctx.fillRect(ex + Math.round(ew * t / 4), ey, scale, eh);
    }
    if (opts.own && parts.ownMark) {
      // ★自馬マーカー：形（▼）＋文字。色だけに頼らない
      var mx = Math.round(cx), my = y - 26 * scale;
      ctx.fillStyle = pal['ink-0'];
      for (var r0 = 0; r0 < 9 * scale; r0++) ctx.fillRect(mx - (9 * scale - r0) - 1, my + r0, (9 * scale - r0) * 2 + 2, 1);
      ctx.fillStyle = pal['mark-gold'];
      for (var r = 0; r < 8 * scale; r++) ctx.fillRect(mx - (8 * scale - r), my + r, (8 * scale - r) * 2, 1);
      ctx.fillStyle = pal['paper-0'];
      ctx.font = 'bold ' + (11 * scale) + 'px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('自', mx, my - 3 * scale);
      ctx.textAlign = 'left';
    }
  }

  function drawPole(ctx, pal, x, baseY, metersLeft, scale) {
    var h = 44 * scale;
    var y = baseY - h;
    ctx.fillStyle = pal['rail-0']; ctx.fillRect(x, y, 3 * scale, h);
    ctx.fillStyle = pal['ink-0'];
    for (var i = 0; i < 3; i++) ctx.fillRect(x, y + (i * 2 + 1) * 6 * scale, 3 * scale, 5 * scale);
    var bw = 34 * scale, bh = 18 * scale;
    var bx = Math.round(x + 1.5 * scale - bw / 2), by = y - bh - 2 * scale;
    paperBox(ctx, pal, bx, by, bw, bh);
    var tw = textWidth(String(metersLeft), scale);
    drawDigits(ctx, metersLeft, Math.round(bx + (bw - tw) / 2), Math.round(by + (bh - GH * scale) / 2), scale, pal['ink-0'], null);
  }

  /** ★決勝線（走路の面。馬より奥に敷く） */
  function drawFinish(ctx, pal, x, top, height, scale) {
    var w = 8 * scale, cell = 10 * scale;
    for (var i = 0; i * cell < height; i++) {
      ctx.fillStyle = i % 2 === 0 ? pal['paper-0'] : pal['ink-0'];
      ctx.fillRect(x, top + i * cell, w, Math.min(cell, height - i * cell));
    }
    ctx.fillStyle = rgba(pal['ink-0'], 0.35);
    ctx.fillRect(x + w, top, 2 * scale, height);
  }

  /** ★ゴール板（ラチの線に立つ＝馬より手前。決勝線の真上・高い位置に吊る） */
  function drawGoalPost(ctx, pal, x, baseY) {
    var pw = 132, ph = 38, postTop = baseY - 218;
    var px = Math.round(x - pw / 2), py = postTop;
    ctx.fillStyle = pal['rail-3']; ctx.fillRect(Math.round(x - 3), py + ph, 6, baseY - py - ph);
    ctx.fillStyle = rgba(pal['ink-0'], 0.45); ctx.fillRect(Math.round(x + 1), py + ph, 2, baseY - py - ph);
    ctx.fillStyle = rgba(pal['ink-0'], 0.35); ctx.fillRect(px + 3, py + 4, pw, ph);
    paperBox(ctx, pal, px, py, pw, ph);
    ctx.fillStyle = pal['ink-0'];
    ctx.font = 'bold 22px ui-monospace, "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('\u6c7a\u3000\u52dd', x, py + ph * 0.72);
    ctx.textAlign = 'left';
  }

  /** ★順位表示（紙。角丸なし・罫線と余白で区切る） */
  function drawOrder(ctx, pal, order, own) {
    var cell = 34, gap = 4, padX = 12, padY = 10;
    var w = order.length * cell + (order.length - 1) * gap + padX * 2;
    var h = cell + padY * 2 + 14;
    var x = Math.round((1280 - w) / 2), y = 22;
    paperBox(ctx, pal, x, y, w, h);
    ctx.fillStyle = pal['ink-2'];
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('先 頭', x + padX, y + h - 6);
    ctx.textAlign = 'right';
    ctx.fillText('後 方', x + w - padX, y + h - 6);
    for (var i = 0; i < order.length; i++) {
      var gate = order[i];
      var cx = x + padX + i * (cell + gap), cy = y + padY;
      var col = hex2rgb(pal['silk-' + gate]);
      ctx.fillStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
      ctx.fillRect(cx, cy, cell, cell);
      ctx.fillStyle = rgba(pal['ink-0'], 0.85);
      ctx.fillRect(cx, cy, cell, 1); ctx.fillRect(cx, cy + cell - 1, cell, 1);
      ctx.fillRect(cx, cy, 1, cell); ctx.fillRect(cx + cell - 1, cy, 1, cell);
      var dark = (col[0] * 299 + col[1] * 587 + col[2] * 114) / 1000 < 140;
      var s = 3, tw = textWidth(String(gate), s);
      drawDigits(ctx, gate, Math.round(cx + (cell - tw) / 2), Math.round(cy + (cell - GH * s) / 2), s,
        dark ? pal['paper-0'] : pal['ink-0'], dark ? rgba(pal['ink-0'], 0.9) : rgba(pal['paper-0'], 0.9));
      if (i === 0) {
        // ★先頭は「冠」の形で重複させる（色だけに頼らない・§4）
        ctx.fillStyle = pal['mark-gold'];
        var kx = cx + cell / 2;
        ctx.beginPath();
        ctx.moveTo(kx - 11, cy - 4); ctx.lineTo(kx - 7, cy - 12); ctx.lineTo(kx, cy - 5);
        ctx.lineTo(kx + 7, cy - 12); ctx.lineTo(kx + 11, cy - 4);
        ctx.closePath(); ctx.fill();
      }
      if (gate === own) {
        ctx.fillStyle = pal['ink-0'];
        ctx.fillRect(cx - 2, cy + cell + 3, cell + 4, 3);
      }
    }
  }

  /** ★スタミナゲージ — 唯一の「機械」の表現（§12.6） */
  function drawGauge(ctx, pal, x, y, w, ratio, cuePhase, cueActive) {
    var h = 66;
    ctx.fillStyle = rgba(pal['ink-0'], 0.72); ctx.fillRect(x, y, w, h);
    ctx.fillStyle = rgba(pal['paper-1'], 0.35);
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
    ctx.fillStyle = pal['paper-2'];
    ctx.font = 'bold 13px ui-monospace, monospace'; ctx.textAlign = 'left';
    ctx.fillText('ス タ ミ ナ', x + 12, y + 20);
    var gx = x + 12, gy = y + 28, gw = w - 24, gh = 16;
    ctx.fillStyle = pal['ink-1']; ctx.fillRect(gx, gy, gw, gh);
    ctx.fillStyle = ratio < 0.25 ? pal['mark-red'] : pal['turf-1'];
    ctx.fillRect(gx, gy, Math.round(gw * ratio), gh);
    ctx.fillStyle = rgba(pal['ink-0'], 0.55);
    for (var t = 1; t < 10; t++) ctx.fillRect(gx + Math.round(gw * t / 10), gy, 1, gh);
    ctx.fillStyle = pal['paper-1'];
    ctx.fillRect(gx + Math.round(gw * ratio) - 1, gy - 4, 2, gh + 8);
    // ★仕掛けの合図：出ていない間も枠を描く（見落としと未到来を分ける）
    var cx = x + 12, cy = y + 50, cw = w - 24;
    ctx.fillStyle = cueActive ? pal['mark-gold'] : rgba(pal['paper-2'], 0.22);
    ctx.fillRect(cx, cy, cw, 12);
    ctx.fillStyle = cueActive ? pal['ink-0'] : pal['paper-2'];
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillText((cueActive ? '▶ ' : '   ') + cuePhase, cx + 6, cy + 10);
  }

  /** ★差と詰まり（順位の数字を出さない・Q-P4-14） */
  function drawGap(ctx, pal, x, y, w, meters, closingMps, toGo) {
    var h = 40;
    ctx.fillStyle = rgba(pal['ink-0'], 0.72); ctx.fillRect(x, y, w, h);
    ctx.fillStyle = rgba(pal['paper-1'], 0.35);
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
    ctx.textAlign = 'left';
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillStyle = pal['paper-2'];
    ctx.fillText(meters <= 0.01 ? '先頭' : '前まで ' + meters.toFixed(1) + 'm', x + 12, y + 17);
    ctx.fillStyle = closingMps >= 0.05 ? pal['mark-teal'] : closingMps <= -0.05 ? pal['mark-red'] : pal['paper-2'];
    ctx.fillText((closingMps >= 0.05 ? '▲' : closingMps <= -0.05 ? '▼' : '±') + Math.abs(closingMps).toFixed(1) + 'm/s', x + 12, y + 33);
    ctx.fillStyle = pal['paper-1'];
    ctx.textAlign = 'right';
    ctx.fillText(toGo === 0 ? '圏 内' : 'あと ' + toGo + ' 頭', x + w - 12, y + 33);
    ctx.textAlign = 'left';
  }

  /** ★ペース（脚質と対で意味を持つ。形の刻みを併記） */
  function drawPace(ctx, pal, x, y, pace) {
    var w = 150, h = 40;
    paperBox(ctx, pal, x, y, w, h);
    var label = { slow: 'スロー', middle: 'ミドル', high: 'ハイ' }[pace] || pace;
    ctx.fillStyle = pal['ink-2'];
    ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'left';
    ctx.fillText('ペース', x + 10, y + 15);
    ctx.fillStyle = pal['ink-0'];
    ctx.font = 'bold 15px ui-monospace, monospace';
    ctx.fillText(label, x + 10, y + 32);
    var steps = { slow: 1, middle: 2, high: 3 }[pace] || 2;
    for (var i = 0; i < 3; i++) {
      var bh = 8 + i * 6;
      ctx.fillStyle = i < steps ? (pace === 'high' ? pal['mark-red'] : pal['ink-0']) : pal['paper-3'];
      ctx.fillRect(x + w - 46 + i * 12, y + h - 10 - bh, 8, bh);
    }
  }

  /** ★実況帯（変化を言う。順位の数字を言わない） */
  function drawCallout(ctx, pal, text) {
    var x = 24, y = 648, w = 792, h = 56;
    ctx.fillStyle = rgba(pal['ink-0'], 0.35); ctx.fillRect(x + 4, y + 5, w, h);
    paperBox(ctx, pal, x, y, w, h);
    ctx.fillStyle = pal['ink-0']; ctx.fillRect(x, y, 5, h);
    ctx.font = 'bold 28px ui-monospace, "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(text, x + 22, y + 39);
    ctx.fillStyle = pal['ink-2'];
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('実 況', x + 22, y + 16);
  }

  /** ★着順表（確定後のみ。レース中は出さない） */
  function drawResult(ctx, pal, x, y, entries) {
    var rowH = 34, w = 380, head = 34;
    var h = head + entries.length * rowH + 10;
    paperBox(ctx, pal, x, y, w, h);
    ctx.fillStyle = pal['ink-0']; ctx.fillRect(x + 1, y + 1, w - 2, head - 1);
    ctx.fillStyle = pal['paper-0'];
    ctx.font = 'bold 15px ui-monospace, monospace'; ctx.textAlign = 'left';
    ctx.fillText('着  順', x + 14, y + 23);
    ctx.fillStyle = pal['paper-2'];
    ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'right';
    ctx.fillText('確  定', x + w - 14, y + 23);
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i], ry = y + head + i * rowH;
      if (i % 2 === 1) { ctx.fillStyle = rgba(pal['paper-3'], 0.35); ctx.fillRect(x + 1, ry, w - 2, rowH); }
      ctx.fillStyle = rgba(pal['ink-2'], 0.4); ctx.fillRect(x + 1, ry + rowH, w - 2, 1);
      ctx.fillStyle = pal['ink-0']; ctx.textAlign = 'left';
      ctx.font = 'bold 17px ui-monospace, monospace';
      ctx.fillText(String(e.place), x + 16, ry + 23);
      var col = hex2rgb(pal['silk-' + e.gate]);
      ctx.fillStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
      ctx.fillRect(x + 46, ry + 6, 26, 22);
      ctx.fillStyle = rgba(pal['ink-0'], 0.85);
      ctx.fillRect(x + 46, ry + 6, 26, 1); ctx.fillRect(x + 46, ry + 27, 26, 1);
      ctx.fillRect(x + 46, ry + 6, 1, 22); ctx.fillRect(x + 71, ry + 6, 1, 22);
      var dark = (col[0] * 299 + col[1] * 587 + col[2] * 114) / 1000 < 140;
      var s = 2, tw = textWidth(String(e.gate), s);
      drawDigits(ctx, e.gate, Math.round(x + 46 + (26 - tw) / 2), ry + 6 + Math.round((22 - GH * s) / 2), s,
        dark ? pal['paper-0'] : pal['ink-0'], null);
      ctx.fillStyle = pal['ink-1'];
      ctx.font = '14px ui-monospace, monospace';
      ctx.fillText(e.time, x + 88, ry + 23);
      ctx.fillStyle = pal['ink-2'];
      ctx.textAlign = 'right';
      ctx.fillText(e.margin, x + w - 16, ry + 23);
      ctx.textAlign = 'left';
    }
  }

  var ALL_PARTS = {
    sky: true, stand: true, hedge: true, fence: true, turfFar: true, turfMain: true,
    railFront: true, turfNear: true, air: true, backlight: true, shadow: true, dust: true,
    bib: true, effort: true, ownMark: true, order: true, gauge: true, gap: true, pace: true,
    callout: true, pole: true, finish: true, result: true
  };

  var LAYER_PART = {
    sky: 'sky', stand: 'stand', hedge: 'hedge', fenceFar: 'fence', turfFar: 'turfFar',
    turfMain: 'turfMain', railFront: 'railFront', turfNear: 'turfNear'
  };

  var SCENES = {
    'straight200': {
      label: '直線 残り200m',
      callout: 'さあ直線　7番が内から伸びる',
      cue: '直線', cueActive: true, gauge: 0.42, gap: { m: 1.8, mps: 0.9, toGo: 2 },
      pace: 'high', poleX: 1198, poleMeters: 200, finishX: null, result: null
    },
    'goal': {
      label: 'ゴール前',
      callout: '7番と3番　並んで大接戦',
      cue: '直線', cueActive: true, gauge: 0.11, gap: { m: 0.3, mps: 1.4, toGo: 1 },
      pace: 'high', poleX: null, poleMeters: 200, finishX: 940, result: null
    },
    'fixed': {
      label: '確定',
      callout: '7番　ゴールイン',
      cue: '確定', cueActive: false, gauge: 0.04, gap: { m: 0, mps: 0, toGo: 0 },
      pace: 'high', poleX: null, poleMeters: 200, finishX: 470,
      result: [
        { place: 1, gate: 7, time: '1:33.4', margin: '' },
        { place: 2, gate: 3, time: '1:33.5', margin: 'クビ' },
        { place: 3, gate: 1, time: '1:33.7', margin: '1 1/4' },
        { place: 4, gate: 12, time: '1:34.0', margin: '1 3/4' },
        { place: 5, gate: 8, time: '1:34.2', margin: '1' }
      ]
    }
  };

  function drawStill(ctx, o) {
    var pal = o.palette, layers = o.layers, atlas = o.atlas;
    var parts = Object.assign({}, ALL_PARTS, o.parts || {});
    var scene = SCENES[o.scene || 'straight200'];
    var scroll = o.scroll === undefined ? 0 : o.scroll;
    var V = layers.viewport;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, V.width, V.height);
    if (!o.transparent) { ctx.fillStyle = pal['ink-0']; ctx.fillRect(0, 0, V.width, V.height); }
    ctx.textBaseline = 'alphabetic';

    var byId = {};
    layers.layers.forEach(function (L) { byId[L.id] = L; });

    /**
     * ★**コーナーの反り**。`o.curve`（-1〜1）で走路の帯をゆるく反らせます。
     *   ⚠️ **線遠近は描き込みません**（アートバイブル §3）。帯を**上下に反らせるだけ**です。
     *   ★0 のときは何もしません（直線では完全に従来どおり）。
     */
    var curve = o.curve || 0;

    ['sky', 'stand', 'hedge', 'fenceFar', 'turfFar', 'turfMain'].forEach(function (id) {
      if (parts[LAYER_PART[id]]) drawLayer(ctx, byId[id], pal, scroll, V);
    });

    // ★場の空気：馬群の足元に残る逆光の霹（層でなく場の光）
    if (parts.dust) {
      for (var hz = 0; hz < 60; hz++) {
        ctx.fillStyle = rgba(pal['sky-4'], 0.13 * (1 - Math.abs(hz - 30) / 30));
        ctx.fillRect(0, byId.turfMain.y + 90 + hz, V.width, 1);
      }
    }

    // ★決勝線は走路の面に（馬より奥）
    if (parts.finish && scene.finishX !== null) {
      drawFinish(ctx, pal, scene.finishX, byId.turfMain.y, byId.turfMain.height + 30, 2);
    }

    /**
     * ★**馬群**。奥の段から手前の段へ。
     *
     *   ⚠️ 既定は `layers.horsePlan`（静止画のための固定配置）ですが、
     *      **動くレースでは外から配置を渡せる**ようにしています（`o.horses`）。
     *      形: `[{ gate, row: 0|1|2, x, frame, effort, own }]`
     *   ★**この層は順位を決めません。** 渡された配置を描くだけです。
     */
    var plan = layers.horsePlan;
    var own = (o.own !== undefined) ? o.own : plan.own;
    if (o.horses) {
      var byRow = [[], [], []];
      o.horses.forEach(function (hh) { (byRow[hh.row] || byRow[0]).push(hh); });
      byRow.forEach(function (list, ri) {
        var row = plan.rows[ri];
        list.forEach(function (hh) {
          drawHorse(ctx, pal, atlas, hh.gate, hh.frame % 6, hh.x, row.groundY, row.scale, parts, {
            air: row.air,
            effort: hh.effort === undefined ? 0.6 : hh.effort,
            own: hh.gate === own
          });
        });
      });
    } else {
      plan.rows.forEach(function (row, ri) {
        row.gates.forEach(function (gate, i) {
          drawHorse(ctx, pal, atlas, gate, (i * 2 + ri * 3) % 6, row.x[i], row.groundY, row.scale, parts, {
            air: row.air,
            effort: gate === plan.own ? scene.gauge : [0.7, 0.5, 0.35, 0.6, 0.8, 0.45, 0.55, 0.3, 0.65][(gate * 3) % 9],
            own: gate === plan.own
          });
        });
      });
    }

    /**
     * ★コーナーの反りを、走路の境目に描き足します（帯そのものは反らせない＝安全）。
     */
    if (curve !== 0) {
      var cy0 = byId.turfMain.y, cy1 = byId.turfMain.y + byId.turfMain.height;
      [[cy0, pal['fence-1'], 3], [cy1, pal['rail-1'], 4]].forEach(function (e) {
        ctx.strokeStyle = e[1]; ctx.lineWidth = e[2];
        ctx.beginPath();
        for (var cx = 0; cx <= V.width; cx += 8) {
          var t = cx / V.width;
          var bow = Math.sin(t * Math.PI) * 26 * curve;
          if (cx === 0) ctx.moveTo(cx, e[0] + bow); else ctx.lineTo(cx, e[0] + bow);
        }
        ctx.stroke();
      });
    }

    if (parts.railFront) drawLayer(ctx, byId.railFront, pal, scroll, V);
    if (parts.pole && scene.poleX !== null) drawPole(ctx, pal, scene.poleX, byId.railFront.y, scene.poleMeters, 2);
    if (parts.finish && scene.finishX !== null) drawGoalPost(ctx, pal, scene.finishX + 8, byId.railFront.y);
    if (parts.turfNear) drawLayer(ctx, byId.turfNear, pal, scroll, V);

    // ── UI（画面の座標系。カメラが隠せない） ──
    if (parts.order) drawOrder(ctx, pal, o.runningOrder || plan.runningOrder, own);
    if (parts.pace) drawPace(ctx, pal, 1106, 22, o.pace || scene.pace);
    if (parts.gauge) drawGauge(ctx, pal, 24, 22, 300, o.gauge !== undefined ? o.gauge : scene.gauge, o.cue || scene.cue, o.cueActive !== undefined ? o.cueActive : scene.cueActive);
    var gp = o.gap || scene.gap;
    if (parts.gap) drawGap(ctx, pal, 24, 96, 300, gp.m, gp.mps, gp.toGo);
    if (parts.callout) drawCallout(ctx, pal, o.callout !== undefined ? o.callout : scene.callout);
    if (parts.result && scene.result) drawResult(ctx, pal, 866, 200, scene.result);
  }

  g.STARStill = {
    SPRITE_W: SPRITE_W, SPRITE_H: SPRITE_H, GROUND_LINE: GROUND_LINE, CLOTH: CLOTH,
    ALL_PARTS: ALL_PARTS, SCENES: SCENES, LAYER_PART: LAYER_PART,
    buildAtlas: buildAtlas, drawStill: drawStill, drawLayer: drawLayer,
    setOptions: setOptions,
    coatOf: coatOf, textWidth: textWidth, drawDigits: drawDigits,
    /**
     * ★**第2便の `scene.js` が使う補助関数**。
     *   ⚠️ 公開していなかったため `S.rgba is not a function` で落ちました。
     *      `scene.js` は「still.js を土台にする」設計なので、**土台側が出す必要があります**。
     */
    rgba: rgba, hex: hex2rgb, paperBox: paperBox, drawHorse: drawHorse
  };
})(typeof window !== 'undefined' ? window : globalThis);
