/**
 * ★静止画1枚（デザイン・ハンドオフの参照実装で描く）
 *
 * 【★なぜ参照実装をそのまま使うか】
 *   ハンドオフには `mockup/still.js`（652行）が付いており、
 *   ★**16進を持たず `palette.json` / `layers.json` から役割名で引く**作りです。
 *   こちらの方針（§12.8・アートバイブル §6）と一致しているので、**書き直しません**。
 *   ⚠️ 書き直すと、**また質を落とします**（素材を作り直して陰影と手綱を失った件と同じ）。
 *
 * 【★この画面が答えないこと】
 *   動き・カメラ・着順。**絵だけ**です。
 */
'use client';

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

const W = 1280;
const H = 720;

/** ★参照実装が公開する形（`apps/web/public/art/still-reference.js`） */
interface StarStill {
  buildAtlas: (sheet: HTMLImageElement, pal: unknown, layers: unknown) => Promise<unknown>;
  setOptions: (o: { coat: boolean; backlight: boolean }) => void;
  drawStill: (ctx: CanvasRenderingContext2D, o: Record<string, unknown>) => void;
}
declare global {
  interface Window { STARStill?: StarStill }
}

/** ★出し入れできる部品（参照実装の `parts` に渡す名前と揃えます） */
const PART_LABELS: readonly (readonly [string, string])[] = [
  ['sky', '空'], ['stand', 'スタンド'], ['hedge', '生垣'], ['fenceFar', '奥の柵'],
  ['turfFar', '奥の芝'], ['turfMain', '走路の芝'], ['railFront', '★手前のラチ'],
  ['turfNear', 'ラチ内の芝'], ['air', '霞'], ['backlight', '逆光'],
  ['shadow', '影'], ['dust', '砂煙'], ['bib', 'ゼッケン'], ['ownMark', '自馬の印'],
  ['effort', '各馬の余力'], ['order', '順位表示'], ['pace', 'ペース'],
  ['gauge', 'スタミナ'], ['gap', '前との差'], ['pole', 'ハロン棒'],
  ['finish', 'ゴール板・決勝線'], ['callout', '実況'],
];

const SCENES: readonly (readonly [string, string])[] = [
  ['straight200', '直線・残り200m'],
  ['corner4', '4角'],
  ['backstretch', '向正面'],
];

/**
 * ★**キャッシュ避け。**
 *   ⚠️ 参照実装を直したのに「変わっていない」と報告されました。
 *      ブラウザが**古い JS と JSON を使い続けます**（ハードリロードでも残ることがある）。
 *   → 読み込む URL に版を付けます。**直したら必ず反映されます。**
 */
const ASSET_VERSION = '14';

export default function StillPage(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dataRef = useRef<{ pal: unknown; layers: unknown; atlas: unknown } | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const [scene, setScene] = useState('straight200');
  const [scroll, setScroll] = useState(0);
  /**
   * ★**毛色**と**逆光**は既定で切ります。
   *   どちらも元の絵の階調を殺すので、**まず元の質で見ていただく**ためです。
   */
  const [coat, setCoat] = useState(false);
  const [backlight, setBacklight] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const boot = async (): Promise<void> => {
      // ★参照実装を読み込む（グローバルに `STARStill` が生える作り）
      if (window.STARStill === undefined) {
        await new Promise<void>((res, rej) => {
          const s = document.createElement('script');
          s.src = `/art/still-reference.js?v=${ASSET_VERSION}`;
          s.onload = () => res();
          s.onerror = () => rej(new Error('参照実装を読み込めません'));
          document.head.appendChild(s);
        });
      }
      const [pal, layers] = await Promise.all([
        fetch(`/art/palette.json?v=${ASSET_VERSION}`).then((r) => r.json()),
        fetch(`/art/layers.json?v=${ASSET_VERSION}`).then((r) => r.json()),
      ]);
      const sheet = await new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('スプライトを読み込めません'));
        im.src = `/art/horse-gallop.png?v=${ASSET_VERSION}`;
      });
      const api = window.STARStill;
      if (api === undefined) throw new Error('STARStill がありません');
      api.setOptions({ coat, backlight });
      const atlas = await api.buildAtlas(sheet, pal, layers);
      if (cancelled) return;
      dataRef.current = { pal, layers, atlas };
      setReady(true);
    };
    boot().catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
    return () => { cancelled = true; };
  }, [coat, backlight]);

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    const d = dataRef.current;
    const api = window.STARStill;
    if (cv === null || d === null || api === undefined) return;
    const ctx = cv.getContext('2d');
    if (ctx === null) return;
    const parts: Record<string, boolean> = {};
    for (const [k] of PART_LABELS) parts[k] = !off.has(k);
    api.drawStill(ctx, {
      palette: d.pal, layers: d.layers, atlas: d.atlas, parts, scene, scroll,
    });
  }, [off, scene, scroll]);

  useEffect(() => { draw(); }, [draw, ready]);

  const toggle = (k: string): void => setOff((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  return (
    <main style={{ background: '#14120f', color: '#efe9dc', padding: 14, fontFamily: 'system-ui, sans-serif', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18, margin: '4px 0 8px' }}>
        静止画1枚（デザイン・ハンドオフ）
        <span style={{ opacity: 0.6, fontSize: 13, marginLeft: 12 }}>
          ★動きません。色と層は palette.json / layers.json から引いています
        </span>
      </h1>
      {err !== null && <p style={{ color: '#e06a4a', fontWeight: 'bold' }}>★{err}</p>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
        {PART_LABELS.map(([k, label]) => (
          <button
            key={k} type="button" onClick={() => toggle(k)}
            style={{
              padding: '5px 10px', cursor: 'pointer', border: 0, fontSize: 12,
              background: off.has(k) ? '#3a3630' : '#3a6a40',
              color: off.has(k) ? 'rgba(239,233,220,0.5)' : '#fff',
            }}
          >
            {off.has(k) ? '　' : '✓ '}{label}
          </button>
        ))}
        <button
          type="button" onClick={() => setOff(new Set())}
          style={{ padding: '5px 10px', cursor: 'pointer', border: 0, fontSize: 12, background: '#4a453d', color: '#efe9dc' }}
        >
          全部つける
        </button>
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '6px 0 10px', fontSize: 13 }}>
        <label>
          場面{' '}
          <select value={scene} onChange={(e) => setScene(e.target.value)}>
            {SCENES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label title="馬体の色を毛色に置き換える。元の絵の階調が減ります">
          <input type="checkbox" checked={coat} onChange={(e) => setCoat(e.target.checked)} />{' '}毛色
        </label>
        <label title="馬体を暗く落として縁を光らせる。元の絵の階調が減ります">
          <input type="checkbox" checked={backlight} onChange={(e) => setBacklight(e.target.checked)} />{' '}逆光
        </label>
        <label>
          背景の流れ{' '}
          <input type="range" min={0} max={400} step={4} value={scroll} onChange={(e) => setScroll(Number(e.target.value))} />
          {' '}{scroll}
        </label>
      </div>

      <canvas
        ref={canvasRef} width={W} height={H}
        style={{ width: '100%', maxWidth: W, border: '1px solid #4a453d', imageRendering: 'pixelated', background: '#111' }}
      />

      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 10, lineHeight: 1.9 }}>
        ★<b>「馬の大きさ」スライダは撤去しました。</b>非整数倍の縮小は<b>D-058 違反</b>で、
        こちらの実装がそれをやっていました（デザイナーの指摘）。倍率は <b>1× と 2× の2択</b>だけです。<br />
        ★<b>「背景の流れ」</b>を動かすと、層ごとの速度差が確かめられます（手前のラチが 1.00、ラチ内の芝が 1.30）。
      </p>
    </main>
  );
}
