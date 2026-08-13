/**
 * ★俯瞰デバッグビュー（PR1）— **ここで競馬に見えなければ、描画を足しても競馬にならない**
 *
 * 【この画面が答えること】
 *   ① コースが正しい楕円になっているか
 *   ② ★**外を回った馬が遅れるか**（コーナーの距離ロス）
 *
 * 【★この画面が答えないこと】
 *   絵の良し悪し。**幾何だけ**を見ます。
 *
 * 【★着順に触れていません】
 *   ここは `packages/render/src/course.ts`（純粋関数）を叩くだけで、
 *   エンジンにも位置モデルにも触れていません。
 */
'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  ovalCourse, posOf, segmentStarts, laneExtraMeters, HORSE_LENGTH_M,
} from '@star/render';

const VIEW = { width: 1100, height: 620 };
/** ★横位置（内ラチからの距離 m）。0 = 内ラチ, 20 = 外 */
const LANES = [2, 5, 8, 11, 14, 17];
const COLORS = ['#e04a3a', '#f0f0f0', '#2a58c8', '#f2c14e', '#3aa05a', '#9a5ad0'];

export default function CoursePage(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [distance, setDistance] = useState(1600);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const tRef = useRef(0);

  const course = ovalCourse(distance);

  useEffect(() => { tRef.current = t; }, [t]);

  useEffect(() => {
    if (!playing) return;
    const loop = (): void => {
      tRef.current = (tRef.current + 1 / 60) % 120;
      setT(tRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [playing]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (cv === null) return;
    const ctx = cv.getContext('2d');
    if (ctx === null) return;

    // ★コース全体が画面に入る倍率を求める（発明しない — 実際の座標から）
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let s = 0; s <= distance; s += 5) {
      for (const w of [0, course.widthM]) {
        const p = posOf(course, s, w);
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
    }
    const pad = 40;
    const k = Math.min((VIEW.width - pad * 2) / Math.max(1, maxX - minX),
      (VIEW.height - pad * 2) / Math.max(1, maxY - minY));
    const sx = (x: number): number => pad + (x - minX) * k;
    const sy = (y: number): number => pad + (y - minY) * k;

    ctx.fillStyle = '#221f1b';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    // ★走路（内ラチ・外ラチ）
    for (const [w, col] of [[0, '#c8c6bd'], [course.widthM, '#7a8a72']] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let s = 0; s <= distance; s += 4) {
        const p = posOf(course, s, w);
        if (s === 0) ctx.moveTo(sx(p.x), sy(p.y)); else ctx.lineTo(sx(p.x), sy(p.y));
      }
      ctx.stroke();
    }

    // ★区間の境目（1角/2角/…）
    ctx.font = '12px sans-serif';
    for (const seg of segmentStarts(course)) {
      const a = posOf(course, seg.s, 0);
      const b = posOf(course, seg.s, course.widthM);
      ctx.strokeStyle = 'rgba(239,233,220,0.35)';
      ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.y)); ctx.lineTo(sx(b.x), sy(b.y)); ctx.stroke();
      ctx.fillStyle = '#f2c14e';
      ctx.fillText(seg.label, sx(b.x) + 4, sy(b.y));
    }
    // ★ゴール
    {
      const a = posOf(course, distance, 0);
      const b = posOf(course, distance, course.widthM);
      ctx.strokeStyle = '#efe9dc'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.y)); ctx.lineTo(sx(b.x), sy(b.y)); ctx.stroke();
      ctx.fillStyle = '#efe9dc';
      ctx.fillText('ゴール', sx(b.x) + 4, sy(b.y) + 14);
    }

    /**
     * ★**全馬が同じ速さで走ります。**
     *   違うのは**通る場所（w）だけ**。
     *   ⚠️ それでも外の馬が遅れるなら、**距離ロスが効いている**ということです。
     *   ★ここで遅れなければ、この層は嘘です。
     */
    const SPEED = 16;                        // m/s（中心線基準）
    const elapsed = tRef.current;
    for (let i = 0; i < LANES.length; i += 1) {
      const w = LANES[i]!;
      // ★実走距離が SPEED×t になるように、中心線上の s を逆に求める
      let s = 0;
      for (let iter = 0; iter < 30; iter += 1) {
        const actual = s + laneExtraMeters(course, 0, s, w);
        const err = SPEED * elapsed - actual;
        if (Math.abs(err) < 0.01) break;
        s += err;
        if (s < 0) s = 0;
        if (s > distance) { s = distance; break; }
      }
      const p = posOf(course, Math.min(s, distance), w);
      ctx.fillStyle = COLORS[i] ?? '#fff';
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#efe9dc';
      ctx.font = '11px sans-serif';
      ctx.fillText(`${w}m`, sx(p.x) + 8, sy(p.y) - 6);
    }
  }, [t, distance, course]);

  const total = LANES.map((w) => laneExtraMeters(course, 0, distance, w));

  return (
    <main style={{ background: '#221f1b', color: '#efe9dc', padding: 16, fontFamily: 'system-ui, sans-serif', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18, margin: '4px 0 10px' }}>
        コース幾何（俯瞰デバッグ・PR1）
        <span style={{ opacity: 0.6, fontSize: 13, marginLeft: 12 }}>
          ★全馬とも同じ速さ。違うのは**通る場所だけ**
        </span>
      </h1>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', margin: '8px 0' }}>
        <button
          type="button" onClick={() => setPlaying((p) => !p)}
          style={{ padding: '8px 20px', fontWeight: 'bold', cursor: 'pointer', background: playing ? '#8a4030' : '#3a6a40', color: '#fff', border: 0 }}
        >
          {playing ? '停止' : '走らせる'}
        </button>
        <button type="button" onClick={() => { tRef.current = 0; setT(0); }} style={{ padding: '8px 14px', cursor: 'pointer', background: '#3a3630', color: '#efe9dc', border: 0 }}>最初から</button>
        <label>
          距離{' '}
          <select value={distance} onChange={(e) => setDistance(Number(e.target.value))}>
            {[1200, 1400, 1600, 1800, 2000, 2400, 3000].map((d) => <option key={d} value={d}>{d}m</option>)}
          </select>
        </label>
        <span style={{ opacity: 0.75, fontSize: 13 }}>経過 {t.toFixed(1)} 秒</span>
      </div>

      <canvas ref={canvasRef} width={VIEW.width} height={VIEW.height} style={{ width: '100%', maxWidth: VIEW.width, border: '1px solid #4a453d' }} />

      <div style={{ marginTop: 12, fontSize: 13 }}>
        <b>★ゴールまでに、中心線より余計に走る距離</b>
        <table style={{ borderCollapse: 'collapse', marginTop: 6 }}>
          <tbody>
            <tr>
              <td style={{ padding: '2px 10px', opacity: 0.7 }}>内ラチからの距離</td>
              {LANES.map((w, i) => <td key={w} style={{ padding: '2px 10px', color: COLORS[i] }}>{w}m</td>)}
            </tr>
            <tr>
              <td style={{ padding: '2px 10px', opacity: 0.7 }}>余計に走る</td>
              {total.map((v, i) => (
                <td key={LANES[i]} style={{ padding: '2px 10px' }}>
                  {v >= 0 ? '+' : ''}{v.toFixed(1)}m
                </td>
              ))}
            </tr>
            <tr>
              <td style={{ padding: '2px 10px', opacity: 0.7 }}>馬身</td>
              {total.map((v, i) => (
                <td key={LANES[i]} style={{ padding: '2px 10px' }}>
                  {v >= 0 ? '+' : ''}{(v / HORSE_LENGTH_M).toFixed(1)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <p style={{ opacity: 0.6, marginTop: 10, lineHeight: 1.7 }}>
          ★<b>この画面はコース幾何だけを見ています。</b>エンジンにも位置モデルにも触れていません。<br />
          ★<b>外を回った点が遅れなければ、この層は嘘です。</b>その場合、どんな描画を足しても競馬にはなりません。<br />
          ⚠️ <b>いまは「見せているだけ」です。</b>この距離ロスが<b>着順に効く</b>なら、それはエンジン（<code>resolveRace</code>）の変更で、
          正典・V-4 の較正に関わるため<b>レビュー側の裁定が要ります</b>。
        </p>
      </div>
    </main>
  );
}
