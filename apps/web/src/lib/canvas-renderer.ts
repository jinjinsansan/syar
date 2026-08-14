/**
 * ★Canvas レンダラ（正典 §12.8）
 *
 * > 描画ロジックを「位置データ → 描画コマンド」の純粋関数として切り出す。
 * > **レンダラだけを** Web（Canvas 2D）と将来のモバイルで差し替えられるようにする。
 *
 * 【★この層がしないこと】
 *   位置を決めません。局面を決めません。カメラを決めません。
 *   ★**渡された `DrawCommand[]` を描くだけ**です。
 *   ⚠️ ここに「残り800mなら…」のような判断を書いた瞬間、§12.8 は崩れます。
 *      **判断は `packages/render` にあります。**
 */

import type { DrawCommand, Frame } from '@star/render';

/** 焼き出したスプライト（`tools/bake-sprites.mjs`） */
export interface SpriteAtlas {
  /** 馬番 → 6コマ横並びの帯（1コマ 220×140） */
  readonly stripOf: (gate: number) => HTMLImageElement | undefined;
  readonly postColors: readonly (readonly [number, number, number])[];
}

const SPRITE_W = 220;
const SPRITE_H = 140;

/** アートバイブル §4 の役割色（★16進をここで発明しない — 役割から引く） */
const PALETTE: Record<string, string> = {
  sky: '#8fb8cf',
  stand: '#6b6f74',
  hedge: '#2f4a2b',
  fence: '#3b3f36',
  rail: '#c8c6bd',
  turf: '#4b7a41',
  dirt: '#8a6b4a',
  paper: '#efe9dc',
  ink: '#22201c',
};

const roleColor = (role: string): string => PALETTE[role] ?? '#888888';

/** 繰り返し模様は1回だけ作って使い回す（毎フレーム作ると落ちます） */
const tileCache = new Map<string, CanvasPattern | null>();

function tileFor(
  ctx: CanvasRenderingContext2D, role: string, tileWidth: number, height: number,
): CanvasPattern | null {
  const key = `${role}-${tileWidth}-${height}`;
  const hit = tileCache.get(key);
  if (hit !== undefined) return hit;

  const c = document.createElement('canvas');
  c.width = tileWidth;
  c.height = Math.max(1, height);
  const t = c.getContext('2d');
  if (t === null) return null;
  const base = roleColor(role);
  t.fillStyle = base;
  t.fillRect(0, 0, c.width, c.height);

  /**
   * ★**縦の要素は最小限**（アートバイブル §3「水平の帯で構成する」）。
   *   奥行きは**速度差だけ**で作るので、ここで線遠近を描き込みません。
   */
  t.globalAlpha = 0.18;
  if (role === 'sky') {
    /**
     * ★**横に流れる薄い雲**。
     *   ⚠️ 以前は `(x*7 + y*13) % 97` で置いていました。これは**斜めの縞**になり、
     *      空に格子が走って見えました（実際に見えました）。
     *   ★アートバイブル §3「水平の帯で構成する」。**縦・斜めの要素を入れません。**
     */
    t.fillStyle = '#ffffff';
    const bands: readonly (readonly [number, number])[] = [[0.30, 0.34], [0.42, 0.45], [0.55, 0.57]];
    for (const [a, b] of bands) {
      const y0 = Math.floor(c.height * a), y1 = Math.floor(c.height * b);
      for (let y = y0; y < y1; y += 1) {
        const fade = 1 - Math.abs((y - (y0 + y1) / 2) / Math.max(1, (y1 - y0) / 2));
        t.globalAlpha = 0.10 * fade;
        t.fillRect(0, y, c.width, 1);
      }
    }
    t.globalAlpha = 0.18;
  } else if (role === 'stand') {
    for (let y = 2; y < c.height - 2; y += 3) {
      for (let x = 1; x < c.width; x += 4) {
        t.fillStyle = ((x + y) % 7 < 3) ? '#ffffff' : '#000000';
        t.fillRect(x, y, 1, 1);
      }
    }
  } else if (role === 'hedge') {
    // ★生垣の粒（縦の要素にしない・アートバイブル §3）
    for (let y = 0; y < c.height; y += 2) {
      for (let x = 0; x < c.width; x += 3) {
        t.fillStyle = ((x * 5 + y * 3) % 11 < 5) ? '#ffffff' : '#000000';
        t.globalAlpha = 0.12;
        t.fillRect(x, y, 2, 2);
      }
    }
    t.globalAlpha = 0.18;
  } else if (role === 'fence') {
    // ★柵の支柱
    t.fillStyle = '#000000';
    t.globalAlpha = 0.45;
    t.fillRect(0, 0, 2, c.height);
    t.globalAlpha = 0.2;
    t.fillRect(0, Math.floor(c.height / 2), c.width, 1);
    t.globalAlpha = 0.18;
  } else if (role === 'rail') {
    // ★縦の要素はここだけ（支柱）
    t.fillStyle = '#000000';
    t.globalAlpha = 0.35;
    t.fillRect(0, 0, 3, c.height);
  } else if (role === 'turf') {
    // 芝の刈り目（横縞）
    t.fillStyle = '#000000';
    t.globalAlpha = 0.08;
    for (let y = 0; y < c.height; y += 1) {
      if (Math.floor(y / 26) % 2 === 1) t.fillRect(0, y, c.width, 1);
    }
  }
  t.globalAlpha = 1;

  const pat = ctx.createPattern(c, 'repeat');
  tileCache.set(key, pat);
  return pat;
}

/** ★重ね表示は「紙」（アートバイブル §3）。ゲージだけが唯一の「機械」の表現 */
function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(28,26,22,0.72)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(239,233,220,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

const PACE_LABEL: Record<string, string> = { slow: 'スロー', middle: 'ミドル', high: 'ハイ' };
const STRATEGY_LABEL: Record<string, string> = {
  nige: '逃', senko: '先', sashi: '差', oikomi: '追',
};

/**
 * 1フレームを描く。
 *
 * ★**コマンドの順に描きます。** 並べ替えません
 *   （順序は `packages/render` が馬番で固定しています＝C-5）。
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  atlas: SpriteAtlas,
  viewport: { width: number; height: number },
): void {
  ctx.imageSmoothingEnabled = false;   // ★ピクセルアートを滲ませない（D-058）
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  for (const c of frame.commands) {
    switch (c.kind) {
      case 'band': {
        ctx.fillStyle = roleColor(c.role);
        ctx.fillRect(0, c.y, viewport.width, c.height);
        break;
      }
      case 'parallax': {
        const pat = tileFor(ctx, c.role, c.tileWidth, c.height);
        if (pat === null) break;
        ctx.save();
        // ★`offset` は「左へずれた画素数」。剰余はここで取る（コマンドは 0 以上を保証）
        ctx.translate(-(c.offset % c.tileWidth), c.y);
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, viewport.width + c.tileWidth, c.height);
        ctx.restore();
        break;
      }
      case 'sprite': {
        const gate = Number(String(c.silk ?? 'silk-1').replace('silk-', ''));
        const img = atlas.stripOf(gate);
        if (img === undefined) break;
        const w = SPRITE_W * c.scale;
        const h = SPRITE_H * c.scale;
        ctx.drawImage(img, c.sprite.frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, c.at.x, c.at.y, w, h);

        // ★脚質（V-16 ①）。位置の意味は、脚質が見えて初めて読めます
        if (c.strategy !== undefined) {
          const label = STRATEGY_LABEL[c.strategy] ?? '';
          ctx.font = `bold ${11 * c.scale}px sans-serif`;
          ctx.textAlign = 'center';
          const tx = c.at.x + w * 0.5;
          const ty = c.at.y + h - 4 * c.scale;
          ctx.fillStyle = 'rgba(20,18,16,0.7)';
          ctx.fillRect(tx - 9 * c.scale, ty - 11 * c.scale, 18 * c.scale, 14 * c.scale);
          ctx.fillStyle = '#efe9dc';
          ctx.fillText(label, tx, ty);
        }
        break;
      }
      case 'shadow': {
        // ★楕円の影。接地点に置き、宙に浮く局面では薄く小さくなります
        ctx.save();
        // ★薄く平たく。濃い楕円は「置き物」に見えます
        ctx.globalAlpha = c.strength * 0.4;
        ctx.fillStyle = '#243a1e';
        ctx.beginPath();
        ctx.ellipse(c.at.x, c.at.y, c.width / 2, Math.max(2, c.width / 10), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'effort': {
        // ★各馬の余力。⚠️ いまここに入っている値は「余力」ではありません（Q-P4-21）
        const w = 34 * c.scale;
        const h = 4 * c.scale;
        ctx.fillStyle = 'rgba(20,18,16,0.6)';
        ctx.fillRect(c.at.x + (SPRITE_W * c.scale - w) / 2, c.at.y, w, h);
        ctx.fillStyle = c.ratio < 0.3 ? '#d05a3a' : '#d8c96a';
        ctx.fillRect(c.at.x + (SPRITE_W * c.scale - w) / 2, c.at.y, w * c.ratio, h);
        break;
      }
      case 'gauge': {
        drawPanel(ctx, c.at.x - 6, c.at.y - 18, c.width + 12, 26);
        ctx.fillStyle = '#3a3630';
        ctx.fillRect(c.at.x, c.at.y - 12, c.width, 12);
        // ★ゲージだけが唯一の「機械」の表現（アートバイブル §3）
        ctx.fillStyle = c.ratio < 0.25 ? '#d05a3a' : '#7fc06a';
        ctx.fillRect(c.at.x, c.at.y - 12, c.width * c.ratio, 12);
        break;
      }
      case 'cue': {
        drawPanel(ctx, c.at.x - 6, c.at.y - 16, 150, 24);
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = c.active ? '#f2c14e' : 'rgba(239,233,220,0.35)';
        const t = c.phase === 'straight' ? '直線' : c.phase === 'spurt' ? '勝負所' : '道中';
        // ★出ていない間も描きます（「まだ来ていない」と「見落とした」を分ける）
        ctx.fillText(c.active ? `▶ ${t}` : `　 ${t}`, c.at.x, c.at.y);
        break;
      }
      case 'gap': {
        drawPanel(ctx, c.at.x - 6, c.at.y - 16, 260, 24);
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#efe9dc';
        /**
         * ★**順位の数字は出しません**（裁定 Q-P4-14 ①）。
         *   > 実況は「位置」ではなく「変化」を言う
         */
        const closing = c.closingMps >= 0.05 ? `▲${c.closingMps.toFixed(1)}m/s`
          : c.closingMps <= -0.05 ? `▼${Math.abs(c.closingMps).toFixed(1)}m/s` : '±0';
        const head = c.meters <= 0.01 ? '先頭' : `前まで ${c.meters.toFixed(1)}m`;
        const need = c.toGo === 0 ? '圏内' : `あと ${c.toGo} 頭`;
        ctx.fillText(`${head}　${closing}　${need}`, c.at.x, c.at.y);
        break;
      }
      case 'pace': {
        drawPanel(ctx, c.at.x - 6, c.at.y - 16, 150, 24);
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = c.pace === 'high' ? '#e0704a' : c.pace === 'slow' ? '#6aa7d8' : '#efe9dc';
        ctx.fillText(`ペース ${PACE_LABEL[c.pace] ?? c.pace}`, c.at.x, c.at.y);
        break;
      }
      case 'pole': {
        /**
         * ★ハロン棒（残り距離の標識）。**走路の座標系**なので馬と同じ速さで流れます。
         *   これが横切ることで「どれだけ進んだか」が体感できます。
         */
        const h = 44 * c.scale;
        const x = c.at.x;
        const y = c.at.y - h;
        ctx.fillStyle = '#e8e4d8';
        ctx.fillRect(x, y, 3 * c.scale, h);
        ctx.fillStyle = '#22201c';
        for (let i = 0; i < 3; i += 1) ctx.fillRect(x, y + (i * 2 + 1) * 6 * c.scale, 3 * c.scale, 5 * c.scale);
        // ★残り距離の板
        const label = `${c.metersLeft}`;
        ctx.font = `bold ${11 * c.scale}px sans-serif`;
        ctx.textAlign = 'center';
        const bw = 30 * c.scale;
        ctx.fillStyle = '#efe9dc';
        ctx.fillRect(x + 2 * c.scale - bw / 2, y - 16 * c.scale, bw, 14 * c.scale);
        ctx.fillStyle = '#22201c';
        ctx.fillText(label, x + 2 * c.scale, y - 5 * c.scale);
        break;
      }
      case 'finishLine': {
        // ★決勝線。白黒の市松（どこで終わるかが一目で分かる）
        const w = 6 * c.scale;
        for (let i = 0; i * 8 * c.scale < c.height; i += 1) {
          ctx.fillStyle = i % 2 === 0 ? '#efe9dc' : '#22201c';
          ctx.fillRect(c.at.x, c.at.y + i * 8 * c.scale, w, 8 * c.scale);
        }
        // ★ゴール板
        ctx.fillStyle = '#efe9dc';
        ctx.fillRect(c.at.x - 14 * c.scale, c.at.y - 26 * c.scale, 34 * c.scale, 18 * c.scale);
        ctx.fillStyle = '#22201c';
        ctx.font = `bold ${11 * c.scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('GOAL', c.at.x + 3 * c.scale, c.at.y - 13 * c.scale);
        break;
      }
      case 'callout': {
        /**
         * ★実況。**順位の数字は出しません**（裁定 Q-P4-14 ①）。
         *   「3番手」ではなく「上がってきた」。
         */
        const e = c.event;
        const text = e.kind === 'start' ? 'スタートしました'
          : e.kind === 'leadTaken' ? `${e.gate}番が先頭に立ちました`
          : e.kind === 'closing' ? `${e.gate}番が外から迫ります`
          : e.kind === 'fading' ? `${e.gate}番、脚色が鈍りました`
          : e.kind === 'straight' ? '直線に入りました'
          : `${e.gate}番、ゴールイン`;
        const w = Math.min(viewport.width * 0.62, 26 + text.length * 17);
        drawPanel(ctx, c.at.x - 8, c.at.y - 24, w, 34);
        ctx.font = 'bold 17px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#efe9dc';
        ctx.fillText(text, c.at.x + 2, c.at.y);
        break;
      }
      case 'result': {
        // ★着順。⚠️ 並べ替えません（エンジンが決めたものを描くだけ）
        const rowH = 26;
        const w = 340;
        drawPanel(ctx, c.at.x, c.at.y, w, 18 + c.entries.length * rowH);
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#f2c14e';
        ctx.fillText('着 順', c.at.x + 14, c.at.y + 4 + rowH * 0.6);
        for (let i = 0; i < c.entries.length; i += 1) {
          const e = c.entries[i]!;
          const y = c.at.y + 18 + (i + 0.7) * rowH;
          ctx.fillStyle = '#efe9dc';
          ctx.font = 'bold 16px sans-serif';
          ctx.fillText(`${e.place}`, c.at.x + 16, y);
          // ★枠順の色
          const g = Number(String(e.silk).replace('silk-', ''));
          const col = atlas.postColors[g - 1] ?? [200, 200, 200];
          ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
          ctx.fillRect(c.at.x + 46, y - 14, 22, 19);
          ctx.fillStyle = (col[0] * 299 + col[1] * 587 + col[2] * 114) / 1000 < 140 ? '#f5f5f5' : '#111';
          ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${e.gate}`, c.at.x + 57, y);
          ctx.textAlign = 'left';
          ctx.fillStyle = 'rgba(239,233,220,0.75)';
          ctx.font = '14px sans-serif';
          ctx.fillText(e.margin, c.at.x + 84, y);
        }
        break;
      }
      case 'text': {
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = roleColor(c.role);
        ctx.fillText(c.text, c.at.x, c.at.y);
        break;
      }
      default: {
        // ★新しいコマンドを足したのに描いていない、を静かに見逃さない
        const never: never = c;
        throw new Error(`描き方の無い描画コマンド: ${JSON.stringify(never)}`);
      }
    }
  }
}

/** 焼き出した帯を読み込む */
export async function loadAtlas(gates: number): Promise<SpriteAtlas> {
  const imgs = new Map<number, HTMLImageElement>();
  await Promise.all(Array.from({ length: gates }, (_, i) => i + 1).map((g) => new Promise<void>((res) => {
    const im = new Image();
    im.onload = () => { imgs.set(g, im); res(); };
    im.onerror = () => res();   // ★1頭欠けても全体を止めない
    im.src = `/sprites/horse-${g}.png`;
  })));
  const post = await fetch('/sprites/post-colors.json').then((r) => r.json()) as
    (readonly [number, number, number])[];
  return { stripOf: (g) => imgs.get(g), postColors: post };
}

/** DrawCommand の型を落とさないためのヘルパ（未使用の警告避けではありません） */
export type { DrawCommand };

/**
 * ★**順位表示**（画面上部の丸に馬番）
 *
 * 【なぜ要るか】
 *   ⚠️ 馬群が団子で走るので、**画面だけでは順位が読めません**。
 *   ★実際の中継にも、80〜90年代の競馬ゲームにも、**同じものがあります**。
 *     これは「業界共通の作法」なので採ってよい（D-060）。
 *
 * 【★守ること】
 *   ・**枠順の色＋馬番**（色だけに頼らない＝色覚多様性・アートバイブル §4）
 *   ・**先頭が左**。順位が変わったら並びが入れ替わる
 *   ・⚠️ ここで**並べ替えません**。渡された順に描きます（順位を決めるのは上位）
 */
export function drawRunningOrder(
  ctx: CanvasRenderingContext2D,
  order: readonly number[],
  postColors: readonly (readonly [number, number, number])[],
  opts: { readonly x: number; readonly y: number; readonly size?: number; readonly gap?: number },
): void {
  const r = (opts.size ?? 26) / 2;
  const gap = opts.gap ?? 8;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < order.length; i += 1) {
    const gate = order[i]!;
    const col = postColors[gate - 1] ?? [200, 200, 200];
    const cx = opts.x + r + i * (r * 2 + gap);
    const cy = opts.y + r;
    // ★先頭だけ枠を強調（「いま誰が前か」が一目で分かる）
    if (i === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
      ctx.fillStyle = '#f2c14e';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(20,20,18,0.6)';
    ctx.stroke();
    // ★色だけに頼らない。番号を必ず載せる
    ctx.fillStyle = (col[0] * 299 + col[1] * 587 + col[2] * 114) / 1000 < 140 ? '#f5f5f5' : '#141414';
    ctx.font = `bold ${Math.round(r * 1.15)}px sans-serif`;
    ctx.fillText(String(gate), cx, cy + 1);
  }
  ctx.restore();
}
