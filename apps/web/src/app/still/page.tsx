/**
 * ★静止画1枚（見た目を決めるための画面）
 *
 * 【なぜ作るか】
 *   ⚠️ ここまで「作って見せて駄目出し」の往復を1日で15回以上しています。
 *   ★**動かす前に「この絵でいいか」を決める**ほうが、往復が減ります。
 *   → **1枚だけ**を大きく出し、**部品ごとに出し入れできる**ようにします。
 *
 * 【★この画面が答えないこと】
 *   動き・カメラ・着順。**絵だけ**です。
 */
'use client';

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadAtlas, type SpriteAtlas } from '../../lib/canvas-renderer';

const W = 1280;
const H = 720;
const SPRITE_W = 220;
const SPRITE_H = 140;

/** ★出し入れできる部品 */
interface Parts {
  sky: boolean;
  stand: boolean;
  hedge: boolean;
  fence: boolean;
  turfStripes: boolean;
  frontRail: boolean;
  shadow: boolean;
  dust: boolean;
  callout: boolean;
  finish: boolean;
}
const ALL_ON: Parts = {
  sky: true, stand: true, hedge: true, fence: true, turfStripes: true,
  frontRail: true, shadow: true, dust: true, callout: true, finish: true,
};

const LABELS: Record<keyof Parts, string> = {
  sky: '空', stand: 'スタンド', hedge: '生垣', fence: '奥の柵',
  turfStripes: '芝の刈り目', frontRail: '★手前の白柵', shadow: '影',
  dust: '砂煙', callout: '実況の帯', finish: 'ゴール板・決勝線',
};

export default function StillPage(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const atlasRef = useRef<SpriteAtlas | null>(null);
  const [ready, setReady] = useState(false);
  const [parts, setParts] = useState<Parts>(ALL_ON);
  /** ★馬の大きさ（画面に対する比率の目安） */
  const [horseScale, setHorseScale] = useState(1.55);
  /** ★馬群の詰まり具合（小さいほど重なる） */
  const [packTight, setPackTight] = useState(0.62);
  const [horizon, setHorizon] = useState(0.30);

  useEffect(() => {
    loadAtlas(18).then((a) => { atlasRef.current = a; setReady(true); }).catch(() => setReady(false));
  }, []);

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    const atlas = atlasRef.current;
    if (cv === null || atlas === null) return;
    const ctx = cv.getContext('2d');
    if (ctx === null) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);

    const hy = Math.round(H * horizon);

    // ── 空 ──
    ctx.fillStyle = parts.sky ? '#93bad0' : '#3a3630';
    ctx.fillRect(0, 0, W, hy);
    if (parts.sky) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      for (const [a, b] of [[0.35, 0.42], [0.55, 0.60]] as const) {
        ctx.fillRect(0, Math.round(hy * a), W, Math.round(hy * (b - a)));
      }
    }

    // ── スタンド（★観客の粒） ──
    if (parts.stand) {
      const sTop = hy;
      const sH = Math.round(H * 0.085);
      ctx.fillStyle = '#5b6068';
      ctx.fillRect(0, sTop, W, sH);
      for (let y = sTop + 3; y < sTop + sH - 2; y += 4) {
        for (let x = 2; x < W; x += 5) {
          ctx.fillStyle = ((x * 3 + y * 7) % 11 < 5) ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)';
          ctx.fillRect(x, y, 2, 2);
        }
      }
      // 屋根の影
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(0, sTop, W, 5);
    }

    // ── 生垣（★2段。濃淡で奥行き） ──
    if (parts.hedge) {
      const y0 = hy + (parts.stand ? Math.round(H * 0.085) : 0);
      for (const [dy, hh, col] of [[0, 0.055, '#24401f'], [0.055, 0.05, '#2f5228']] as const) {
        const top = y0 + Math.round(H * dy);
        const height = Math.round(H * hh);
        ctx.fillStyle = col;
        ctx.fillRect(0, top, W, height);
        for (let y = top + 2; y < top + height - 1; y += 3) {
          for (let x = 1; x < W; x += 4) {
            ctx.fillStyle = ((x * 5 + y * 3) % 13 < 6) ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.14)';
            ctx.fillRect(x, y, 3, 2);
          }
        }
      }
    }

    // ── 奥の柵 ──
    const trackTop = hy + Math.round(H * (parts.stand ? 0.085 : 0)) + Math.round(H * (parts.hedge ? 0.105 : 0));
    if (parts.fence) {
      ctx.fillStyle = '#2b2f28';
      ctx.fillRect(0, trackTop - 10, W, 10);
      ctx.fillStyle = 'rgba(240,240,235,0.55)';
      for (let x = 0; x < W; x += 44) ctx.fillRect(x, trackTop - 10, 3, 10);
    }

    // ── 芝 ──
    ctx.fillStyle = '#4c7d41';
    ctx.fillRect(0, trackTop, W, H - trackTop);
    if (parts.turfStripes) {
      // ★刈り目（横帯）。手前ほど広い＝奥行きの手掛かり
      let y = trackTop;
      let band = 14;
      let dark = false;
      while (y < H) {
        ctx.fillStyle = dark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.05)';
        ctx.fillRect(0, y, W, band);
        y += band;
        band = Math.round(band * 1.16);
        dark = !dark;
      }
    }

    // ── 決勝線・ゴール板 ──
    if (parts.finish) {
      const gx = Math.round(W * 0.80);
      for (let i = 0; i * 22 < H - trackTop; i += 1) {
        ctx.fillStyle = i % 2 === 0 ? '#f2efe4' : '#22201c';
        ctx.fillRect(gx, trackTop + i * 22, 7, 22);
      }
      ctx.fillStyle = '#f2efe4';
      ctx.fillRect(gx - 30, trackTop - 46, 70, 34);
      ctx.fillStyle = '#22201c';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GOAL', gx + 5, trackTop - 22);
      ctx.textAlign = 'left';
    }

    /**
     * ★**馬群**。
     *   参照とする中継の画作りでは、**馬が画面のかなりを占め、重なり合って**います。
     *   ⚠️ 小さく散らばらせると「おもちゃ」に見えます。
     */
    const rows = [0.30, 0.50, 0.70, 0.90];
    const placed: { gate: number; x: number; y: number; k: number }[] = [];
    let gate = 1;
    for (let r = 0; r < rows.length; r += 1) {
      const n = r === 0 ? 3 : r === 1 ? 3 : r === 2 ? 3 : 3;
      for (let i = 0; i < n; i += 1) {
        // ★奥ほど小さく、上に
        const depth = rows[r]!;
        const k = horseScale * (0.62 + depth * 0.55);
        const y = trackTop + (H - trackTop) * (0.10 + depth * 0.62);
        const x = W * (0.10 + i * 0.30 * packTight + r * 0.085) - (r % 2) * 40;
        placed.push({ gate, x, y, k });
        gate = gate >= 12 ? 1 : gate + 1;
      }
    }
    placed.sort((a, b) => a.y - b.y);
    for (const p of placed) {
      const img = atlas.stripOf(p.gate);
      if (img === undefined) continue;
      const w = SPRITE_W * p.k;
      const h = SPRITE_H * p.k;
      if (parts.shadow) {
        /**
         * ★影は**小さく薄く**。
         * ⚠️ 半径 w×0.16（≒54px）にしていたら、**巨大な楕円が並んで泡のよう**になりました。
         *    馬体の接地はもっと狭いので、**w×0.07・高さはその 1/4** にします。
         */
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#22381c';
        ctx.beginPath();
        ctx.ellipse(p.x - w * 0.02, p.y - 2, w * 0.07, w * 0.018, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (parts.dust) {
        /**
         * ★砂煙（アートバイブル §2）。
         * ⚠️ 丸を並べたら**白い泡**になりました。
         *    実際は**地面すれすれに横へ流れる薄い帯**なので、平たくします。
         */
        ctx.fillStyle = '#c9d2b4';
        for (let i = 0; i < 3; i += 1) {
          ctx.globalAlpha = 0.10 - i * 0.028;
          ctx.beginPath();
          ctx.ellipse(p.x - w * (0.16 + i * 0.07), p.y - 2, w * (0.055 - i * 0.012), w * 0.012, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      const frame = (p.gate * 2) % 6;
      ctx.drawImage(img, frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, p.x - w / 2, p.y - h * 0.92, w, h);
    }

    /**
     * ★**手前の白柵**（内ラチ）。**馬より前に描く**。
     *   ⚠️ これが無いと、馬が芝の上に貼った絵に見えます。
     *   参照画像でも、手前を白い柵が横切っています。
     */
    if (parts.frontRail) {
      /**
       * ★手前の白柵。**横棒2本＋細い支柱**。
       * ⚠️ 支柱を 11px 幅・132px おきにしたら、**白い箱が並んでいるだけ**に見えました。
       *    実際のラチは**横棒が主役で、支柱は細い**です。
       */
      const ry = Math.round(H * 0.845);
      for (let x = -30; x < W; x += 168) {
        ctx.fillStyle = '#d9d6c9';
        ctx.fillRect(x, ry, 5, 54);
        ctx.fillStyle = 'rgba(0,0,0,0.20)';
        ctx.fillRect(x + 4, ry, 2, 54);
      }
      for (const [dy, hh] of [[0, 8], [26, 6]] as const) {
        ctx.fillStyle = '#efece0';
        ctx.fillRect(0, ry + dy, W, hh);
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.fillRect(0, ry + dy + hh, W, 2);
      }
    }

    // ── 実況の帯 ──
    if (parts.callout) {
      const by = Math.round(H * 0.90);
      ctx.fillStyle = '#efe9dc';
      ctx.fillRect(0, by, W, H - by);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, by, W, 3);
      ctx.fillStyle = '#22201c';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('さあ直線　7番が内から抜け出した', 34, by + 48);
    }
  }, [parts, horseScale, packTight, horizon]);

  useEffect(() => { draw(); }, [draw, ready]);

  const toggle = (k: keyof Parts): void => setParts((p) => ({ ...p, [k]: !p[k] }));

  return (
    <main style={{ background: '#1a1815', color: '#efe9dc', padding: 14, fontFamily: 'system-ui, sans-serif', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18, margin: '4px 0 8px' }}>
        静止画1枚（見た目を決める）
        <span style={{ opacity: 0.6, fontSize: 13, marginLeft: 12 }}>
          ★動きません。**絵だけ**を見ていただく画面です
        </span>
      </h1>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
        {(Object.keys(LABELS) as (keyof Parts)[]).map((k) => (
          <button
            key={k} type="button" onClick={() => toggle(k)}
            style={{
              padding: '6px 12px', cursor: 'pointer', border: 0, fontSize: 13,
              background: parts[k] ? '#3a6a40' : '#3a3630',
              color: parts[k] ? '#fff' : 'rgba(239,233,220,0.5)',
            }}
          >
            {parts[k] ? '✓ ' : '　'}{LABELS[k]}
          </button>
        ))}
        <button type="button" onClick={() => setParts(ALL_ON)} style={{ padding: '6px 12px', cursor: 'pointer', border: 0, fontSize: 13, background: '#4a453d', color: '#efe9dc' }}>全部つける</button>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', margin: '6px 0 10px', fontSize: 13 }}>
        <label>馬の大きさ <input type="range" min={0.8} max={2.4} step={0.05} value={horseScale} onChange={(e) => setHorseScale(Number(e.target.value))} /> {horseScale.toFixed(2)}</label>
        <label>馬群の詰まり <input type="range" min={0.3} max={1.2} step={0.02} value={packTight} onChange={(e) => setPackTight(Number(e.target.value))} /> {packTight.toFixed(2)}</label>
        <label>地平線の高さ <input type="range" min={0.15} max={0.45} step={0.01} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} /> {horizon.toFixed(2)}</label>
      </div>

      <canvas
        ref={canvasRef} width={W} height={H}
        style={{ width: '100%', maxWidth: W, border: '1px solid #4a453d', imageRendering: 'pixelated', background: '#111' }}
      />

      <p style={{ fontSize: 13, opacity: 0.7, marginTop: 12, lineHeight: 1.9 }}>
        ★<b>ボタンで部品を消して</b>、どれが効いているか／どれが邪魔かを教えてください。<br />
        ★<b>スライダで大きさと詰まり具合</b>を変えられます。「この値がいい」と言っていただければ、そのまま実装します。<br />
        ⚠️ これは<b>絵だけ</b>の画面です。動き・カメラ・着順は含みません。
      </p>
    </main>
  );
}
