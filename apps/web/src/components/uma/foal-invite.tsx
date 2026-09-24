'use client';

/**
 * ★**「もう 1 頭 生産できます」の案内**（★2026-09-24・案 A・D-120）
 *
 * 【★なぜ要るか】
 *   ★案 A は「★付与 1 頭 ＋ ★**無償の生産 1 頭**」です。★生産の画面（`/stable/foal`）は在るのに、
 *   ★**リンクが 1 本もありませんでした**。★`/setup` を終えた直後に見逃した人は、
 *   ★**受け取れるはずの馬に二度と辿り着けません**。
 *
 * 【★この部品が守る約束】
 *   ★**段階を自分で導きません**（★`my_onboarding_state` の `stage` に従う・裁定 §2 条件 1）。
 *   ★出すのは ★`choose_parents` のときだけ。★それ以外は ★**何も描きません**（`null`）。
 *   ★古い口座（`legacy`）にも、★もう済んだ人にも出ません。
 *
 * ⚠️ ★**読めなかったら黙ります**（★案内を出さないだけ。★玄関を壊さない・R-27）。
 * ⚠️ ★新しい意匠を作っていません。★色と角は `uma-parts` の帯に合わせてあります。
 */

import { useEffect, useState } from 'react';
import { fetchOnboardingState } from '../../lib/onboarding';

export function FoalInvite(): React.ReactElement | null {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let active = true;
    fetchOnboardingState()
      .then((s) => { if (active) setShow(s.stage === 'choose_parents'); })
      .catch(() => { /* ★読めないときは出さない（★玄関を壊さない） */ });
    return () => { active = false; };
  }, []);
  if (!show) return null;
  return (
    <a
      href="/stable/foal"
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        width: '100%', maxWidth: 1220, margin: '0 auto', padding: '8px 14px',
        textDecoration: 'none',
      }}
    >
      <span style={{
        flex: '1 1 auto', minHeight: 44, display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 12px', borderRadius: 10,
        border: '3px solid var(--u-gold)', background: 'var(--u-panel-strong)',
        color: 'var(--u-ink-light)', fontSize: 13, fontWeight: 900, lineHeight: 1.6,
      }}>
        もう 1 頭、父と母を選んで生産できます（参加ポイントはかかりません）
      </span>
    </a>
  );
}
