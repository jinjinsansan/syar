/**
 * ★カメラ・デバッグ（PR2）— **カメラを変えると見え方が変わり、結果は変わらない**
 *
 * 【この画面が答えること】
 *   ① コーナーでも走路が**横に流れて**見えるか
 *   ② `tilt`（寝かせ具合）で**奥行き**が出るか
 *   ③ **カット表**が局面どおりに切り替わるか
 *
 * 【★この画面が答えないこと】
 *   絵の良し悪し。馬はまだ**丸**です（スプライトは PR4）。
 *
 * 【★着順に触れていません】
 *   `posOf` の結果を受け取って画面に落とすだけです。
 */
'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  ovalCourse, posOf, courseToScreen, cutsFor, cutAt, blendCamera, focusOf,
  laneExtraMeters, segmentAt, HORSE_LENGTH_M,
  type CameraPose, type CameraState,
} from '@star/render';

const VP = { width: 1180, height: 560 };
const DIST = 1600;
/** 内ラチからの距離 [m] */
const LANES = [2, 4, 6, 8, 10, 13, 16];
const COLORS = ['#e04a3a', '#f0f0f0', '#2a58c8', '#f2c14e', '#3aa05a', '#9a5ad0', '#d8792a'];
const SPEED = 16;

export default function CameraPage(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const tRef = useRef(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [manual, setManual] = useState(false);
  const [tilt, setTilt] = useState(0.25);
  const [zoom, setZoom] = useState(16);
  const [xComp, setXComp] = useState(1);

  const course = ovalCourse(DIST);
  const cuts = cutsFor(course);

  useEffect(() => {
    if (!playing) return;
    const loop = (): void => {
      tRef.current = (tRef.current + 1 / 60) % 105;
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
    const now = tRef.current;

    /** ★全馬とも同じ速さ。違うのは通る場所だけ（PR1 と同じ） */
    const sOf = (w: number): number => {
      let s = 0;
      for (let i = 0; i < 40; i += 1) {
        const actual = s + laneExtraMeters(course, 0, s, w);
        const err = SPEED * now - actual;
        if (Math.abs(err) < 0.01) break;
        s += err;
        if (s < 0) s = 0;
        if (s > DIST) { s = DIST; break; }
      }
      return Math.min(s, DIST);
    };
    const horses = LANES.map((w, i) => ({ gate: i + 1, w, s: sOf(w) }));
    const lead = Math.max(...horses.map((h) => h.s));
    const metersLeft = DIST - lead;

    // ★カット表から今のカメラを決める（手動なら上書き）
    const { cut, prev } = cutAt(cuts, metersLeft);
    let state: CameraState = cut.state;
    if (prev !== undefined && cut.blendSec > 0) {
      // 距離をおおよその秒に直して補間（★見せるための近似。着順に触れない）
      const intoSec = Math.max(0, (prev.fromMetersLeft - metersLeft) / SPEED);
      state = blendCamera(prev.state, cut.state, intoSec / cut.blendSec);
    }
    if (manual) state = { ...state, tilt, zoom, xCompression: xComp };

    const focusS = focusOf(state.targetMode, horses, 1, HORSE_LENGTH_M);
    const c0 = posOf(course, focusS, course.widthM / 2);
    const pose: CameraPose = { state, centre: { x: c0.x, y: c0.y }, heading: c0.heading };

    ctx.fillStyle = '#1b2a16';
    ctx.fillRect(0, 0, VP.width, VP.height);

    // ★走路（内ラチ・外ラチ）をカメラ越しに描く
    for (const [w, col] of [[0, '#d8d5c8'], [course.widthM, '#7f9276']] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      for (let s = Math.max(0, focusS - 260); s <= Math.min(DIST, focusS + 260); s += 3) {
        const p = courseToScreen(course, pose, VP, s, w);
        if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    // ★ハロン棒
    ctx.font = '12px sans-serif';
    for (let m = 0; m <= DIST; m += 200) {
      if (Math.abs(m - focusS) > 260) continue;
      const a = courseToScreen(course, pose, VP, m, 0);
      const b = courseToScreen(course, pose, VP, m, course.widthM);
      ctx.strokeStyle = 'rgba(239,233,220,0.30)';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.fillStyle = '#f2c14e';
      ctx.fillText(`残${DIST - m}`, b.x + 4, b.y);
    }
    // ★決勝線
    if (Math.abs(DIST - focusS) <= 260) {
      const a = courseToScreen(course, pose, VP, DIST, 0);
      const b = courseToScreen(course, pose, VP, DIST, course.widthM);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    /**
     * ★**奥（上）から手前（下）へ描きます。**
     *   手前の馬が奥を隠すことで、馬群に厚みが出ます。
     */
    const drawn = horses
      .map((h) => ({ h, p: courseToScreen(course, pose, VP, h.s, h.w) }))
      .sort((a, b) => a.p.y - b.p.y);
    for (const { h, p } of drawn) {
      // ★手前ほど大きい（奥行きの手掛かり。線遠近は描かない）
      const k = 1 + 0.45 * ((p.y - VP.height / 2) / (VP.height / 2));
      const r = Math.max(3, 9 * Math.max(0.4, k) * (state.spriteScale === 2 ? 1.25 : 1));
      ctx.fillStyle = 'rgba(20,30,16,0.35)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.9, r, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLORS[h.gate - 1] ?? '#fff';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0d0d0d';
      ctx.font = `bold ${Math.round(r)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${h.w}`, p.x, p.y + r * 0.35);
      ctx.textAlign = 'left';
    }

    // ★いま何を見ているか
    ctx.fillStyle = 'rgba(28,26,22,0.75)';
    ctx.fillRect(10, 10, 470, 86);
    ctx.fillStyle = '#f2c14e';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`${manual ? '手動' : cut.label}　${segmentAt(course, focusS).label}`, 22, 36);
    ctx.fillStyle = '#efe9dc';
    ctx.font = '14px sans-serif';
    ctx.fillText(`残り ${metersLeft.toFixed(0)}m　追う対象 ${state.targetMode}`, 22, 60);
    ctx.fillText(
      `縮尺 ${state.zoom.toFixed(1)}px/m（${Math.round(VP.width / state.zoom)}m幅）　`
      + `寝かせ ${state.tilt.toFixed(2)}　望遠 ${state.xCompression.toFixed(2)}　`
      + `スプライト ${state.spriteScale}倍`,
      22, 82,
    );
  }, [t, manual, tilt, zoom, xComp, course, cuts]);

  const row: React.CSSProperties = { display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0' };
  return (
    <main style={{ background: '#221f1b', color: '#efe9dc', padding: 16, fontFamily: 'system-ui, sans-serif', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18, margin: '4px 0 10px' }}>
        カメラ（PR2）
        <span style={{ opacity: 0.6, fontSize: 13, marginLeft: 12 }}>
          ★7頭とも同じ速さ。数字は内ラチからの距離。馬はまだ丸（スプライトは PR4）
        </span>
      </h1>
      <div style={row}>
        <button
          type="button" onClick={() => setPlaying((p) => !p)}
          style={{ padding: '8px 20px', fontWeight: 'bold', cursor: 'pointer', background: playing ? '#8a4030' : '#3a6a40', color: '#fff', border: 0 }}
        >{playing ? '停止' : '走らせる'}</button>
        <button type="button" onClick={() => { tRef.current = 0; setT(0); }} style={{ padding: '8px 14px', cursor: 'pointer', background: '#3a3630', color: '#efe9dc', border: 0 }}>最初から</button>
        <label title="カット表を無視して手で動かす">
          <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />{' '}手動
        </label>
        <label>寝かせ <input type="range" min={0} max={1} step={0.05} value={tilt} disabled={!manual} onChange={(e) => setTilt(Number(e.target.value))} /> {tilt.toFixed(2)}</label>
        <label>縮尺 <input type="range" min={6} max={40} step={1} value={zoom} disabled={!manual} onChange={(e) => setZoom(Number(e.target.value))} /> {zoom}px/m</label>
        <label>望遠 <input type="range" min={0.4} max={1.2} step={0.05} value={xComp} disabled={!manual} onChange={(e) => setXComp(Number(e.target.value))} /> {xComp.toFixed(2)}</label>
      </div>
      <canvas ref={canvasRef} width={VP.width} height={VP.height} style={{ width: '100%', maxWidth: VP.width, border: '1px solid #4a453d' }} />
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 12, lineHeight: 1.8 }}>
        ★見ていただきたいこと<br />
        ① <b>コーナーでも走路が横に流れる</b>か（縦や斜めに流れたら、カメラの回転が効いていません）<br />
        ② <b>「寝かせ」を上げると奥行きが出る</b>か（0＝真横で潰れ、1＝真俯瞰）<br />
        ③ <b>カット表が局面どおりに切り替わる</b>か（発走 → 隊列形成 → 向正面 → 3角 → 4角 → 直線 → 追い比べ）<br />
        ⚠️ <b>カメラは着順に触れません。</b>どう変えても結果は 1ビットも変わりません（検査で固定）。
      </p>
    </main>
  );
}
