/**
 * ★**ライバルの当たりやすさの天井 — 齢の窓の重なり**（★2026-10-03・裁定 `REVIEW_D126_D131_MINIMAL_VERDICT_20261003.md` §1 ①）。
 *
 * 【★何を数えるか】
 *   ★看板馬（ライバル）は その年の第 1 週に生まれる（★案 C）。★利用者の仔は 同じ年の b 週目に生まれる（b = 0〜51）。
 *   ★出走条件は ★**その馬の誕生週からの週齢**で決まる（`entryConditionsOf`・`meetsEntryConditions`）ので、★同じ年の生まれでも 窓が b 週ずれる。
 *   ★仔が出走条件を満たすレース（★番組表のサイクル）のうち、★**ライバルも同じ条件を満たす割合**を数える。
 *   ★これは ★**天井**: ★クラス（未勝利・1 勝…）・距離・馬場・出走の間隔・故障・キャリア上限（40 走）は 見ていない。★それらは割合を下げる向きにしか働かない。
 *
 * ★決定論: ★番組表と重賞の暦は サイクル番号だけから決まる（`classOf`・`gradedRaceAt`）。★乱数は使わない。
 *
 * 実行: `npx tsx apps/cli/src/rival-age-overlap.ts`
 */
import {
  CYCLES_PER_WEEK, LIFECYCLE_WEEKS, WEEKS_PER_YEAR,
  dailyProgramme, gradedRaceAt, entryConditionsOf, meetsEntryConditions,
} from '@star/scheduler';

type Sex = 'male' | 'female';

/** ★基準の年（★暦は 52 週で巡るので どの年でも同じ。★負の週を避けるだけ） */
const baseYear = 10;

interface Count { readonly all: number; readonly both: number; readonly gradedAll: number; readonly gradedBoth: number }

const programme = dailyProgramme();

export function countOverlap(foalBirthOffset: number, foalSex: Sex, rivalSex: Sex): Count {
  const yearStart = baseYear * WEEKS_PER_YEAR;
  const rivalBirth = yearStart;
  const foalBirth = yearStart + foalBirthOffset;
  let all = 0; let both = 0; let gradedAll = 0; let gradedBoth = 0;
  for (let week = foalBirth + LIFECYCLE_WEEKS.raceableFrom; week < foalBirth + LIFECYCLE_WEEKS.retireAt; week += 1) {
    for (let c = week * CYCLES_PER_WEEK; c < (week + 1) * CYCLES_PER_WEEK; c += 1) {
      const graded = gradedRaceAt(c, programme);
      const cond = entryConditionsOf(graded === null ? null : { age: graded.age, fillies: graded.fillies });
      if (!meetsEntryConditions(cond, { sex: foalSex, ageWeeks: week - foalBirth })) continue;
      const rivalAge = week - rivalBirth;
      const rivalOk = rivalAge < LIFECYCLE_WEEKS.retireAt && meetsEntryConditions(cond, { sex: rivalSex, ageWeeks: rivalAge });
      all += 1; if (rivalOk) both += 1;
      if (graded !== null) { gradedAll += 1; if (rivalOk) gradedBoth += 1; }
    }
  }
  return { all, both, gradedAll, gradedBoth };
}

const pct = (n: number, d: number): string => (d === 0 ? '   —  ' : `${((100 * n) / d).toFixed(1).padStart(5)}%`);

function main(): void {
  const pairs: readonly (readonly [Sex, Sex])[] = [['male', 'male'], ['female', 'female'], ['female', 'male'], ['male', 'female']];
  console.log('★ライバルの当たりやすさの天井（齢・牝馬限定だけ・クラス等は見ない）');
  console.log('★仔の誕生週 b ／ 仔とライバルの性 ／ 仔が出られるレースのうち ライバルも出られる割合（全体・重賞だけ）');
  for (const [foalSex, rivalSex] of pairs) {
    console.log(`\n仔 ${foalSex === 'male' ? '牡' : '牝'} × ライバル ${rivalSex === 'male' ? '牡' : '牝'}`);
    let sumAll = 0; let sumGraded = 0;
    for (let b = 0; b < WEEKS_PER_YEAR; b += 1) {
      const r = countOverlap(b, foalSex, rivalSex);
      sumAll += r.both / r.all; sumGraded += r.gradedAll === 0 ? 0 : r.gradedBoth / r.gradedAll;
      if (b % 13 === 0 || b === WEEKS_PER_YEAR - 1) console.log(`  b=${String(b).padStart(2)}  全体 ${pct(r.both, r.all)}  重賞 ${pct(r.gradedBoth, r.gradedAll)}（${r.gradedBoth}/${r.gradedAll}）`);
    }
    console.log(`  ★誕生週が一様なときの平均  全体 ${pct(sumAll, WEEKS_PER_YEAR)}  重賞 ${pct(sumGraded, WEEKS_PER_YEAR)}`);
  }
}

main();
