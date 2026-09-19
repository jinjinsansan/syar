/**
 * ★**距離ロスの指紋が、直す前のコミットと変わらない**（★ES 便 ES-1・2026-09-15 ／ ★ES-5 で許容差つきに書き直し・2026-09-16）
 *
 * 【★見ている壊れ方】★ES 便で `lane.ts` を速くしたとき、★着順・スコア・距離ロス・走破タイム・画面の `w` が
 *   ★**丸めより大きく変わる**こと（★1 レース 1 回の値を距離だけで決めた・馬ごとの値を別の枠で作った・分解の係数を取り違えた 等）。
 * 【★期待値】`lane-fingerprint.expected.json`（★`884019c`＝`cfc3ad1` と同じエンジンで `lane-fingerprint.gen.ts` が書いた値・★作り直さない・R-16）。
 * 【★範囲】`lane-fingerprint.cases.ts` の註記（10 場・既定の楕円・半径 4 つ違い・直線 × 7 距離 × 8・18 頭 × シード 20）。
 *
 * 【★ES-5 で書き直した理由】（回答 `REVIEW_ENGINE_LANE_SPEED_ES3_ANSWER_20260916.md` §4-2 検査 1・★オーナー承認 F-1）
 *   ★ES-5 の分解の式は ★**同じ和を並べ替えるだけ**ですが、★浮動小数の足す順番が変わるので ★距離ロスが丸めの幅（≤ 10⁻¹³ m）で動きます。
 *   ★F-1 で「1 ビットも変えない」は「★丸めの差だけ（≤ 1×10⁻⁹ m・★着順は完全一致）」に緩めました。
 *   ⚠️ ★期待値のファイルは ★**指紋（ハッシュ）しか持っていない**ので、★数の差を直接は測れません。そこで ★2 段で比べます:
 *     ① ★**ループの経路**（`laneExtraMOnPlanLoop`・★ES-3 の刻みの計算）で回した指紋が、★期待値と **1 ビットも同じ**
 *        → ★ループの経路は ★`884019c` の結果そのもの、と言えます
 *     ② ★**本番の経路**（分解の式）で回した数を、★①と同じ実行で作ったループの経路の数と ★**許容差つき**で比べる
 *        → ★本番の経路は ★`884019c` から ★丸めの差しか離れていない、と言えます
 *   ★ループの経路を `resolveRace` の中まで通すため、★この検査の中だけ `../src/lane.js` の `laneExtraMOnPlan` を切り替えます
 *   （★製品のコードに切替口を足さない・回答 §Q-2「状態を持たない」）。
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const mode = vi.hoisted(() => ({ loop: false }));

vi.mock('../src/lane.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/lane.js')>();
  return {
    ...orig,
    laneExtraMOnPlan: (...a: Parameters<typeof orig.laneExtraMOnPlan>) =>
      (mode.loop ? orig.laneExtraMOnPlanLoop(...a) : orig.laneExtraMOnPlan(...a)),
  };
});

const lane = await import('../src/lane.js');
const {
  fingerprintCases, fingerprintRowsOf, digestOfRows, FINGERPRINT_HEADS, FINGERPRINT_SEEDS, LANE_AT_STEP_M,
} = await import('./lane-fingerprint.cases.js');
type Rows = ReturnType<typeof fingerprintRowsOf>;
type Case = ReturnType<typeof fingerprintCases>[number];
/** ★②（★生きた較正で 2 経路を突き合わせる）に使う。★①は凍結した値を使う */
const { DEFAULT_RACE_BALANCE } = await import('../src/index.js');
type RaceBalance = typeof DEFAULT_RACE_BALANCE;

const file = JSON.parse(readFileSync(new URL('./lane-fingerprint.expected.json', import.meta.url), 'utf8')) as {
  engineCommit: string; heads: number[]; seeds: number; laneAtStepM: number; cases: number; expected: Record<string, string>;
};

/** ★許容差（回答 §4-2 検査 1） */
const LANE_TOL_M = 1e-9;
const SCORE_REL_TOL = 1e-12;
const TIME_TOL_SEC = 1e-9;

/**
 * ★**凍結した較正**（★`884019c` 時点の値・★2026-09-19 に分けました）。
 *
 * 🔴 ★以前は①も②も `DEFAULT_RACE_BALANCE` を読んでいました。
 *   → ★**M-9（`CONDITION_MIN` 1→0）だけで、★① が 182 組 落ちました。**
 *   ★この番人の主張は ★**「同じ入力なら `lane.ts` の 2 経路は 1 ビットも同じ」**であって、
 *   ★**較正値の主張ではありません** — ★守備範囲の外で落ちる番人でした（**R-30**）。
 *   ⚠️ 🔴 ★そのままにすると、★**較正のたびに誰かが作り直し**、★作り直した瞬間に
 *     ★`884019c` との繋がりが切れ、★**番人は何も守らなくなります。**
 *
 * → ★**①＝凍結した較正（過去との繋がり）** ★**②＝生きた較正（2 経路がいま一致するか）**の 2 本立て。
 * ⚠️ ★**どちらか片方だけだと、★較正を動かすたびに片目になります。**
 * ⚠️ ★`lane-fingerprint.balance.json` は ★**更新しない**（★JSON の `__provenance` にも書いてあります）。
 */
const frozen = JSON.parse(
  readFileSync(new URL('./lane-fingerprint.balance.json', import.meta.url), 'utf8'),
) as { __provenance: { engineCommit: string }; balance: RaceBalance };
const FROZEN_BALANCE = frozen.balance;

/**
 * ★ループの経路で回す（★`resolveRace` の中も・★`laneExtraM` を直接呼ぶ所も）。
 * ★`balance` を受け取ります — ★①は凍結、★②は生きた値。
 */
function loopRowsOf(c: Case, balance: RaceBalance): Rows {
  mode.loop = true;
  try {
    return fingerprintRowsOf(c, (gate, heads, distance, seed, course) =>
      lane.laneExtraMOnPlanLoop(lane.lanePlanOf(distance, course), gate, heads, seed), balance);
  } finally {
    mode.loop = false;
  }
}

/** ★①用（凍結） */
const frozenMemo = new Map<string, Rows>();
const frozenLoopRows = (c: Case): Rows => {
  let r = frozenMemo.get(c.key);
  if (r === undefined) { r = loopRowsOf(c, FROZEN_BALANCE); frozenMemo.set(c.key, r); }
  return r;
};
/** ★②用（生きた較正） */
const liveMemo = new Map<string, Rows>();
const liveLoopRows = (c: Case): Rows => {
  let r = liveMemo.get(c.key);
  if (r === undefined) { r = loopRowsOf(c, DEFAULT_RACE_BALANCE); liveMemo.set(c.key, r); }
  return r;
};

describe('★距離ロスの指紋（ES 便）', () => {
  it('★期待値のファイルと、いまの対象の組が同じ（★範囲を黙って減らさない）', () => {
    const cases = fingerprintCases();
    expect(file.heads).toEqual([...FINGERPRINT_HEADS]);
    expect(file.seeds).toBe(FINGERPRINT_SEEDS);
    expect(file.laneAtStepM).toBe(LANE_AT_STEP_M);
    expect(cases.map((c) => c.key).sort()).toEqual(Object.keys(file.expected).sort());
    /** ★対照: 10 場・既定・半径 4 つ違い・直線 × 7 距離 × 2 頭数 */
    expect(cases.length).toBe((10 + 3) * 7 * 2);
  });

  it('★凍結した較正の素性があり、★①と②が別の値を見ている（★VP-8）', () => {
    /**
     * 🔴 ★**これが無いと、★②を①と同じ凍結値に戻しても誰も気づきません。**
     *   ★そうなると ★**「いまの較正で 2 経路が一致するか」を見る目が消えます**（★片目になる）。
     */
    expect(frozen.__provenance.engineCommit, '★凍結値に「いつの値か」が無い').toBe(file.engineCommit);
    /** ★凍結値と生きた値の違いを数えて出す（★黙って同じにならない） */
    const keys = Object.keys(FROZEN_BALANCE) as (keyof RaceBalance)[];
    const diff = keys.filter((k) => JSON.stringify(FROZEN_BALANCE[k]) !== JSON.stringify(DEFAULT_RACE_BALANCE[k]));
    console.log(`[指紋] 凍結値と生きた値の違い: ${diff.length} 項目${diff.length > 0 ? ` (${diff.join(', ')})` : ''}`);
    /**
     * ⚠️ ★**違いが 0 でも落としません** — ★較正を元に戻しただけかもしれない。
     *    ★落とすのは ★**凍結値と生きた値が、★同じオブジェクトになったとき**だけ。
     *    ★それは ★**分けたはずの 2 本が 1 本に戻った**ということだから。
     */
    expect(FROZEN_BALANCE, '★凍結値が生きた値そのものになっている（★①と②が同じものを見る）')
      .not.toBe(DEFAULT_RACE_BALANCE);
  });

  it(`① ★ループの経路は、すべての組で直す前のコミット（${file.engineCommit}）と 1 ビットも同じ指紋`, () => {
    const mismatches: string[] = [];
    for (const c of fingerprintCases()) {
      const got = digestOfRows(frozenLoopRows(c));
      if (got !== file.expected[c.key]) mismatches.push(`${c.key}: 期待 ${file.expected[c.key]} ／ いま ${got}`);
    }
    expect(mismatches.slice(0, 20), `★指紋が ${mismatches.length} 組で変わった`).toEqual([]);
  }, 300_000);

  it('② ★本番の経路（分解の式）は、ループの経路から丸めの差しか離れない（★馬・着順・着差の言葉は完全一致）', () => {
    const bad: string[] = [];
    let worstLane = 0;
    let worstScoreRel = 0;
    let worstTime = 0;
    let differing = 0;
    for (const c of fingerprintCases()) {
      const ref = liveLoopRows(c);
      const got = fingerprintRowsOf(c);
      expect(got.length).toBe(ref.length);
      for (let s = 0; s < ref.length; s += 1) {
        const a = ref[s]!;
        const b = got[s]!;
        const at = `${c.key} シード#${s}`;
        if (b.order.length !== a.order.length) { bad.push(`${at}: 頭数`); continue; }
        for (let i = 0; i < a.order.length; i += 1) {
          const x = a.order[i]!;
          const y = b.order[i]!;
          if (x.horseId !== y.horseId || x.finishPosition !== y.finishPosition || x.marginLabel !== y.marginLabel) {
            bad.push(`${at} ${i + 1}番目: ${x.horseId}/${x.finishPosition}/${x.marginLabel} → ${y.horseId}/${y.finishPosition}/${y.marginLabel}`);
            continue;
          }
          const dl = Math.abs(x.laneExtraM - y.laneExtraM);
          const ds = x.finalScore === y.finalScore ? 0 : Math.abs(x.finalScore - y.finalScore) / Math.max(Math.abs(x.finalScore), Math.abs(y.finalScore));
          const dt = Math.max(Math.abs(x.timeSec - y.timeSec), Math.abs(x.timeGapSec - y.timeGapSec));
          if (dl > 0) differing += 1;
          worstLane = Math.max(worstLane, dl); worstScoreRel = Math.max(worstScoreRel, ds); worstTime = Math.max(worstTime, dt);
          if (dl > LANE_TOL_M || ds > SCORE_REL_TOL || dt > TIME_TOL_SEC) bad.push(`${at} ${x.horseId}: ロス ${dl} ／ スコア相対 ${ds} ／ タイム ${dt}`);
        }
        if ((a.lx === undefined) !== (b.lx === undefined)) { bad.push(`${at}: lx の有無`); continue; }
        a.lx?.forEach((v, i) => {
          const d = Math.abs(v - b.lx![i]!);
          worstLane = Math.max(worstLane, d);
          if (d > LANE_TOL_M) bad.push(`${at} lx[${i}]: ${d}`);
        });
        /** ★画面の経路（`laneAt`）は分解を通らない → ★1 ビットも同じ */
        expect(b.la, `${at} laneAt`).toEqual(a.la);
      }
    }
    expect(bad.slice(0, 20), `★${bad.length} 件が許容差を超えた`).toEqual([]);
    /** ★対照: 本番の経路が本当に分解の式を通っている（★丸めの差が 1 つも無ければ、ループと同じものを比べている疑い） */
    expect(differing, '★距離ロスが丸めで動いた馬の数').toBeGreaterThan(0);
    console.log(`[ES-5 指紋] 最大の差: 距離ロス ${worstLane} m ／ スコア相対 ${worstScoreRel} ／ タイム ${worstTime} 秒 ／ 丸めで動いた馬 ${differing}`);
  }, 600_000);
});
