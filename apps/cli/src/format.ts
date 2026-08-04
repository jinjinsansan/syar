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
    pad(c.distanceCenter.mean.toFixed(0), 7),
    pad(c.distanceCenter.sd.toFixed(0), 7),
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

  lines.push('='.repeat(126));
  lines.push('STAR P0 — 遺伝エンジン 世代シミュレータ');
  lines.push('='.repeat(126));
  lines.push(
    `seed=${options.seed}  ${options.generations}ゲーム内年` +
      `（血統深度 約${(cohorts[cohorts.length - 1]?.meanGenerationDepth ?? 0).toFixed(1)}世代・実時間 約${((options.generations * 52 * 4) / 24 / 365).toFixed(1)}年相当）  ` +
      `繁殖牝馬=${options.population}  ` +
      `種牡馬プール=${options.stallionPool}  種付候補=上位${pct(options.stallionTopRatio, 0)}  ` +
      `成熟=${options.maturityYears}歳  補充=${options.recruit}  選抜h2=${options.selectionH2}`,
  );
  lines.push(
    `総配合数=${totals.matings}  生成馬数=${totals.horsesCreated}  未受胎(牝馬)=${totals.unbredMares}`,
  );
  lines.push(
    `MUTATION_SD=${result.balanceDigest.genetics.MUTATION_SD}  REGRESSION_RATE=${result.balanceDigest.regressionRate}` +
      `${result.balanceDigest.regressionRate === 0 ? '（★無効。血統インフレを抑える機構が働きません・正典 §6.4）' : '（正典 §6.4・D-008 の平均回帰が有効）'}`,
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
      pad('距離中心', 7),
      pad('距離SD', 7),
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

  // 距離適性の分化（F-3・正典 §5.2）
  if (last !== undefined) {
    lines.push('--- 距離適性の分化（正典 §5.2・P0-fix F-3）---');
    lines.push(
      `  distance_center: 創始 平均${founderCohort.distanceCenter.mean.toFixed(0)}m / SD${founderCohort.distanceCenter.sd.toFixed(0)}` +
        `  →  最終 平均${last.distanceCenter.mean.toFixed(0)}m / SD${last.distanceCenter.sd.toFixed(0)}`,
    );
    lines.push(
      `  distance_range : 創始 平均${founderCohort.distanceRange.mean.toFixed(0)} / SD${founderCohort.distanceRange.sd.toFixed(0)}` +
        `  →  最終 平均${last.distanceRange.mean.toFixed(0)} / SD${last.distanceRange.sd.toFixed(0)}`,
    );
    const sdRatio =
      founderCohort.distanceCenter.sd === 0
        ? 0
        : last.distanceCenter.sd / founderCohort.distanceCenter.sd;
    lines.push(
      `  ※ 集団SDが創始水準の何倍か: ${sdRatio.toFixed(2)}倍` +
        `（大きく広がるとマイラー／ステイヤーの分化が消え、縮むと全馬が同じ距離型になる）`,
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

  // V-2 系（D-008 で3基準に再定義 / D-009 で V-2d・V-2e を追加）
  const { v2a, v2b, v2c, v2d, v2e, legacyRatio } = verification;

  lines.push(`V-2a 平坦化: 最終${v2a.windowGenerations}世代の平均能力の傾き  目標 ±${v2a.targetAbsMax}%/世代 未満`);
  lines.push(
    `    → ${verdict(v2a.pass)}  実測 ${v2a.slopePctPerGeneration >= 0 ? '+' : ''}${v2a.slopePctPerGeneration.toFixed(4)}%/世代`,
  );
  lines.push('');

  lines.push(`V-2b 天井余裕: 集団平均能力 ÷ アレル上限  目標 ${pct(v2b.targetMax, 0)} 以下`);
  lines.push(
    `    平均能力(1種あたり)=${v2b.meanAbilityPerKey.toFixed(1)} / 上限=${v2b.alleleMax}`,
  );
  lines.push(`    → ${verdict(v2b.pass)}  実測 ${pct(v2b.ceilingRatio)}`);
  lines.push('');

  lines.push(
    `V-2c 長期健全性: ${v2c.evaluated ? v2c.generations : 300}ゲーム内年での V-1  ` +
      `目標 ${pct(v2c.target[0], 0)}〜${pct(v2c.target[1], 0)}`,
  );
  if (v2c.evaluated) {
    lines.push(`    → ${verdict(v2c.pass)}  実測 ${pct(v2c.v1MeanCv)}（${v2c.note}）`);
  } else {
    lines.push(`    → 未実行  ${v2c.note}`);
  }
  lines.push('');

  lines.push(
    `V-2d 全形質の水準維持: 集団平均が創始水準 ±${pct(v2d.targetAbsMax, 0)} 以内` +
      `（能力5種は方向性選抜で上がるのが正常なため判定対象外・参考表示）`,
  );
  const founderPheno = founderCohort.phenotypeMeans;
  const finalPheno = last?.phenotypeMeans;
  for (const t of v2d.traits) {
    const key = t.key as keyof typeof founderPheno;
    const pheno =
      founderPheno[key] === undefined || finalPheno === undefined
        ? ''
        : `  [表現型 ${founderPheno[key].toFixed(1)}→${finalPheno[key].toFixed(1)}]`;
    const unit = t.basis === 'sd' ? '創始SD' : t.basis === 'none' ? '判定不能' : '%';
    const value =
      t.basis === 'none'
        ? '—'
        : t.basis === 'sd'
          ? `${t.deviation >= 0 ? '+' : ''}${t.deviation.toFixed(3)}`
          : `${t.deviation >= 0 ? '+' : ''}${(t.deviation * 100).toFixed(2)}`;
    lines.push(
      `    ${pad(t.key, 16)}: 創始 ${pad(t.founderMean.toFixed(1), 8)} → 最終 ${pad(t.finalMean.toFixed(1), 8)}` +
        `  乖離 ${value}${unit}  ${verdict(t.pass)}${pheno}`,
    );
  }
  for (const t of v2d.abilityReference) {
    lines.push(
      `    ${pad(t.key, 16)}: 創始 ${pad(t.founderMean.toFixed(1), 8)} → 最終 ${pad(t.finalMean.toFixed(1), 8)}` +
        `  乖離 ${t.deviation >= 0 ? '+' : ''}${(t.deviation * 100).toFixed(2)}%  [参考]`,
    );
  }
  lines.push(
    `    → ${verdict(v2d.pass)}` +
      `${v2d.worstKey === null ? '' : `  最大乖離 ${v2d.worstKey} ${v2d.worstDeviation >= 0 ? '+' : ''}${(v2d.worstDeviation * 100).toFixed(2)}%`}`,
  );
  lines.push('');

  lines.push(
    `V-2e 非能力形質の分化: 集団SD  目標 創始比 ${v2e.target[0]}〜${v2e.target[1]}倍` +
      `（平均が保たれていても分散だけ壊れることがあるため別ゲート）`,
  );
  for (const t of v2e.traits) {
    lines.push(
      `    ${pad(t.key, 16)}: 創始 SD${pad(t.founderSd.toFixed(1), 8)} → 最終 SD${pad(t.finalSd.toFixed(1), 8)}` +
        `  ${t.ratio.toFixed(2)}倍  ${verdict(t.pass)}`,
    );
  }
  lines.push(
    `    → ${verdict(v2e.pass)}` +
      `${v2e.worstKey === null ? '' : `  最大乖離 ${v2e.worstKey} ${v2e.worstRatio.toFixed(2)}倍`}`,
  );
  lines.push('');

  lines.push(
    `[参考・判定外] 旧基準の初期比: ${legacyRatio.ratio >= 0 ? '+' : ''}${pct(legacyRatio.ratio)}` +
      `（初期 ${legacyRatio.initialMeanAbilityTotal.toFixed(1)} → 最終 ${legacyRatio.finalMeanAbilityTotal.toFixed(1)}）` +
      `  ※ ${legacyRatio.note}`,
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

  lines.push('='.repeat(126));
  lines.push(
    `総合判定: ${verdict(verification.pass)}` +
      `${v2c.evaluated ? '' : '  ※ V-2c は別実行で確認すること（--long-horizon 300）'}`,
  );
  lines.push('='.repeat(126));

  return lines.join('\n');
}
