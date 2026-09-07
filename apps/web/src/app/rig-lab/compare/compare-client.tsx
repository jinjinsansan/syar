/**
 * ★見比べる画面（★2026-09-06）
 *
 * 【★何のための画面か】
 *   ⚠️ ★「道産子に見える」の原因を、★開発側は**画素の目安で 5 回続けて測り損ねました**
 *      （★脚の割合／縦横比／蹄の開き／ゼッケン基準／ヘルメット基準）。
 *   → ★推測で直しを送ると往復が増えるので、★**承認済みと走行コマを同じ大きさで並べて、
 *     ★オーナーに違いを 1 つ名指してもらう**ための画面です。
 *
 * 【★並べ方】
 *   ★承認済みと 16 コマを ★**同じ高さ 420px** に揃えて書き出してあります
 *   （★大きさの違いが判断に混ざらないように）。
 *
 * 【⚠️ ★開発専用】★本番では 404。★納品素材は配信しません。
 */
'use client';

import type React from 'react';
import { useState } from 'react';

const DIR = '/rig-lab-assets/compare';
const FRAMES = Array.from({ length: 16 }, (_, i) => i + 1);

export default function CompareClient(): React.ReactElement {
  /** ★左に固定する承認済みと、右に出す走行コマ */
  const [pick, setPick] = useState(3);
  const [wide, setWide] = useState(false);

  return (
    <main style={{ minHeight: '100vh', background: '#12161a', color: '#eef2f6', padding: 16, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>見比べ — 承認済みの絵 と 走っているコマ</h1>
        <p style={{ margin: '0 0 14px', color: '#9aa8b4', fontSize: 13, lineHeight: 1.9 }}>
          ★<b>同じ高さ（420px）に揃えて</b>あります。大きさの違いは判断に入りません。<br />
          ★<b>違うところを 1 つだけ</b>教えてください。首・脚・胴・頭の大きさ… どこでも構いません。
        </p>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setWide((v) => !v)} style={{ ...btn, background: wide ? '#2f6fd0' : '#222a31' }}>
            {wide ? '並べ方: 上下' : '並べ方: 左右'}
          </button>
          <span style={{ fontSize: 12.5, color: '#9aa8b4' }}>走行コマを選ぶ:</span>
          {FRAMES.map((f) => (
            <button
              key={f} type="button" onClick={() => setPick(f)}
              style={{
                ...btn, minWidth: 40, padding: '4px 8px',
                background: pick === f ? '#2f6fd0' : '#222a31',
                borderColor: f === 9 ? '#d8c88f' : '#55606b',
              }}
            >
              {f}
            </button>
          ))}
          <span style={{ fontSize: 12, color: '#d8c88f' }}>★9 は承認済みと同じ姿勢のコマです</span>
        </div>

        <div style={{ display: 'flex', flexDirection: wide ? 'row' : 'column', gap: 18, alignItems: 'flex-start' }}>
          <figure style={fig}>
            <figcaption style={cap}>承認済みの絵（オーナー合格）</figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${DIR}/approved.png`} alt="承認済み" style={img} />
          </figure>
          <figure style={fig}>
            <figcaption style={cap}>走っているコマ {pick}</figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${DIR}/f${String(pick).padStart(2, '0')}.png`} alt={`コマ${pick}`} style={img} />
          </figure>
        </div>

        <h2 style={{ fontSize: 15, margin: '26px 0 8px' }}>16 コマ全部（再生順）</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${DIR}/gallop16.png`} alt="16 コマ" style={{ width: '100%', border: '1px solid #3d4650', background: '#16181c' }} />

        <h2 style={{ fontSize: 15, margin: '26px 0 8px' }}>形だけ重ねたもの（赤＝承認済み・緑＝走行コマ・白＝一致）</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${DIR}/overlay.png`} alt="重ね" style={{ width: '100%', border: '1px solid #3d4650', background: '#16181c' }} />

        <p style={{ color: '#8fa0ad', fontSize: 12.5, lineHeight: 1.9, marginTop: 22 }}>
          ★走っているところは <a href="/rig-lab/sprite" style={{ color: '#7fb2ff' }}>/rig-lab/sprite</a>。<br />
          ⚠️ ★開発側は、この違いを画素の目安で <b>5 回続けて測り損ねました</b>。★推測で直しを送ると往復が増えるので、
          ★<b>名指ししていただいた 1 点だけ</b>を発注に載せます。
        </p>
      </div>
    </main>
  );
}

const btn: React.CSSProperties = {
  minHeight: 34, padding: '5px 12px', border: '1px solid #55606b', borderRadius: 6,
  background: '#222a31', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13,
};
const fig: React.CSSProperties = { margin: 0, flex: '0 0 auto' };
const cap: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#d8c88f', marginBottom: 6 };
const img: React.CSSProperties = { display: 'block', border: '1px solid #3d4650', background: '#16181c', maxWidth: '100%' };
