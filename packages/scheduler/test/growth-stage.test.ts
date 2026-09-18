/**
 * ★**育った実感の「成長」の層**（★**D-116**・2026-09-19）
 *
 * 【★D-116 ⑦ が求めた検査の形】
 *   > 「★**出してよい量を全数分類し、分類されていない量があれば落ちる**形にする
 *   > （★`0034` の `my-horses-view.test.ts` と同じ形。★**禁止語の一覧で書かない**・D-108 ③）」
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**段階が素質から導かれる**（D-116 ①。★開放率から導くと**段階が素質の代用品**になる）
 *   ② 🔴 ★**数値・割合・ランクが出る**（D-116 ②）
 *   ③ 🔴 ★**毎週必ず何かが出る**（D-116 ③。★出るほど符号列が積み上がる）
 *   ④ ★**層が混ざる**（D-116 ④。★疲労は「状態」であって「成長」ではない）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
/**
 * ⚠️ ★**段階と「伸びの言葉」は別の層にあります**。
 *   ★段階 … `@star/scheduler`（★`LIFECYCLE_WEEKS` を引くため）
 *   ★伸び   … `@star/sim-engine`（★`AbilityKey` を持つため）
 *   🔴 ★最初は両方を sim-engine に置き、★**`104` を直書きして写しを作っていました**。
 */
import {
  GROWTH_STAGES, GROWTH_STAGE_FROM_WEEKS, GROWTH_STAGE_LABEL,
  growthStageOf, growthStageAdvanced, LIFECYCLE_WEEKS, type GrowthStage,
} from '../src/index.js';
import {
  GROWTH_TELL_MIN, ABILITY_GROWTH_LABEL, growthTellsOf, type AbilityKey,
} from '@star/sim-engine';

const SRC = readFileSync(path.join(__dirname, '../src/growth-stage.ts'), 'utf8');
const TELLS_SRC = readFileSync(
  path.join(__dirname, '../../sim-engine/src/growth-stage.ts'), 'utf8');
/** ★註記の中の語は拾わない */
const strip = (t: string): string =>
  t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const LIVE = strip(SRC);
const LIVE_TELLS = strip(TELLS_SRC);

const stats = (v: number): Record<AbilityKey, number> => ({ sp: v, st: v, pw: v, gt: v, iq: v });

describe('★① 段階は年齢だけから導く（D-116 ①⑥）', () => {
  it('🔴 ★純関数が `stats` も `potential` も受け取らない', () => {
    /**
     * ★**入力の形で見ます**（D-108 ③ の作法・★禁止語の一覧で書かない）。
     * ★`growthStageOf` の引数は 1 つで、★その名前が週齢であること。
     */
    expect(growthStageOf.length, '★引数が 1 つでない').toBe(1);
    expect(LIVE, '★本文で stats を触っている').not.toMatch(/\bstats\b/);
    expect(LIVE, '★本文で potential を触っている').not.toMatch(/\bpotential\b/);
    expect(LIVE, '★開放率を作っている').not.toMatch(/unlock|開放率/);
  });

  it('★§7.1 の境目を使っている（★104 は正典そのもの）', () => {
    expect(GROWTH_STAGE_FROM_WEEKS.rising, '★現役の開始が §7.1 と違う')
      .toBe(LIFECYCLE_WEEKS.raceableFrom);
    /** ★現役の 156 週を 4 等分（★156 ÷ 4 ＝ 39 ちょうど） */
    const cuts = GROWTH_STAGES.map((s) => GROWTH_STAGE_FROM_WEEKS[s]);
    const inCareer = cuts.filter((w) => w >= LIFECYCLE_WEEKS.raceableFrom);
    for (let i = 1; i < inCareer.length; i += 1) {
      expect(inCareer[i]! - inCareer[i - 1]!, '★等分になっていない').toBe(39);
    }
    /** ★最後の段階が引退より前に始まる（★円熟期が 0 週にならない） */
    expect(GROWTH_STAGE_FROM_WEEKS.mature).toBeLessThan(LIFECYCLE_WEEKS.retireAt);
  });

  it('★境目の両側（R-2）', () => {
    for (const s of GROWTH_STAGES) {
      const at = GROWTH_STAGE_FROM_WEEKS[s];
      if (at === 0) continue;
      expect(growthStageOf(at), `★週齢 ${at} ちょうど`).toBe(s);
      expect(growthStageOf(at - 1), `★週齢 ${at - 1}`).not.toBe(s);
    }
  });

  it('★単調（年齢が進んで段階が戻らない）', () => {
    let prev = -1;
    for (let w = 0; w <= 400; w += 1) {
      const i = GROWTH_STAGES.indexOf(growthStageOf(w));
      expect(i, `★週齢 ${w}`).toBeGreaterThanOrEqual(prev);
      prev = i;
    }
  });

  it('★引退の後も段階は消えない（★引退は別の層）', () => {
    expect(growthStageOf(LIFECYCLE_WEEKS.retireAt)).toBe('mature');
    expect(growthStageOf(9999)).toBe('mature');
  });

  it('★段階が上がったかを言える', () => {
    expect(growthStageAdvanced(103, 104), '★デビューで上がる').toBe(true);
    expect(growthStageAdvanced(104, 105), '★同じ段階では上がらない').toBe(false);
    expect(growthStageAdvanced(200, 104), '★戻らない').toBe(false);
  });
});

describe('★② 数値・割合・ランクを出さない（D-116 ②）', () => {
  it('🔴 ★返すのは言葉と名前だけ', () => {
    /** ★段階は 5 つの言葉 */
    expect(Object.keys(GROWTH_STAGE_LABEL).sort()).toEqual([...GROWTH_STAGES].sort());
    for (const s of GROWTH_STAGES) {
      expect(GROWTH_STAGE_LABEL[s].length, `★${s} の言葉が空`).toBeGreaterThan(0);
      expect(GROWTH_STAGE_LABEL[s], `★${s} の言葉に数がある`).not.toMatch(/[0-9０-９%％]/);
    }
    /** ★伸びは「能力の名前」だけを返す（★差も割合も返さない） */
    const tells = growthTellsOf(stats(100), stats(200));
    expect(Array.isArray(tells)).toBe(true);
    for (const t of tells) expect(typeof t).toBe('string');
  });

  it('★能力の言い換えに数が無い', () => {
    for (const [k, label] of Object.entries(ABILITY_GROWTH_LABEL)) {
      expect(label, `★${k} の言い換えに数がある`).not.toMatch(/[0-9０-９%％]/);
    }
  });
});

describe('★③ 小さい変化は言わない（D-116 ③）', () => {
  it('🔴 ★閾値に届かなければ何も言わない（★毎週必ず出る形にしない）', () => {
    const before = stats(100);
    /** ★閾値の 1 つ下 */
    const tiny = { ...before, sp: 100 + GROWTH_TELL_MIN - 1 };
    expect(growthTellsOf(before, tiny), '★小さい変化を言っている').toEqual([]);
    /** ★閾値ちょうどは言う（★境界の両側・R-2） */
    const just = { ...before, sp: 100 + GROWTH_TELL_MIN };
    expect(growthTellsOf(before, just)).toEqual(['sp']);
  });

  it('★変化が無ければ空', () => {
    expect(growthTellsOf(stats(100), stats(100))).toEqual([]);
  });

  it('🔴 ★下がった能力は言わない（★§7.5 の恒久ダメージは「物語」の層・D-116 ④）', () => {
    const before = stats(200);
    const worse = { ...before, sp: 100 };
    expect(growthTellsOf(before, worse), '★下がったことを成長として言っている').toEqual([]);
  });

  it('★複数の能力が伸びたら、伸びたものだけを並べる', () => {
    const before = stats(100);
    const after = { ...before, sp: 100 + GROWTH_TELL_MIN, iq: 100 + GROWTH_TELL_MIN * 2 };
    expect(growthTellsOf(before, after).sort()).toEqual(['iq', 'sp']);
  });
});

describe('🔴 ★D-116 ⑦: 出してよい量が全数分類されている', () => {
  /**
   * ★**この層が外に出す量**を 1 つ残らず並べ、★**どれも「数値・割合・ランク」でないこと**を見ます。
   * ⚠️ ★**新しい export を足したら、ここに載るまで通れません**（R-19・R-29）。
   *    ★分類は「言葉」「名前」「較正の刻み」の 3 つだけで、
   *    ★**「その馬の量」を返すものは 1 つもあってはいけません**。
   */
  const EXPORTED: Readonly<Record<string, '言葉' | '名前' | '刻み' | '判定'>> = {
    GrowthStage: '名前',
    GROWTH_STAGES: '名前',
    GROWTH_STAGE_LABEL: '言葉',
    GROWTH_STAGE_FROM_WEEKS: '刻み',
    GROWTH_TELL_MIN: '刻み',
    ABILITY_GROWTH_LABEL: '言葉',
    growthStageOf: '名前',
    growthStageAdvanced: '判定',
    growthTellsOf: '名前',
  };

  it('★この層の公開名を実物から数え上げている（★手書きの一覧にしない）', () => {
    const re = /^export (?:declare )?(?:function|const|let|class|interface|type|enum) (\w+)/gm;
    // ⚠️ ★**2 つのファイル両方**を数えます（★層を分けたので、★片方だけ見ると目になります）
    const names = [...SRC.matchAll(re)].map((m) => m[1]!)
      .concat([...TELLS_SRC.matchAll(re)].map((m) => m[1]!));
    expect(names.length, '★公開名が読めていない（R-21）').toBeGreaterThan(5);
    const unclassified = names.filter((n) => EXPORTED[n] === undefined);
    /**
     * ⚠️ ★**ここが赤くなったら、名前を消して通してはいけません。**
     *    ★その量が ★**「その馬の数値・割合・ランク」でないこと**を確かめて、分類に足してください。
     *    ★数値を返すなら ★**D-116 ② に反します** — ★足すのではなく、返さない形に直してください。
     */
    expect(unclassified, '★分類されていない公開名').toEqual([]);
  });

  it('🔴 ★「その馬の量」を返すものが 1 つも無い', () => {
    /** ★分類に `量` が無いこと自体が判定です（★型で縛っています） */
    for (const kind of Object.values(EXPORTED)) {
      expect(['言葉', '名前', '刻み', '判定']).toContain(kind);
    }
    /** ★実際に呼んでも数が返らない（★段階は言葉、伸びは名前の並び） */
    const stage: GrowthStage = growthStageOf(150);
    expect(typeof stage).toBe('string');
    expect(typeof GROWTH_STAGE_LABEL[stage]).toBe('string');
  });
});

describe('★④ 層を混ぜない（D-116 ④）', () => {
  it('🔴 ★疲労・調子をこの層が触っていない（★「状態」の層）', () => {
    for (const other of ['fatigue', 'condition', '疲労', '調子']) {
      expect(LIVE, `★「状態」の層が混ざっている: ${other}`).not.toContain(other);
      expect(LIVE_TELLS, `★「状態」の層が混ざっている（伸び側）: ${other}`).not.toContain(other);
    }
  });

  it('🔴 ★発見（D-108）と物語（§18）も触っていない', () => {
    for (const other of ['discovery', 'aptitude', 'story', '適性', '物語']) {
      expect(LIVE, `★別の層が混ざっている: ${other}`).not.toContain(other);
      expect(LIVE_TELLS, `★別の層が混ざっている（伸び側）: ${other}`).not.toContain(other);
    }
  });
});
