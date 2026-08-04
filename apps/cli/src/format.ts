/** 人間可読な検証レポートの整形（機械可読は JSON 側・指示書 §3.4 / 正典 §13.3） */

import type { CohortStat, SimulationResult } from './simulator.js';

function pad(value: string | number, width: number, align: 'left' | 'right' = 'right'): string {
  const s = String(value);
  if (s.length >= width) return s;
  const fill = ' '.repeat(width - s.length);
  return align === 'right' ? fill + s : s + fill;
}

function pct(value: number, digits = 2): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function verdict(pass: boolean): string {
  return pass ? 'PASS' : 'FAIL';
}

function cohortRow(c: CohortStat): string {
  return [
    pad(c.generation, 4),
    pad(c.foals, 6),
    pad(c.meanGenerationDepth.toFixed(1), 6),
    pad(c.meanAbilityTotal.toFixed(1), 9),
    pad(c.minAbilityTotal.toFixed(0), 7),
    pad(c.maxAbilityTotal.toFixed(0), 7),
    pad(c.allele.mean.toFixed(1), 8),
    pad(c.allele.sd.toFixed(1), 7),
    pad(c.allele.p95.toFixed(0), 6),
    pad(c.meanF.toFixed(4), 8),
    pad(c.atavism.hits, 6),
    pad(c.bigAtavism.hits, 6),
    pad(c.bigMutation.hits, 6),
    pad(c.frailCount, 6),
  ].join(' ');
}

/** 表示する世代を間引く（先頭10 + 10刻み + 末尾5） */
function sampleCohorts(cohorts: readonly CohortStat[]): CohortStat[] {
  const total = cohorts.length;
  const out: CohortStat[] = [];
  for (let i = 0; i < total; i++) {
    const c = cohorts[i];
    if (c === undefined) continue;
    const isHead = i < 10;
    const isTail = i >= total - 5;
    const isStep = c.generation % 10 === 0;
    if (isHead || isTail || isStep) out.push(c);
  }
  return out;
}

export function formatReport(result: SimulationResult): string {
  const { options, founderCohort, cohorts, verification, totals } = result;
  const lines: string[] = [];

  lines.push('='.repeat(112));
  lines.push('STAR P0 — 遺伝エンジン 100世代シミュレータ');
  lines.push('='.repeat(112));
  lines.push(
    `seed=${options.seed}  generations=${options.generations}  繁殖牝馬=${options.population}  ` +
      `種牡馬プール=${options.stallionPool}  種付候補=上位${pct(options.stallionTopRatio, 0)}  ` +
      `成熟=${options.maturityYears}歳  補充=${options.recruit}  選抜h2=${options.selectionH2}`,
  );
  lines.push(
    `総配合数=${totals.matings}  生成馬数=${totals.horsesCreated}  未受胎(牝馬)=${totals.unbredMares}`,
  );
  lines.push(
    `MUTATION_SD=${result.balanceDigest.genetics.MUTATION_SD}  REGRESSION_RATE=${result.balanceDigest.regressionRate}` +
      `${result.balanceDigest.regressionRate === 0 ? '（正典どおり=無効）' : '（★正典外の提案機構が有効）'}`,
  );
  if (options.selectionH2 !== 1) {
    lines.push(
      `[注意] 種牡馬選抜は観測能力（遺伝率 h2=${options.selectionH2}）で行っています。` +
        '指示書 §3.4 の文字通りの既定（真の素質値による完全情報選抜）は --selection-h2 1 で再現できます。理由は REPORT_P0 §5 を参照。',
    );
  }
  lines.push('');

  lines.push('--- 世代推移 ---');
  lines.push(
    [
      pad('世代', 4),
      pad('産駒', 6),
      pad('血統深', 6),
      pad('平均能力', 9),
      pad('最小', 7),
      pad('最大', 7),
      pad('アレル平均', 8),
      pad('SD', 7),
      pad('p95', 6),
      pad('平均F', 8),
      pad('隔世', 6),
      pad('覚醒', 6),
      pad('大変異', 6),
      pad('虚弱', 6),
    ].join(' '),
  );
  lines.push(
    cohortRow({
      ...founderCohort,
      generation: 0,
    }),
  );
  for (const c of sampleCohorts(cohorts)) lines.push(cohortRow(c));
  lines.push('');

  lines.push('--- 能力別 平均素質値（創始世代 → 最終世代）---');
  const last = cohorts[cohorts.length - 1];
  if (last !== undefined) {
    for (const key of ['sp', 'st', 'pw', 'gt', 'iq'] as const) {
      const from = founderCohort.meanAbility[key];
      const to = last.meanAbility[key];
      const delta = from === 0 ? 0 : to / from - 1;
      lines.push(
        `  ${key.toUpperCase()}: ${pad(from.toFixed(1), 7)} → ${pad(to.toFixed(1), 7)}  (${delta >= 0 ? '+' : ''}${pct(delta)})`,
      );
    }
  }
  lines.push('');

  const tailCorr = cohorts.slice(-20).map((c) => c.parentOffspringCorrelation);
  if (tailCorr.length > 0) {
    const avg = tailCorr.reduce((a, b) => a + b, 0) / tailCorr.length;
    lines.push(
      `--- 血統の効き（健全性指標・正典 §1.1/§1.4-3）---\n` +
        `  中間親と産駒の能力相関（最終${tailCorr.length}世代平均）: ${avg.toFixed(3)}` +
        `   ※ 低すぎると「血をつなぐ」意味が失われる`,
    );
    lines.push('');
  }

  lines.push('--- 検証結果（正典 §13.2）---');

  // V-1
  const v1 = verification.v1;
  lines.push(
    `V-1 同一配合${options.v1Repeats}回の potential ばらつき（能力別CVの平均）` +
      `  目標 ${pct(v1.target[0], 0)}〜${pct(v1.target[1], 0)}`,
  );
  for (const cp of v1.checkpoints) {
    const mark = cp.generation === v1.primaryGeneration ? '←判定' : '';
    lines.push(`    第${pad(cp.generation, 3)}世代: CV=${pct(cp.meanCv)}  ${mark}`);
  }
  const primaryCp = v1.checkpoints.find((c) => c.generation === v1.primaryGeneration);
  if (primaryCp !== undefined) {
    for (const p of primaryCp.pairs) {
      lines.push(
        `      ${p.sireId} × ${p.damId}  F=${p.inbreedCoeff.toFixed(4)}  ` +
          `平均合計=${p.meanPotentialTotal.toFixed(0)}  CV=${pct(p.meanCv)}`,
      );
    }
  }
  lines.push(`    → ${verdict(v1.pass)}  実測 ${pct(v1.primaryMeanCv)}`);
  lines.push('');

  // V-2
  const v2 = verification.v2;
  lines.push(`V-2 100世代後の平均能力（血統インフレ）  目標 初期比 +${pct(v2.targetMax, 0)} 以内`);
  lines.push(
    `    初期(創始世代)=${v2.initialMeanAbilityTotal.toFixed(1)}  ` +
      `最終=${v2.finalMeanAbilityTotal.toFixed(1)}  ` +
      `最終5世代平均=${v2.finalMeanAbilityTotalSmoothed.toFixed(1)}`,
  );
  lines.push(
    `    → ${verdict(v2.pass)}  実測 ${v2.ratio >= 0 ? '+' : ''}${pct(v2.ratio)}  ` +
      `(平滑後 ${v2.ratioSmoothed >= 0 ? '+' : ''}${pct(v2.ratioSmoothed)})`,
  );
  lines.push('');

  // V-3
  const v3 = verification.v3;
  lines.push(`V-3 発生率  目標 設定値 ±${(v3.tolerancePt * 100).toFixed(1)}pt`);
  for (const [label, stat] of [
    ['隔世遺伝  ', v3.atavism],
    ['大物覚醒  ', v3.bigAtavism],
    ['大突然変異', v3.bigMutation],
  ] as const) {
    lines.push(
      `    ${label}: 設定 ${pct(stat.target, 2)}  実測 ${pct(stat.rate, 3)}  ` +
        `(${stat.hits}/${stat.rolls})  乖離 ${(stat.deviationPt * 100).toFixed(3)}pt  ${verdict(stat.pass)}`,
    );
  }
  lines.push(`    → ${verdict(v3.pass)}`);
  lines.push('');

  lines.push('='.repeat(112));
  lines.push(`総合判定: ${verdict(verification.pass)}`);
  lines.push('='.repeat(112));

  return lines.join('\n');
}
