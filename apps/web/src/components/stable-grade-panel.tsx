'use client';

/**
 * ★**厩舎の格のパネル**（★D12-6・2026-09-16・正典 **D-103**・デザイナーのカード `components/stable-roster`）
 *
 * 【★この部品が伝えること】
 *   ★**買えるのは強さではなく「時間」**です。
 *   ★伸びと費用に ★**同じ倍率**が掛かるので、★同じ EP を注いだときの強さはどの格でも同じ
 *   （★`gainPerEpRatio(grade) === 1.0`）。
 *   → ★だから ★**2 本のバーを同じ長さで描きます**（★「同じ長さ＝同じ倍率」を目で断言する）。
 *
 * ⚠️ ★**倍率も値段も画面に持ちません**（★`@star/training` から引く・D-052）。
 * ⚠️ ★見出しにもボタンにも ★**「強くなる」「強化」を使いません**（★カードの指定）。
 * ⚠️ ★`/stable` はサーバー側の画面なので、★押せる部分だけをこの部品に切り出しています。
 */

import {
  STABLE_GRADES, STABLE_GRADE_LABEL, gradeGainMult, nextGrade, unlockPriceEP,
  type StableGrade,
} from '@star/training';

/** ★バーの長さ（★いちばん上の格を 100% としたときの割合） */
function barWidth(grade: StableGrade): number {
  const top = STABLE_GRADES[STABLE_GRADES.length - 1]!;
  return (gradeGainMult(grade) / gradeGainMult(top)) * 100;
}

const TONE: Readonly<Record<StableGrade, { readonly bg: string; readonly border: string; readonly color: string }>> = {
  bronze: { bg: '#f3e9dd', border: '#8a6a4a', color: '#5a4326' },
  silver: { bg: '#eef2f6', border: '#6b7d8c', color: '#33414c' },
  gold: { bg: '#fff3d6', border: '#a9741a', color: '#4a3105' },
};

export function StableGradePanel({ horseName, grade }: {
  readonly horseName: string;
  readonly grade: StableGrade;
}): React.ReactElement {
  const next = nextGrade(grade);
  const price = unlockPriceEP(grade);

  return (
    <div style={{ padding: '24px 0 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 16, fontWeight: 900 }}>厩舎の格</span>
        <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-3)' }}>{horseName} の格</span>
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 900, color: 'var(--a-ink-2)', lineHeight: 1.75, marginBottom: 12 }}>
        伸びと費用に<b style={{ color: 'var(--a-ink)' }}>同じ倍率</b>がかかります。同じ参加ポイントを注いだときの強さはどの格でも同じ。
        上の格で買えるのは<b style={{ color: 'var(--a-ink)' }}>速く仕上がること</b>だけです。
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {STABLE_GRADES.map((g) => {
          const tone = TONE[g];
          const w = barWidth(g);
          const isNow = g === grade;
          /** ★いまの格には値段を出さない（★買う対象ではないことを明示・カードの指定） */
          const p = isNow ? null : unlockPriceEP(STABLE_GRADES[STABLE_GRADES.indexOf(g) - 1] ?? 'bronze');
          return (
            <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px', borderRadius: 12, background: tone.bg, border: `2px solid ${tone.border}` }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 74, flex: '0 0 74px' }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: tone.color }}>{STABLE_GRADE_LABEL[g]}</span>
                <span style={{ fontSize: 10.5, fontWeight: 900, color: tone.color, opacity: 0.8 }}>×{gradeGainMult(g)}</span>
              </div>
              {/* ★伸びと費用を同じ長さで描く（★同じ倍率であることを目で断言する） */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(['伸び', '費用'] as const).map((label) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 38, flex: '0 0 38px', fontSize: 10, fontWeight: 900, color: tone.color, opacity: 0.75 }}>{label}</span>
                    <span style={{ position: 'relative', flex: 1, height: 9, borderRadius: 5, background: 'rgba(255,255,255,.5)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', width: `${w}%`, height: '100%', background: tone.border }} />
                    </span>
                  </div>
                ))}
              </div>
              {isNow ? (
                <span style={{ fontSize: 11, fontWeight: 900, color: tone.color, opacity: 0.7, flex: '0 0 auto' }}>現在の格</span>
              ) : p !== null && (
                <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                  <span className="a-num" style={{ fontSize: 18, color: tone.color }}>{p.toLocaleString()}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 900, color: tone.color, display: 'block', opacity: 0.8 }}>EP</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ★誤読を先回りして潰す 3 点（★カードの指定） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, padding: '11px 13px', borderRadius: 9, background: '#eaf3fb', border: '2px solid #9fc0dc' }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink)', lineHeight: 1.7 }}>
          格は馬ごとです。素質の天井（★）は変わりません。1 回に 1 段だけ上がります
        </span>
      </div>

      {next !== null && price !== null ? (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 48, marginTop: 14, borderRadius: 10, backgroundImage: 'var(--a-gloss-gold)', border: '2px solid #8a5a06', fontSize: 15, fontWeight: 900, color: '#4a3105' }}>
          {STABLE_GRADE_LABEL[next]}に上げる（{price.toLocaleString()} EP）
        </span>
      ) : (
        <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>
          これ以上は上げられません（すでに最上位です）
        </div>
      )}
    </div>
  );
}
