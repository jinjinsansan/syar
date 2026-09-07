/**
 * ★デフォルメ馬のリグ — ★**Gate 0B（開発サーバーで見る版）**
 *
 * 【★何のための画面か】
 *   ★動画 2 本（`out/deformed-gate0/`）と ★**同じ純粋関数**を、ブラウザで動かします。
 *   ★見ていただくのは ★**動きだけ**です。★造形は Gate 1 で判定します。
 *
 *   > ★**この骨組みに完成した絵を載せれば、違和感のないデフォルメ馬になりそうか。**
 *
 * 【⚠️ ★この画面は「絵柄の提案」ではありません】
 *   ★図形は ★**動きを見るための仮の身体**です。
 *   ★指示書 §2-2 が禁じる「色付き図形のまま企画者へ出す」ことはしません（★企画者へは出しません）。
 *
 * 【★なぜスライダーを付けたか】
 *   ★`REPORT_P4_DEFORMED_GATE0_20260903.md` §4 の 4 つは ★**目で決める値**です。
 *   ★動画だと 1 回の撮り直しに時間がかかるので、★**その場で動かせる**ようにしました。
 *   ★右上の「脚は届いているか」が ★**赤になったら幾何が破れています**（★検定⑤と同じ式）。
 *
 * 【★描き方はこの画面に持ちません】
 *   ★図形は `@star/render` の `deformedHorseShapes`（★④ 描画アダプタ）が唯一の出どころです。
 *   ★ここがやるのは ★**画面座標へ移して canvas に流すこと**だけ。
 *   ⚠️ ★動画の道具（`tools/render-deformed-gate0.mjs`）と ★**同じ関数**を呼びます
 *      （★2 か所で描いたら必ず離れます — `/race` の注記と同じ理由）。
 *
 * 【★色】
 *   ★16 進をこの画面に持ちません。★`/art/palette.json` から役割名で引きます（★裁定 7）。
 */
'use client';

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFORMED_HORSE_V0, DEFORMED_GAIT_V0, DEFORMED_STAND_BEND,
  deformedPoseAt, deformedHorseShapes, gaitFitsLegs, gaitPhase, legPhase, legInContact,
  hoofWorldX, sweepHalfM,
  type DeformedShape, type DeformedPaintRole, type DeformedGait, type DeformedLegId,
} from '@star/render';

const W = 1280;
const H = 720;
const C = DEFORMED_HORSE_V0;
const LEGS: readonly DeformedLegId[] = ['hindFar', 'hindNear', 'foreFar', 'foreNear'];

/** ★役割 → パレットの鍵。⚠️ ★16 進をここに書きません（★裁定 7） */
const ROLE_KEY: Readonly<Record<DeformedPaintRole, string>> = {
  coat: 'coat-kuri-1', coatShade: 'coat-kuri-3', coatLight: 'coat-kuri-0',
  mane: 'coat-kuri-3', hoof: 'ink-1', muzzle: 'coat-kuri-2',
  eye: 'ink', outline: 'ink',
  silk: 'silk-3', cap: 'frame-3', skin: 'paper-1', boot: 'ink-1', saddle: 'coat-kurokage-3',
  shadow: 'ink-2', numberCloth: 'paper', numberInk: 'ink',
};

type Palette = Readonly<Record<string, string>>;

export default function DeformedRigLab(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [playing, setPlaying] = useState(true);
  /** ★見せる速さの倍率。★0.25 = 動画の 0.25 倍速と同じ */
  const [rate, setRate] = useState(1);
  const [strideM, setStrideM] = useState(DEFORMED_GAIT_V0.strideM);
  const [duty, setDuty] = useState(DEFORMED_GAIT_V0.duty);
  const [standBend, setStandBend] = useState(DEFORMED_STAND_BEND);
  const [speedMps, setSpeedMps] = useState(16);
  /** ★画面高に占める馬の割合（★指示書 §5「通常カット 18〜24%」） */
  const [heightRatio, setHeightRatio] = useState(0.21);
  const [travelM, setTravelM] = useState(0);

  const travelRef = useRef(0);
  const lastRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch('/art/palette.json')
      .then((r) => r.json())
      .then((j: Palette) => { if (alive) setPalette(j); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const gait: DeformedGait = { ...DEFORMED_GAIT_V0, strideM, duty };
  const fit = gaitFitsLegs(C, gait, 0.97, standBend);

  /** ★[m]（y は上が正）→ ★画面 [px]（y は下が正） */
  const draw = useCallback((ctx: CanvasRenderingContext2D, metres: number, pal: Palette) => {
    const pxPerM = (H * heightRatio) / C.totalHeightM;
    const groundY = Math.round(H * 0.78);
    const centreX = Math.round(W * 0.5);
    const sx = (x: number): number => centreX + x * pxPerM;
    const sy = (y: number): number => groundY - y * pxPerM;
    const col = (role: DeformedPaintRole): string => pal[ROLE_KEY[role]] ?? '#888888';

    ctx.fillStyle = '#eef2f5';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#dfe6ea';
    ctx.fillRect(0, groundY, W, H - groundY);

    /** ★1m ごとの縦線。★**接地中の蹄はこの線に貼り付いたまま流れます** */
    ctx.lineWidth = 1;
    ctx.font = '11px sans-serif';
    for (let m = Math.floor(metres - 9); m < metres + 9; m += 1) {
      const x = sx(m - metres);
      if (x < -20 || x > W + 20) continue;
      ctx.strokeStyle = '#c3ced5';
      ctx.beginPath();
      ctx.moveTo(x, groundY - 14);
      ctx.lineTo(x, H);
      ctx.stroke();
      if (m % 5 === 0) { ctx.fillStyle = '#9aa8b2'; ctx.fillText(`${m}m`, x + 3, groundY + 18); }
    }
    ctx.strokeStyle = '#8d9aa4';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();

    const pose = deformedPoseAt({ travelM: metres, gate: 3, speedMps, contract: C, gait, standBend });

    /** ★図形は package が唯一の出どころ（★動画の道具と同じ関数） */
    for (const s of deformedHorseShapes(pose, C, { facing: 1 })) {
      ctx.beginPath();
      if (s.kind === 'capsule') {
        ctx.lineCap = 'round';
        if (s.outline) {
          ctx.strokeStyle = col('outline');
          ctx.lineWidth = Math.max(1, s.radius * 2 * pxPerM + 2.6);
          ctx.moveTo(sx(s.x1), sy(s.y1)); ctx.lineTo(sx(s.x2), sy(s.y2)); ctx.stroke();
          ctx.beginPath();
        }
        ctx.strokeStyle = col(s.fill);
        ctx.lineWidth = Math.max(1, s.radius * 2 * pxPerM);
        ctx.moveTo(sx(s.x1), sy(s.y1)); ctx.lineTo(sx(s.x2), sy(s.y2)); ctx.stroke();
        continue;
      }
      if (s.kind === 'ellipse') {
        ctx.ellipse(sx(s.x), sy(s.y), Math.max(0.5, s.rx * pxPerM), Math.max(0.5, s.ry * pxPerM), -s.angleRad, 0, Math.PI * 2);
      } else {
        s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(sx(p.x), sy(p.y)) : ctx.lineTo(sx(p.x), sy(p.y))));
        ctx.closePath();
      }
      if (s.outline) { ctx.strokeStyle = col('outline'); ctx.lineWidth = 2.6; ctx.stroke(); }
      ctx.save();
      if (s.fill === 'shadow') ctx.globalAlpha = 0.26;
      ctx.fillStyle = col(s.fill);
      ctx.fill();
      ctx.restore();
    }

    /** ★接地している蹄の印（★馬の**上**に描く） */
    for (const leg of LEGS) {
      if (!legInContact(legPhase(gaitPhase(metres, 3, gait), leg, gait), gait)) continue;
      const x = sx(hoofWorldX(metres, 3, leg, C.legs[leg], gait) - metres);
      ctx.strokeStyle = '#d0463a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, groundY - 9); ctx.lineTo(x, groundY + 9); ctx.stroke();
    }

    ctx.fillStyle = '#2c3a44';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('STARミニホース — Gate 0B（★暫定契約 v0・★図形のみ・★動きの判定用）', 24, 30);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#5a6b76';
    ctx.fillText(`進行 ${metres.toFixed(2)}m  完歩位相 ${pose.phase.toFixed(3)}  接地 ${pose.supportCount} 本  速さ ${speedMps}m/s`, 24, 54);
    ctx.fillText('赤い縦線 = ★いま地面に刺さっている蹄（★線から離れなければ滑っていません）', 24, 74);
  }, [gait, heightRatio, speedMps, standBend]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || palette === null) return undefined;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return undefined;
    let raf = 0;
    const tick = (now: number): void => {
      const last = lastRef.current;
      lastRef.current = now;
      if (playing && last !== null) {
        /** ⚠️ ★見た目の速さは `rate` で落としますが、★**姿勢は距離から引きます**（★憲法4） */
        travelRef.current += ((now - last) / 1000) * speedMps * rate;
        setTravelM(travelRef.current);
      }
      draw(ctx, travelRef.current, palette);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => { window.cancelAnimationFrame(raf); lastRef.current = null; };
  }, [draw, palette, playing, rate, speedMps]);

  const num = (v: number, d = 2): string => v.toFixed(d);
  const perSec = speedMps / strideM;

  return (
    <div className="a-panel strong" style={{ marginTop: 18 }}>
      <div className="a-band" style={{ height: 40, padding: '0 18px', gap: 14 }}>
        <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '.1em' }}>Gate 0B — デフォルメ馬のリグ（動きだけ）</span>
        <span style={{ fontSize: 13, fontWeight: 900 }}>★造形は Gate 1。ここは動きの判定用です</span>
      </div>

      <div style={{ padding: 14, background: '#e9eef1' }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          /**
           * ⚠️ ★**縦を画面に収めます。** ★1 度目は 16:9 を横幅いっぱいに広げたため、
           *    ★スライダーと「脚は届いているか」が**画面の外**に出ていました（★実機で確認）。
           */
          style={{
            width: '100%', maxWidth: 'min(1280px, calc(56vh * 16 / 9))', height: 'auto',
            display: 'block', margin: '0 auto',
            border: '2px solid var(--a-edge)', borderRadius: 8, background: '#eef2f5',
          }}
        />

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
          <button type="button" onClick={() => setPlaying((v) => !v)} style={btn}>{playing ? '⏸ 止める' : '▶ 動かす'}</button>
          {[1, 0.25, 0.1].map((r) => (
            <button key={r} type="button" onClick={() => setRate(r)} style={{ ...btn, background: rate === r ? '#2c3a44' : '#fff', color: rate === r ? '#fff' : '#2c3a44' }}>
              {r === 1 ? '通常速度' : `${r} 倍速`}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { travelRef.current = 0; setTravelM(0); }}
            style={btn}
          >
            ⟲ 最初から
          </button>
          <span style={{ fontSize: 12, fontWeight: 900, color: '#5a6b76' }}>進行 {num(travelM)}m</span>
        </div>

        {/* ★目で決める 4 つ（★報告書 §4） */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12, marginTop: 14 }}>
          <Slider label={`① 1 完歩の距離 ${num(strideM)}m（${num(perSec)} 完歩/秒・${num((30 * strideM) / speedMps, 1)} コマ/完歩）`}
            min={3} max={8} step={0.1} value={strideM} onChange={setStrideM} />
          <Slider label={`② 接地の割合 ${num(duty, 3)}（掃き幅 ${num(sweepHalfM(gait) * 2)}m）`}
            min={0.08} max={0.32} step={0.005} value={duty} onChange={setDuty} />
          <Slider label={`③ しゃがみ ${num(standBend, 3)}（1.0 = 脚を伸ばし切る）`}
            min={0.55} max={0.95} step={0.01} value={standBend} onChange={setStandBend} />
          <Slider label={`④ 画面に占める高さ ${num(heightRatio * 100, 1)}%（指示書 §5 は 18〜24%）`}
            min={0.10} max={0.40} step={0.005} value={heightRatio} onChange={setHeightRatio} />
          <Slider label={`（参考）走る速さ ${num(speedMps, 1)}m/s`}
            min={8} max={20} step={0.5} value={speedMps} onChange={setSpeedMps} />
        </div>

        {/* ★幾何が破れていないか（★検定⑤と同じ式） */}
        <div style={{
          marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 900, lineHeight: 1.8,
          border: `2px solid ${fit.ok ? '#3f7d4e' : '#c0392b'}`, background: fit.ok ? '#eef7f0' : '#fdecea', color: fit.ok ? '#255c33' : '#8e2b20',
        }}>
          {fit.ok ? '★脚は届いています' : '⚠️ ★脚が届いていません（★この設定では幾何が破れます）'} —
          {' '}必要 {num(fit.needM, 3)}m / 届く {num(fit.haveM, 3)}m（{fit.worstLeg}）
          <br />
          <span style={{ fontWeight: 700 }}>
            ★短い脚では長い歩幅を物理的に出せません。①を伸ばすか②を増やすと届かなくなり、詰めると完歩が速くなって 30fps でコマが足りません。
          </span>
        </div>

        <p style={{ fontSize: 12.5, fontWeight: 900, color: '#5a6b76', lineHeight: 1.9, marginTop: 12 }}>
          ★<b>0.25 倍速</b>で見ていただきたいのは 3 つです —
          ★<b>接地滑り</b>（赤い縦線から蹄が離れないか）／★<b>脚の跳び</b>／★<b>騎手の腰が鞍から浮かないか</b>。<br />
          ⚠️ ★倍速はコマを増やしません。★<b>同じ姿勢を遅く見せているだけ</b>です（★中割りを作ると実際には無い滑らかさを見せることになるため）。
        </p>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  height: 34, padding: '0 14px', borderRadius: 8, border: '2px solid var(--a-edge)',
  background: '#fff', color: '#2c3a44', fontSize: 13, fontWeight: 900, cursor: 'pointer',
};

function Slider(props: {
  readonly label: string; readonly min: number; readonly max: number; readonly step: number;
  readonly value: number; readonly onChange: (v: number) => void;
}): React.ReactElement {
  return (
    <label style={{ display: 'block', fontSize: 12, fontWeight: 900, color: '#2c3a44' }}>
      {props.label}
      <input
        type="range" min={props.min} max={props.max} step={props.step} value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        style={{ width: '100%', marginTop: 6 }}
      />
    </label>
  );
}
