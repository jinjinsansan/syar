/**
 * ★STAR 区間別レンダラ（第2便の参照実装）
 *
 * handoff/mockup/still.js（第1便）を**土台にして**、区間ごとの背景・コーナー・発走を足します。
 * ★still.js を書き換えていません。読み込む順番は still.js → scene.js です。
 *
 * ★16進はこのファイルに1つもありません。すべて palette（第1便＋第2便のマージ）から役割名で引きます。
 * ★層の y・高さ・速度比・タイル幅は handoff2/layers.json から読みます。
 *
 * 使い方:
 *   const pal = {...palette1, ...palette2};
 *   STARScene.drawScene(ctx, { palette: pal, layers2, sharedLayers, atlas, section: 'backstretch' });
 */
(function (g) {
  'use strict';
  var S = g.STARStill;

  var GROUND_LINE = 136, SPRITE_W = 220, SPRITE_H = 140;

  function rgba(pal, role, a) { return S.rgba(pal[role], a); }

  /** 粒（観客・樹林）。★輪郭を描かず密度だけで塊にする */
  function grain(ctx, pal, x0, y0, w, h, cA, cB, stepX, stepY, sw, sh, sa, sb, off) {
    for (var y = y0; y < y0 + h; y += stepY) {
      for (var x = x0 - (off || 0); x < x0 + w; x += stepX) {
        ctx.fillStyle = (((x * sa + y * sb) % 11) < 5) ? cA : cB;
        ctx.fillRect(x, y, sw, sh);
      }
    }
  }

  /* ── 区間ごとの背景 ─────────────────────────────── */

  function drawSky(ctx, pal, L, glare, W, extraCloud) {
    var y = L.y, h = L.height;
    var ramp = ['sky-0', 'sky-1', 'sky-2', 'sky-3'];
    for (var yy = 0; yy < h; yy++) {
      var t = yy / (h - 1);
      var seg = Math.min(ramp.length - 2, Math.floor(t * (ramp.length - 1)));
      var local = t * (ramp.length - 1) - seg;
      ctx.fillStyle = pal[ramp[seg]];
      ctx.fillRect(0, y + yy, W, 1);
      ctx.fillStyle = rgba(pal, ramp[seg + 1], local);
      ctx.fillRect(0, y + yy, W, 1);
    }
    if (glare > 0) {
      for (var k = 0; k < 44; k++) {
        ctx.fillStyle = rgba(pal, 'sky-5', (0.04 + 0.62 * Math.pow(k / 43, 1.7)) * glare);
        ctx.fillRect(0, y + h - 44 + k, W, 1);
      }
    }
    var clouds = extraCloud
      ? [[0.22, 3], [0.33, 2], [0.44, 4], [0.55, 2], [0.64, 2]]
      : [[0.26, 4], [0.34, 2], [0.46, 3], [0.56, 2]];
    clouds.forEach(function (b) {
      ctx.fillStyle = rgba(pal, 'sky-4', 0.20);
      ctx.fillRect(0, y + Math.round(h * b[0]), W, b[1]);
    });
  }

  /** ★向正面 — スタンドの裏側。★観客が1人もいないのが正面との最大の差 */
  function drawBackside(ctx, pal, L, scroll, W) {
    var y = L.y, h = L.height;
    var off = Math.floor(scroll * L.speedRatio) % L.tileWidth;
    ctx.fillStyle = pal['backside-1']; ctx.fillRect(0, y, W, h);
    ctx.fillStyle = pal['backside-4']; ctx.fillRect(0, y, W, 4);
    ctx.fillStyle = rgba(pal, 'backside-0', 0.5); ctx.fillRect(0, y + 4, W, 3);
    // ★設備の箱（空調・階段室）。裏side だけの語彙
    for (var bx = -off; bx < W + L.tileWidth; bx += L.tileWidth) {
      ctx.fillStyle = pal['backside-2']; ctx.fillRect(bx + 40, y + 6, 18, Math.min(10, h - 12));
      ctx.fillStyle = rgba(pal, 'backside-0', 0.45); ctx.fillRect(bx + 40, y + 6, 18, 2);
    }
    // ★縦の配管（裏面の唯一の縦要素）
    ctx.fillStyle = rgba(pal, 'backside-3', 0.7);
    for (var px = -off; px < W + L.tileWidth; px += L.tileWidth / 2) ctx.fillRect(px + 12, y + 4, 2, h - 8);
    ctx.fillStyle = rgba(pal, 'backside-3', 0.45); ctx.fillRect(0, y + h - 7, W, 4);
    ctx.fillStyle = rgba(pal, 'backside-4', 0.6); ctx.fillRect(0, y + h - 3, W, 3);
  }

  /** ★外周の樹林（向正面）／植え込み（コーナー） */
  function drawTree(ctx, pal, L, scroll, W, trimmed) {
    var y = L.y, h = L.height;
    var off = Math.floor(scroll * L.speedRatio) % L.tileWidth;
    if (trimmed) {
      // ★植え込み（人の手が入っている＝天端が揃う）
      ctx.fillStyle = pal['tree-1']; ctx.fillRect(0, y, W, Math.round(h * 0.46));
      ctx.fillStyle = pal['tree-0']; ctx.fillRect(0, y, W, 3);
      ctx.fillStyle = pal['tree-2']; ctx.fillRect(0, y + Math.round(h * 0.46), W, h - Math.round(h * 0.46));
      grain(ctx, pal, 0, y + 4, W, Math.round(h * 0.46) - 6, rgba(pal, 'tree-0', 0.5), rgba(pal, 'tree-4', 0.5), 4, 3, 3, 2, 5, 3, off);
      grain(ctx, pal, 0, y + Math.round(h * 0.46) + 2, W, h - Math.round(h * 0.46) - 8, rgba(pal, 'tree-1', 0.55), rgba(pal, 'tree-4', 0.6), 4, 3, 3, 2, 7, 5, off);
      ctx.fillStyle = pal['tree-4']; ctx.fillRect(0, y + h - 6, W, 6);
      return;
    }
    // ★外周の樹林。**天端は揃わない**（自然木）。ただし★輪郭線は1本も引かず、
    //   8px の柱を高さ違いで並べて塊を作ります（＝水平の帯の集合。線遠近ではありません）
    var col = 8;
    var tops = [];
    for (var x = 0; x < W + col; x += col) {
      var k = Math.abs(Math.sin((x + off) * 0.0177) * 0.6 + Math.sin((x + off) * 0.0061) * 0.4);
      tops.push(Math.round(k * (h * 0.34)));
    }
    for (var i = 0; i < tops.length; i++) {
      var cx = i * col, t = y + tops[i];
      ctx.fillStyle = pal['tree-2']; ctx.fillRect(cx, t, col, y + h - t);
      // 天端の受光（★上から 6px だけ）
      ctx.fillStyle = pal['tree-1']; ctx.fillRect(cx, t, col, 6);
      ctx.fillStyle = rgba(pal, 'tree-0', 0.65); ctx.fillRect(cx, t, col, 2);
    }
    // 幹側（下半分）を暗く沈める＝塊の厚み
    for (var yy = 0; yy < h; yy++) {
      var f = yy / (h - 1);
      if (f < 0.42) continue;
      ctx.fillStyle = rgba(pal, 'tree-4', (f - 0.42) * 0.95);
      ctx.fillRect(0, y + yy, W, 1);
    }
    grain(ctx, pal, 0, y + Math.round(h * 0.18), W, Math.round(h * 0.5), rgba(pal, 'tree-0', 0.30), rgba(pal, 'tree-4', 0.45), 4, 3, 3, 2, 5, 3, off);
    grain(ctx, pal, 0, y + Math.round(h * 0.5), W, Math.round(h * 0.38), rgba(pal, 'tree-1', 0.35), rgba(pal, 'tree-4', 0.6), 3, 2, 3, 2, 7, 11, off);
    ctx.fillStyle = pal['tree-4']; ctx.fillRect(0, y + h - 6, W, 6);
  }

  /** ★コーナー外側の観客。★屋根がない・頭の高さが揃わない */
  function drawCrowd(ctx, pal, L, scroll, W) {
    var y = L.y, h = L.height;
    var off = Math.floor(scroll * L.speedRatio) % L.tileWidth;
    ctx.fillStyle = pal['crowd-3']; ctx.fillRect(0, y, W, h);
    // ★頭の高さをばらつかせる（立って見ているので揃わない）
    for (var x = -off; x < W + L.tileWidth; x += 4) {
      var jitter = ((x * 7) % 5);
      for (var yy = y + 4 + jitter; yy < y + h - 6; yy += 3) {
        ctx.fillStyle = (((x * 3 + yy * 5) % 11) < 5) ? rgba(pal, 'crowd-0', 0.8) : rgba(pal, 'crowd-2', 0.75);
        ctx.fillRect(x, yy, 2, 2);
      }
    }
    ctx.fillStyle = rgba(pal, 'crowd-1', 0.35); ctx.fillRect(0, y, W, 2);
    ctx.fillStyle = pal['fence-1']; ctx.fillRect(0, y + h - 6, W, 3);
    ctx.fillStyle = rgba(pal, 'ink-0', 0.5); ctx.fillRect(0, y + h - 3, W, 3);
  }

  function drawFenceFar(ctx, pal, L, scroll, W) {
    var y = L.y, h = L.height;
    var off = Math.floor(scroll * L.speedRatio) % L.tileWidth;
    // ★柵の向こうに見える地面。**これが無いと柵の帯が黒く抜けます**（高い柵ほど致命的）
    ctx.fillStyle = pal['turf-0']; ctx.fillRect(0, y, W, h);
    for (var gy = 0; gy < h; gy++) {
      ctx.fillStyle = rgba(pal, 'turf-1', 0.25 + 0.5 * (gy / h));
      ctx.fillRect(0, y + gy, W, 1);
    }
    ctx.fillStyle = rgba(pal, 'sky-3', 0.35); ctx.fillRect(0, y, W, h);
    // 支柱
    ctx.fillStyle = pal['fence-2'];
    for (var fx = -off; fx < W + L.tileWidth; fx += L.tileWidth) ctx.fillRect(fx, y, h > 30 ? 3 : 2, h);
    // 横棒（★高い柵ほど本数が増える）
    var bars = h > 40 ? [0.06, 0.36, 0.66] : (h > 24 ? [0.08, 0.44] : [0.12]);
    ctx.fillStyle = pal['fence-0']; ctx.fillRect(0, y + 2, W, 4);
    ctx.fillStyle = rgba(pal, 'fence-3', 0.45); ctx.fillRect(0, y + 6, W, 2);
    bars.forEach(function (b, i) {
      if (i === 0) return;
      var by = y + Math.round(h * b);
      ctx.fillStyle = pal['fence-1']; ctx.fillRect(0, by, W, 3);
      ctx.fillStyle = rgba(pal, 'fence-3', 0.4); ctx.fillRect(0, by + 3, W, 2);
    });
    ctx.fillStyle = rgba(pal, 'fence-3', 0.7); ctx.fillRect(0, y + h - 3, W, 3);
  }

  /** ★スタンド（直線）— 第1便と同じ意匠 */
  function drawStand(ctx, pal, L, scroll, W) {
    var y = L.y, h = L.height;
    var off = Math.floor(scroll * L.speedRatio) % L.tileWidth;
    ctx.fillStyle = pal['stand-0']; ctx.fillRect(0, y, W, 14);
    ctx.fillStyle = rgba(pal, 'sky-5', 0.6); ctx.fillRect(0, y + 14, W, 2);
    ctx.fillStyle = rgba(pal, 'ink-0', 0.55); ctx.fillRect(0, y + 16, W, 6);
    ctx.fillStyle = pal['stand-3']; ctx.fillRect(0, y + 22, W, 34);
    grain(ctx, pal, 0, y + 24, W, 30, rgba(pal, 'crowd-0', 0.85), rgba(pal, 'stand-0', 0.6), 5, 4, 2, 2, 3, 7, off);
    ctx.fillStyle = pal['stand-2']; ctx.fillRect(0, y + 56, W, 14);
    grain(ctx, pal, 0, y + 58, W, 10, rgba(pal, 'crowd-1', 0.7), rgba(pal, 'ink-0', 0.45), 6, 4, 2, 2, 5, 11, off);
    ctx.fillStyle = pal['fence-1']; ctx.fillRect(0, y + 70, W, 10);
    ctx.fillStyle = rgba(pal, 'ink-0', 0.30); ctx.fillRect(0, y + 70, W, 2);
    ctx.fillStyle = rgba(pal, 'ink-0', 0.42);
    for (var stx = -off; stx < W + L.tileWidth; stx += L.tileWidth) ctx.fillRect(stx, y + 22, 4, 48);
    ctx.fillStyle = rgba(pal, 'ink-0', 0.5); ctx.fillRect(0, y + h - 4, W, 4);
  }

  function drawHedge(ctx, pal, L, scroll, W) {
    var y = L.y, h = L.height;
    var off = Math.floor(scroll * L.speedRatio) % L.tileWidth;
    ctx.fillStyle = pal['hedge-1']; ctx.fillRect(0, y, W, 22);
    ctx.fillStyle = pal['hedge-0']; ctx.fillRect(0, y, W, 4);
    ctx.fillStyle = pal['hedge-2']; ctx.fillRect(0, y + 22, W, h - 22);
    ctx.fillStyle = rgba(pal, 'hedge-0', 0.55); ctx.fillRect(0, y + 22, W, 2);
    ctx.fillStyle = pal['hedge-4']; ctx.fillRect(0, y + h - 5, W, 5);
    grain(ctx, pal, 0, y + 5, W, 16, rgba(pal, 'hedge-0', 0.5), rgba(pal, 'hedge-4', 0.55), 4, 3, 3, 2, 5, 3, off);
    grain(ctx, pal, 0, y + 25, W, h - 32, rgba(pal, 'hedge-1', 0.55), rgba(pal, 'hedge-4', 0.6), 5, 3, 3, 2, 7, 5, off);
  }

  /** ★コーナーだけの層。走路の中を横切る2本目のラチ線（★水平のまま） */
  function drawRailBend(ctx, pal, L, scroll, W) {
    var y = L.y;
    var off = Math.floor(scroll * L.speedRatio) % L.tileWidth;
    ctx.fillStyle = rgba(pal, 'turf-7', 0.30); ctx.fillRect(0, y + 4, W, L.height);
    ctx.fillStyle = pal['rail-3'];
    for (var px = -off; px < W + L.tileWidth; px += L.tileWidth) ctx.fillRect(px, y + 2, 4, L.height - 2);
    ctx.fillStyle = pal['rail-1']; ctx.fillRect(0, y, W, 7);
    ctx.fillStyle = pal['rail-0']; ctx.fillRect(0, y, W, 3);
    ctx.fillStyle = rgba(pal, 'rail-4', 0.5); ctx.fillRect(0, y + 7, W, 3);
    ctx.fillStyle = pal['rail-2']; ctx.fillRect(0, y + 15, W, 5);
    ctx.fillStyle = rgba(pal, 'rail-1', 0.85); ctx.fillRect(0, y + 15, W, 2);
    ctx.fillStyle = rgba(pal, 'turf-7', 0.45); ctx.fillRect(0, y + L.height, W, 4);
  }

  /* ── 発走ゲート ───────────────────────────────── */

  /**
   * ★ゲート。業界共通の作法として採ります（固有の意匠は入れません）。
   *   scale は 2 のみ（D-058）。closed = 扉が閉じている、open = 前扉が前方へ開いた状態。
   */
  function drawGate(ctx, pal, x, groundY, stalls, open, firstGate, scale) {
    var sw = 46 * scale;              // 1房の幅
    var bodyH = 40 * scale;           // 房の高さ（馬体が隠れる高さ）
    var postW = 5 * scale;
    var topH = 8 * scale;             // 天板
    var plateH = 13 * scale;
    var totalW = stalls * sw + postW;
    var top = groundY - bodyH - topH - plateH;

    // ★後ろの影（ゲートは重い鉄の塊）
    ctx.fillStyle = S.rgba(pal['ink-0'], 0.35);
    ctx.fillRect(x + 3 * scale, top + 4 * scale, totalW, bodyH + topH + plateH);

    for (var i = 0; i < stalls; i++) {
      var sx = x + i * sw;
      // 房の中。閉 = 暗い（馬が入っている）／開 = 抜けている（地面が透ける）
      ctx.fillStyle = open ? S.rgba(pal['gate-4'], 0.30) : pal['gate-4'];
      ctx.fillRect(sx + postW, top + topH + plateH, sw - postW, bodyH);
      // ★前扉
      if (open) {
        // ★前へ開いた扉。**房の両脇に折り畳まれた板**として描く（線遠近を描かない）
        ctx.fillStyle = pal['gate-1'];
        ctx.fillRect(sx + postW, top + topH + plateH, 4 * scale, bodyH);
        ctx.fillRect(sx + sw - 4 * scale, top + topH + plateH, 4 * scale, bodyH);
        ctx.fillStyle = pal['gate-3'];
        ctx.fillRect(sx + postW + 3 * scale, top + topH + plateH, scale, bodyH);
        ctx.fillRect(sx + sw - scale, top + topH + plateH, scale, bodyH);
      } else {
        ctx.fillStyle = pal['gate-2'];
        ctx.fillRect(sx + postW, top + topH + plateH, sw - postW, bodyH);
        // 扉の横桟（3本）
        ctx.fillStyle = pal['gate-1'];
        for (var b = 0; b < 3; b++) ctx.fillRect(sx + postW, top + topH + plateH + (b * 13 + 5) * scale, sw - postW, 3 * scale);
        ctx.fillStyle = S.rgba(pal['gate-4'], 0.55);
        for (var b2 = 0; b2 < 3; b2++) ctx.fillRect(sx + postW, top + topH + plateH + (b2 * 13 + 8) * scale, sw - postW, 2 * scale);
        // 扉の合わせ目（中央の縦線）
        ctx.fillStyle = pal['gate-4'];
        ctx.fillRect(sx + postW + Math.round((sw - postW) / 2) - scale, top + topH + plateH, 2 * scale, bodyH);
      }
      // ★番号板（枠順色＋馬番。色だけに頼らない）
      var gate = firstGate + i;
      var col = S.hex2rgb(pal['silk-' + gate] || pal['silk-1']);
      var px = sx + postW + 3 * scale, py = top + topH + 2 * scale;
      var pw = sw - postW - 6 * scale, ph = plateH - 4 * scale;
      ctx.fillStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
      ctx.fillRect(px, py, pw, ph);
      ctx.fillStyle = S.rgba(pal['ink-0'], 0.9);
      ctx.fillRect(px, py, pw, scale); ctx.fillRect(px, py + ph - scale, pw, scale);
      ctx.fillRect(px, py, scale, ph); ctx.fillRect(px + pw - scale, py, scale, ph);
      var dark = (col[0] * 299 + col[1] * 587 + col[2] * 114) / 1000 < 140;
      var ds = scale, tw = S.textWidth(String(gate), ds);
      S.drawDigits(ctx, gate, Math.round(px + (pw - tw) / 2), Math.round(py + (ph - 7 * ds) / 2), ds,
        dark ? pal['paper-0'] : pal['ink-0'], null);
      // 支柱
      ctx.fillStyle = pal['gate-2']; ctx.fillRect(sx, top, postW, bodyH + topH + plateH);
      ctx.fillStyle = pal['gate-4']; ctx.fillRect(sx + postW - scale, top, scale, bodyH + topH + plateH);
      ctx.fillStyle = pal['gate-0']; ctx.fillRect(sx, top, scale, bodyH + topH + plateH);
    }
    // 右端の支柱
    ctx.fillStyle = pal['gate-2']; ctx.fillRect(x + stalls * sw, top, postW, bodyH + topH + plateH);
    ctx.fillStyle = pal['gate-0']; ctx.fillRect(x + stalls * sw, top, scale, bodyH + topH + plateH);
    // ★騎手の頭（天板の上に出る）。★これが無いと「馬が入っている」ことが伝わりません
    if (!open) {
      for (var hi = 0; hi < stalls; hi++) {
        var hg = firstGate + hi;
        var hc = S.hex2rgb(pal['silk-' + hg] || pal['silk-1']);
        var hx = Math.round(x + hi * sw + sw / 2);
        ctx.fillStyle = S.rgba(pal['ink-0'], 0.5);
        ctx.fillRect(hx - 7 * scale, top - 8 * scale, 14 * scale, 9 * scale);
        ctx.fillStyle = 'rgb(' + hc[0] + ',' + hc[1] + ',' + hc[2] + ')';
        ctx.fillRect(hx - 6 * scale, top - 7 * scale, 12 * scale, 7 * scale);
        ctx.fillStyle = S.rgba(pal['paper-0'], 0.35);
        ctx.fillRect(hx - 6 * scale, top - 7 * scale, 12 * scale, 2 * scale);
        ctx.fillStyle = pal['ink-1'];
        ctx.fillRect(hx + 3 * scale, top - 4 * scale, 4 * scale, 3 * scale);
      }
    }
    // 天板
    ctx.fillStyle = pal['gate-1']; ctx.fillRect(x, top, totalW, topH);
    ctx.fillStyle = pal['gate-0']; ctx.fillRect(x, top, totalW, 2 * scale);
    ctx.fillStyle = pal['gate-3']; ctx.fillRect(x, top + topH - 2 * scale, totalW, 2 * scale);
    // 足元の影
    ctx.fillStyle = S.rgba(pal['turf-7'], 0.45);
    ctx.fillRect(x, groundY - 2 * scale, totalW, 3 * scale);
  }

  /** ★ファンファーレの視覚表現。★音は別。**画面で「始まる」と分かる**もの */
  function drawFanfare(ctx, pal, W, phase) {
    // phase: 0 = 旗が上がる / 1 = 旗が振られる（ファンファーレ）
    var h = 74, y = 300;
    // ★画面の上下から紙の帯が閉じてくる（＝「間」を作る）
    ctx.fillStyle = S.rgba(pal['ink-0'], 0.55);
    ctx.fillRect(0, y - 26, W, 26); ctx.fillRect(0, y + h, W, 26);
    S.paperBox(ctx, pal, 0, y, W, h);
    ctx.fillStyle = pal['ink-0'];
    ctx.fillRect(0, y, W, 3); ctx.fillRect(0, y + h - 3, W, 3);
    ctx.textAlign = 'center';
    ctx.fillStyle = pal['ink-0'];
    ctx.font = 'bold 40px ui-monospace, "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.fillText(phase ? '発　走' : '枠　入　り', W / 2, y + 50);
    // ★赤い旗（スターターの合図）。★色だけに頼らないので文字と併記
    if (phase) {
      ctx.fillStyle = pal['mark-red'];
      ctx.fillRect(W / 2 - 200, y + 22, 30, 22);
      ctx.fillStyle = pal['ink-0'];
      ctx.fillRect(W / 2 - 204, y + 18, 4, 40);
      ctx.fillStyle = pal['mark-red'];
      ctx.fillRect(W / 2 + 170, y + 22, 30, 22);
      ctx.fillStyle = pal['ink-0'];
      ctx.fillRect(W / 2 + 200, y + 18, 4, 40);
    }
    ctx.textAlign = 'left';
  }

  /* ── カット切り替えの帯 ────────────────────────── */

  /** ★カットが切り替わった瞬間に一瞬だけ入る地名帯（0.6秒） */
  function drawCutBadge(ctx, pal, label, metersLeft) {
    var w = 300, h = 52, x = 24, y = 560;
    ctx.fillStyle = S.rgba(pal['ink-0'], 0.35); ctx.fillRect(x + 4, y + 5, w, h);
    S.paperBox(ctx, pal, x, y, w, h);
    ctx.fillStyle = pal['ink-0']; ctx.fillRect(x, y, 6, h);
    ctx.fillStyle = pal['ink-0'];
    ctx.font = 'bold 28px ui-monospace, "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 22, y + 37);
    if (metersLeft !== null && metersLeft !== undefined) {
      ctx.textAlign = 'right';
      ctx.fillStyle = pal['ink-2'];
      ctx.font = 'bold 22px ui-monospace, monospace';
      ctx.fillText('残 ' + metersLeft, x + w - 16, y + 37);
      ctx.textAlign = 'left';
    }
  }

  /** ★コーナーの標識（1角/2角/3角/4角）。ラチの線に立つ */
  function drawCornerSign(ctx, pal, x, baseY, text, scale) {
    var postH = 40 * scale, pw = 30 * scale, ph = 30 * scale;
    var py = baseY - postH - ph;
    ctx.fillStyle = pal['sign-3']; ctx.fillRect(Math.round(x - 2 * scale), py + ph, 4 * scale, postH);
    ctx.fillStyle = S.rgba(pal['ink-0'], 0.35); ctx.fillRect(x - pw / 2 + 3 * scale, py + 4 * scale, pw, ph);
    ctx.fillStyle = pal['sign-0']; ctx.fillRect(x - pw / 2, py, pw, ph);
    ctx.fillStyle = pal['sign-1']; ctx.fillRect(x - pw / 2, py + ph - 3 * scale, pw, 3 * scale);
    ctx.fillStyle = pal['sign-3'];
    ctx.fillRect(x - pw / 2, py, pw, scale); ctx.fillRect(x - pw / 2, py + ph - scale, pw, scale);
    ctx.fillRect(x - pw / 2, py, scale, ph); ctx.fillRect(x + pw / 2 - scale, py, scale, ph);
    ctx.fillStyle = pal['ink-0'];
    ctx.font = 'bold ' + (15 * scale) + 'px ui-monospace, "Hiragino Kaku Gothic ProN", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, py + ph * 0.68);
    ctx.textAlign = 'left';
  }

  /* ── 本体 ─────────────────────────────────────── */

  var BG = {
    sky: drawSky, stand: drawStand, hedge: drawHedge, fenceFar: drawFenceFar,
    backside: drawBackside, tree: drawTree, crowd: drawCrowd, railBend: drawRailBend
  };

  function drawScene(ctx, o) {
    var pal = o.palette, L2 = o.layers2, atlas = o.atlas;
    var sharedSrc = o.sharedLayers;      // 第1便 layers.json の layers（turfFar 以下を引く）
    var name = o.section || 'homestretch';
    var secDef = L2.sections[name];
    var sec = secDef.inherit ? L2.sections[secDef.inherit] : secDef;
    var meta = (o.palette.$sections || {})[name] || {};
    var scroll = o.scroll === undefined ? 0 : o.scroll;
    var V = L2.viewport, W = V.width;
    var isCorner = name === 'corner';
    var variant = o.cornerVariant || 'c';
    var pan = isCorner && variant === 'c' ? L2.$cornerMotion.pan : 0;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, V.height);
    ctx.fillStyle = pal['ink-0']; ctx.fillRect(0, 0, W, V.height);
    ctx.textBaseline = 'alphabetic';

    var shared = {};
    sharedSrc.forEach(function (l) { shared[l.id] = l; });

    /** ★案A（帯の反り）用の縦ずらし。案C では 0 */
    function bow(id) {
      if (!isCorner || variant !== 'a') return 0;
      var amp = { sky: 0, crowd: 3, tree: 5, fenceFar: 7, turfFar: 10, turfMain: 16, railBend: 18, railFront: 24, turfNear: 26 }[id] || 0;
      return amp;
    }

    function eff(l) {
      if (!isCorner || variant !== 'c') return l.speedRatio;
      return l.speedRatio - pan;
    }

    /** 反りをかけて描く（案A のみ実際に反る） */
    function withBow(id, fn) {
      var b = bow(id);
      if (b === 0) { fn(); return; }
      // ★水平の帯を保ったまま、帯そのものを sin で上下にずらす（縦の線は1本も引かない）
      var slice = 16;
      for (var sx = 0; sx < W; sx += slice) {
        ctx.save();
        ctx.beginPath(); ctx.rect(sx, 0, slice, V.height); ctx.clip();
        ctx.translate(0, Math.round(-b * Math.sin((sx / (W * 1.6)) * Math.PI * 2)));
        fn();
        ctx.restore();
      }
    }

    // ── 地平線より上（区間ごと） ──
    sec.layers.forEach(function (l) {
      if (l.id === 'railBend') return;
      var eL = Object.assign({}, l, { speedRatio: eff(l) });
      withBow(l.id, function () {
        if (l.id === 'sky') drawSky(ctx, pal, eL, meta.glare === undefined ? 1 : meta.glare, W, name === 'backstretch');
        else if (l.id === 'tree') drawTree(ctx, pal, eL, scroll, W, name === 'corner');
        else BG[l.id](ctx, pal, eL, scroll, W);
      });
      var a = (pal.$air.alpha[l.id === 'backside' || l.id === 'crowd' ? 'stand' : (l.id === 'tree' ? 'hedge' : l.id)] || 0) * (meta.airMul === undefined ? 1 : meta.airMul);
      if (a > 0) { ctx.fillStyle = S.rgba(pal[pal.$air.color], a); ctx.fillRect(0, l.y, W, l.height); }
    });

    // ── 走路（全区間で共通） ──
    ['turfFar', 'turfMain'].forEach(function (id) {
      var l = Object.assign({}, shared[id], { speedRatio: eff(shared[id]) });
      withBow(id, function () { S.drawLayer(ctx, l, pal, scroll, V); });
    });

    // ★コーナーだけの2本目のラチ線（馬より奥）
    var rb = sec.layers.filter(function (l) { return l.id === 'railBend'; })[0];
    if (rb && o.parts !== false) {
      var rbl = Object.assign({}, rb, { speedRatio: eff(rb) });
      if (variant === 'b') {
        // ★案B: 斜めの帯（⚠️ §3 に抵触するので比較用）
        ctx.save();
        ctx.beginPath(); ctx.moveTo(0, 520); ctx.lineTo(W, 430); ctx.lineTo(W, 452); ctx.lineTo(0, 542); ctx.closePath();
        ctx.fillStyle = pal['rail-1']; ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, 520); ctx.lineTo(W, 430); ctx.lineTo(W, 436); ctx.lineTo(0, 526); ctx.closePath();
        ctx.fillStyle = pal['rail-0']; ctx.fill();
        ctx.restore();
      } else {
        withBow('railBend', function () { drawRailBend(ctx, pal, rbl, scroll, W); });
      }
    }

    /**
     * ★**ゲート（馬より後ろ）**。⚠️ 順番がここでなければいけません。
     *   デザイナーの指摘: 「扉が開いた瞬間、馬はもうゲートより前にいる」。
     *   `drawGate` を呼び出し側で後から描くと、**馬がゲートに隠れます**。
     */
    if (o.gate) {
      var G = o.gate;
      drawGate(ctx, pal, G.x, G.groundY, G.stalls, G.open, G.firstGate, G.scale || 2);
    }

    // ── 馬群 ──
    if (o.showHorses !== false) {
      var plan = o.horsePlan;
      var bodyMul = meta.bodyMul === undefined ? 0.74 : meta.bodyMul;
      /**
       * ★**コマ番号の決め方**（既定は静止画むけの固定値）。
       *   ⚠️ 既定のままだと**脚が一切動きません**（枠ごとに固定のコマ）。
       *      動かす側は `frameOf(gate, ri, i)` を渡してください。**既定は変えていません。**
       */
      var frameOf = o.frameOf || function (gate, ri, i) { return (i * 2 + ri * 3) % 6; };
      plan.rows.forEach(function (row, ri) {
        row.gates.forEach(function (gate, i) {
          /**
           * ★`groundY` は数値でも**枠ごとの配列**でもよい。
           *   ⚠️ 同じ段の馬が完全に重なると1頭に見えるので、段の中で数 px ずらせるようにします。
           *      **段の接地線（436/520/626）そのものは動かしません**（区間で変えると枠が全部壊れる）。
           */
          var gy = (row.groundY instanceof Array ? row.groundY[i] : row.groundY)
            + bow(row.scale === 2 ? 'railFront' : 'turfMain') * 0;
          S.drawHorse(ctx, pal, atlas, gate, frameOf(gate, ri, i), row.x[i], gy, row.scale, {
            shadow: true, dust: name !== 'gate', bib: true, backlight: (meta.glare || 0) > 0.3,
            air: true, effort: false, ownMark: gate === plan.own
          }, { air: row.air * (meta.airMul === undefined ? 1 : meta.airMul), own: gate === plan.own });
        });
      });
    }

    // ── 手前（全区間で共通） ──
    ['railFront', 'turfNear'].forEach(function (id) {
      var l = Object.assign({}, shared[id], { speedRatio: eff(shared[id]) });
      withBow(id, function () { S.drawLayer(ctx, l, pal, scroll, V); });
    });

    if (o.daylight && o.daylight !== 'dusk') applyDaylight(ctx, pal, o.daylight, L2.horizon.y, V);
    if (isCorner && o.sign !== false) drawCornerSign(ctx, pal, 1152, shared.turfFar.y + shared.turfFar.height, o.signText || '4 角', 1);
    if (o.cutBadge) drawCutBadge(ctx, pal, o.cutBadge, o.metersLeft);
  }

  /**
   * ★**時間帯**。パレットを3つ持たず、**乗算と色かぶりだけ**で切り替えます。
   *   ⚠️ 空と走路を同じ倍率で落とすと、ナイターが「ただ暗い昼」になります。
   *      ★照明は走路を照らすので、**空を落として走路を残す**のが要点です。
   */
  function applyDaylight(ctx, pal, mode, horizonY, V) {
    var D = (pal.$daylight || {})[mode];
    if (!D || mode === 'day') { if (!D) return; }
    var W = V.width, H = V.height;

    // ★ナイターの照明塔（地平線に立つ）。★空を落とす前に描く
    if (mode === 'night') {
      for (var t = 0; t < 5; t++) {
        var tx = 128 + t * 256;
        ctx.fillStyle = pal['stand-0'];
        ctx.fillRect(tx - 3, horizonY - 96, 6, 96);
        ctx.fillStyle = pal['gate-3'];
        ctx.fillRect(tx - 26, horizonY - 112, 52, 18);
        for (var lx = 0; lx < 4; lx++) {
          ctx.fillStyle = pal['paper-0'];
          ctx.fillRect(tx - 22 + lx * 12, horizonY - 108, 8, 10);
        }
        // 光の滲み（★水平の帯だけ）
        for (var gz = 0; gz < 14; gz++) {
          ctx.fillStyle = S.rgba(pal['paper-0'], 0.05 * (1 - gz / 14));
          ctx.fillRect(tx - 40 - gz * 3, horizonY - 112 - gz, 80 + gz * 6, 1);
        }
      }
    }

    var apply = function (y0, y1, mul) {
      var im = ctx.getImageData(0, y0, W, y1 - y0), d = im.data;
      for (var i = 0; i < d.length; i += 4) {
        d[i] = Math.min(255, d[i] * mul[0]);
        d[i + 1] = Math.min(255, d[i + 1] * mul[1]);
        d[i + 2] = Math.min(255, d[i + 2] * mul[2]);
      }
      ctx.putImageData(im, 0, y0);
    };
    apply(0, horizonY, D.skyMul);
    apply(horizonY, H, D.groundMul);
    if (D.cast) { ctx.fillStyle = S.rgba(pal[D.cast], D.castA); ctx.fillRect(0, 0, W, H); }
  }

  g.STARScene = {
    applyDaylight: applyDaylight,
    drawScene: drawScene, drawGate: drawGate, drawFanfare: drawFanfare,
    drawCutBadge: drawCutBadge, drawCornerSign: drawCornerSign,
    GROUND_LINE: GROUND_LINE
  };
})(typeof window !== 'undefined' ? window : globalThis);
