/**
 * ★Blender で描いたものを見る画面（★2026-09-05・★オーナー判断 ②）
 *
 * 【⚠️ ★この画面はブラウザで 3D を描いていません】
 *   ★`tools/blender/race_render.py` が ★**あらかじめ描いた動画**を再生しているだけです。
 *   ★これは前に話した「★**サーバーで動画にして配る**」形の、いちばん小さい姿でもあります
 *   （★引継ぎ書 `HANDOVER_P4_RACE_VISUAL_20260905.md` §5-②）。
 *
 * 【⚠️ ★開発専用】★本番では 404。★購入素材は配信しません。
 */
'use client';

import type React from 'react';

const FACTS: ReadonlyArray<readonly [string, string]> = [
  ['描いたもの', 'Blender 4.5.10 LTS / EEVEE Next / 1280×720 / 30fps'],
  ['1 コマ', '約 2.6 秒（★3 秒の動画で 145 秒）'],
  ['馬の実寸', '2.5m へ自動調整（★素材の高さ 2.569 を測って倍率 0.9732）'],
  ['走る速さ', '16.0 m/s ／ 再生倍率 6.57'],
  ['★滑らない地面の速さ', '★2.437 m/s（等倍・★Blender 上で 4 本の蹄から実測した中央値）'],
  ['空', 'Poly Haven CC0（★空のみ・実在の競馬場は写っていません）'],
  ['入っているもの', '★柔らかい影／被写界深度／モーションブラー（★すべて Blender の標準機能）'],
];

export default function BlenderClient(): React.ReactElement {
  return (
    <main style={{ minHeight: '100vh', background: '#12161a', color: '#eef2f6', padding: 16, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>Blender で描いたレース映像（★第 1 歩）</h1>
        <p style={{ margin: '0 0 12px', color: '#9aa8b4', fontSize: 13, lineHeight: 1.8 }}>
          ⚠️ ★この画面は<b>ブラウザで 3D を描いていません</b>。★あらかじめ Blender が描いた動画を再生しています。<br />
          ★まだ<b>馬 1 頭・走路と柵だけ</b>です。スタンドも観客もゴール板も作っていません。
        </p>

        <video
          src="/rig-lab-assets/blender/run.mp4"
          controls
          autoPlay
          loop
          muted
          playsInline
          style={{
            width: '100%', maxWidth: 'min(1100px, calc(64vh * 16 / 9))', display: 'block', margin: '0 auto',
            border: '1px solid #3d4650', background: '#000',
          }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14, marginTop: 16 }}>
          <div>
            <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>数字</h2>
            <table style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>
              <tbody>
                {FACTS.map(([k, v]) => (
                  <tr key={k}>
                    <th style={{ textAlign: 'left', padding: '4px 10px 4px 0', color: '#9aa8b4', fontWeight: 700, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{k}</th>
                    <td style={{ padding: '4px 0', lineHeight: 1.7 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>まだ無いもの</h2>
            <ul style={{ fontSize: 12.5, lineHeight: 1.9, paddingLeft: 18, margin: 0, color: '#c6d0d8' }}>
              <li>★スタンド・観客・ゴール板</li>
              <li>★複数頭（いまは 1 頭）</li>
              <li>★ゲート・発走・20 秒の台本</li>
              <li>★ゼッケンの馬番・順位表示・実況</li>
            </ul>
            <h2 style={{ fontSize: 15, margin: '16px 0 8px' }}>比較のために</h2>
            <p style={{ fontSize: 12.5, lineHeight: 1.9, color: '#c6d0d8', margin: 0 }}>
              ★同じ素材をブラウザで描いたものは <a href="/rig-lab/race" style={{ color: '#7fb2ff' }}>/rig-lab/race</a>（★20 秒・6 頭）。<br />
              ★素材の棚卸しは <a href="/rig-lab/explore" style={{ color: '#7fb2ff' }}>/rig-lab/explore</a>。
            </p>
          </div>
        </div>

        <h2 style={{ fontSize: 15, margin: '18px 0 8px' }}>静止画（等倍）</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/rig-lab-assets/blender/still.png"
          alt="Blender で描いた 1 枚目"
          style={{ width: '100%', maxWidth: 1100, display: 'block', border: '1px solid #3d4650' }}
        />
      </div>
    </main>
  );
}
