'use client';

/**
 * ★**騎手を選ぶ**（★D12-4・2026-09-16・正典 **D-105**・デザイナーのカード `components/jockey-market`）
 *
 * 【★この便では着順に効きません】
 *   ★`JOCKEY_EFFECT` は 0、★`calm`（暴走の抑え）も `race-engine` 側の係数が 0 です。
 *   → ★**「この騎手だと勝ちやすい」と読める書き方をしない**（★カードの指定・D-105 ③）。
 *
 * 【★画面に出すもの】★名前・料金・親密度だけ。
 * ⚠️ ★**`calm`（抑えの強さ）を画面に出しません** — ★出せば「強さの差」に読めます。
 * ⚠️ ★勝率・得意距離・成績など ★**着順に効くと読める数値を 1 つも出しません**。
 * ⚠️ ★名簿は `@star/scheduler` の `JOCKEYS` が正です（★画面に名前や料金を持たない）。
 */

import { JOCKEYS, JOCKEY_BOND_MAX, jockeyBondAfterRides } from '@star/scheduler';

/**
 * ★親密度の言葉（★数値ではなく段で見せる。★頭打ちに達したら言う）。
 * ⚠️ ★**馬詳細（D13-2）の「主戦騎手」も同じ言葉を使います** — ★あちらで組み直さないため公開しています（★D-052）。
 */
export function bondLabel(bond: number): string {
  if (bond >= JOCKEY_BOND_MAX) return '頭打ち';
  if (bond === 0) return 'これから';
  return bond >= JOCKEY_BOND_MAX - 2 ? '良好' : 'ふつう';
}

export function JockeyPicker({ horseName, raceName, rides, selectedId, onSelect }: {
  readonly horseName: string;
  readonly raceName: string;
  /** ★騎手 id → その馬での騎乗回数（★凍結から数えた値。★画面では数えない） */
  readonly rides: Readonly<Record<string, number>>;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}): React.ReactElement {
  const selected = JOCKEYS.find((j) => j.id === selectedId) ?? null;

  return (
    <div style={{ padding: '18px 0 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 16, fontWeight: 900 }}>騎手を選ぶ</span>
        <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-3)' }}>{horseName}　{raceName}</span>
      </div>
      {/* ★「強さの差はありません」を最初に言う（★カードの指定） */}
      <div style={{ fontSize: 11.5, fontWeight: 900, color: 'var(--a-ink-2)', lineHeight: 1.7, marginBottom: 12 }}>
        <b style={{ color: 'var(--a-ink)' }}>騎手による強さの差はありません。</b>選んだ騎手は出走登録の時点で決まります。
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {JOCKEYS.map((j) => {
          const sel = j.id === selectedId;
          /** ★親密度は `@star/scheduler` が回数から決めます（★画面で数えない） */
          const bond = jockeyBondAfterRides(rides[j.id] ?? 0);
          const pct = (bond / JOCKEY_BOND_MAX) * 100;
          return (
            <div
              key={j.id}
              onClick={() => { onSelect(j.id); }}
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 12, cursor: 'pointer',
                background: '#fff',
                border: sel ? '3px solid #8a5a06' : '2px solid var(--a-edge)',
                boxShadow: sel ? '0 0 0 3px rgba(138,90,6,.16)' : '0 2px 6px rgba(16,36,58,.08)',
              }}
            >
              {/* ★抽象の人影だけ（★実在の顔を想起させない・§0.1） */}
              <div style={{ width: 56, height: 56, flex: '0 0 56px', borderRadius: '50%', background: 'linear-gradient(160deg,#1e5aa822,#1e5aa855)', border: '2px solid var(--a-edge-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
                  <circle cx="15" cy="10" r="6" fill="#1e5aa8" opacity=".6" />
                  <path d="M4 27c0-7 5-11 11-11s11 4 11 11" fill="#1e5aa8" opacity=".6" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 16, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ position: 'relative', flex: 1, height: 8, borderRadius: 4, background: '#e3ecf3', border: '1.5px solid var(--a-edge-soft)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${pct}%`, height: '100%', backgroundImage: 'var(--a-gloss-green)' }} />
                  </span>
                  <span style={{ fontSize: 10.5, fontWeight: 900, color: 'var(--a-ink-3)', whiteSpace: 'nowrap' }}>{bondLabel(bond)}</span>
                </div>
              </div>
              {/* ★料金は右端の同じ位置（★料金の比較だけで強さを読ませない） */}
              <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                <span className="a-num" style={{ fontSize: 18 }}>{j.feeEP}</span>
                <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--a-ink-2)' }}> EP</span>
              </div>
              {sel && (
                <span style={{ position: 'absolute', right: -2, top: -9, display: 'flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 6, backgroundImage: 'var(--a-gloss-blue)', border: '1px solid var(--a-edge)', fontSize: 10, fontWeight: 900, color: '#fff' }}>
                  出走登録で決まります
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, padding: '11px 13px', borderRadius: 9, background: '#eaf3fb', border: '2px solid #9fc0dc' }}>
        <span style={{ fontSize: 11.5, fontWeight: 900, color: 'var(--a-ink)', lineHeight: 1.7 }}>
          親密度は数戦で頭打ちになります。着順への影響はありません
        </span>
      </div>

      {selected !== null && (
        <div style={{ marginTop: 12, fontSize: 12.5, fontWeight: 900, color: 'var(--a-ink-2)' }}>
          {selected.name}　騎手の料金 <span className="a-num" style={{ fontSize: 16 }}>{selected.feeEP}</span> EP
        </div>
      )}
    </div>
  );
}
