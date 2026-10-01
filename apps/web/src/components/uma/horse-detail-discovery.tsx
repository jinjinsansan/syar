'use client';

/**
 * ★**分かってきたこと**（★R-26・2026-10-01・引き渡し資料 D26-3 ②「分かってきたこと」）
 *
 * 【★なぜ部品にしたか】
 *   ★引き渡し資料は ★`/stable/[horseId]` と ★`/stable/retired` に ★**同じ部品**を置くよう指定しています。
 *   ★画面ごとに書くと ★片方だけ古くなるので（★D-052）、★ここに 1 つ置きます。
 *   ★中身の決め方は ★`/stable/retired` の旧い節と同じです（★段は `discoveryStageOf`・★文字は `discoveryLabelOf`）。
 *
 * 【★この部品が守ること】
 *   ⚠️ ★**段を画面で決めません**（★`discoveryStageOf` が回数から決める・D-108 ②）。★刻みを持ちません。
 *   ⚠️ ★**数値を出しません**（★素質・評価の数値はどの段でも出さない・D-114 / D-116）。
 *   ⚠️ ★脚質は ★**「試した回数」だけ**です（★「向く」と書くと素質の手がかりになる）。
 *   ⚠️ ★**他人の馬では呼ばないこと**（★口 `my_horse_discovery_runs` が自分の馬だけを返す。★呼ぶ側が行を渡さなければ出さない）。
 */

import { discoveryStageOf, discoveryLabelOf } from '@star/sim-engine';
import type { DiscoveryRow } from '../../lib/discovery-screen';

/** ★発見度の 4 段（★並びは `@star/sim-engine` の `DISCOVERY_STAGES` と同じ。★刻みは持たない） */
const STAGES = ['unknown', 'hint', 'narrow', 'known'] as const;
/** ★段の色（★引き渡し資料の確定値 `#c3ccd4` `#6b3fc4` `#1a6fd4` `#1e7a3a`） */
const STAGE_TONE: readonly string[] = ['#c3ccd4', '#6b3fc4', '#1a6fd4', '#1e7a3a'];
/** ★段の目盛の空き */
const SEG_EMPTY = '#e3ecf3';

const ROW: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5, padding: '8px 10px', borderRadius: 8,
  background: 'var(--u-paper-3)', border: '1px solid var(--u-rule)',
};

export function HorseDetailDiscovery({ rows, style }: {
  readonly rows: readonly DiscoveryRow[];
  readonly style?: React.CSSProperties;
}): React.ReactElement {
  const graded = rows.filter((d) => d.axis !== 'strategy');
  /** ★脚質は ★走ったものだけを「n 回 試しました」で 1 行に（★見本の「先行を 7 回 試しました」） */
  const tried = rows.filter((d) => d.axis === 'strategy' && d.runs > 0);
  return (
    <section style={{
      flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: 12,
      borderRadius: 12, background: 'var(--u-paper)', color: 'var(--u-ink-dark)', ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14 }}>分かってきたこと</span>
        <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--u-ink-dark-2)' }}>レースを終えるたびに、少しずつ分かります</span>
      </div>
      {graded.map((d) => {
        /** ★段は `@star/sim-engine` が回数から決めます（★画面で決めない・D-108 ②） */
        const stage = discoveryStageOf(d.runs);
        const reached = STAGES.indexOf(stage);
        const tone = STAGE_TONE[reached] ?? STAGE_TONE[0]!;
        return (
          <div key={`${d.axis}-${d.label}`} style={ROW}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 13 }}>{d.label}</span>
              {/* ★`known` のときだけ評価そのもの（★数値は段によらず出さない） */}
              <span style={{ marginLeft: 'auto', fontSize: 12, color: tone }}>{discoveryLabelOf(stage, '評価: A')}</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {STAGES.map((s, i) => (
                <div key={s} style={{ flex: '1 1 0', height: 7, borderRadius: 3, background: i <= reached ? tone : SEG_EMPTY }} />
              ))}
            </div>
          </div>
        );
      })}
      <div style={{ ...ROW, flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 13 }}>脚質</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--u-ink-dark-2)', textAlign: 'right' }}>
          {tried.length === 0 ? 'まだ試していません' : `${tried.map((d) => `${d.label}を ${d.runs} 回`).join('・')} 試しました`}
        </span>
      </div>
    </section>
  );
}
