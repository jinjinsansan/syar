/**
 * ★週送りの合成器。**部品ではなく「順序」を試験します。**
 *
 *   部品（成長・故障・調子・イベント）は各 test で確かめてあります。
 *   ここで壊れるとしたら **繋ぎ方** です。そして繋ぎ方の誤りは
 *   「一応最後まで通ってしまう」ので、**通ったことでは検出できません**（R-21）。
 *
 *   なので「1頭が260週まで通った」を PASS にせず、
 *   **各段階が実際に効いたか**を1つずつ固定します。
 */
import { describe, expect, it } from 'vitest';
import { ABILITY_KEYS, deriveRng, type AbilityKey, type Rng } from '@star/sim-engine';
import { LIFECYCLE_WEEKS } from '@star/scheduler';
import {
  MENUS,
  advanceWeek,
  initialState,
  type HorseTraits,
  type MenuId,
  type TrainingState,
} from '../src/index.js';

const rec = (v: number): Record<AbilityKey, number> =>
  Object.fromEntries(ABILITY_KEYS.map((k) => [k, v])) as Record<AbilityKey, number>;

const traits: HorseTraits = { sex: 'male', growth: 'normal', injuryRateMult: 1, birthTemper: 50 };

const start = (over: Partial<TrainingState> = {}): TrainingState => ({
  ...initialState({ potential: rec(700), current: rec(300), durability: 650, temper: 50 }),
  ...over,
});

/** 週齢だけを変えた乱数（同じ週で同じ結果になる） */
const rngFor = (seed: number, week: number) => (stream: number): Rng =>
  deriveRng(seed, stream, week);

const step = (state: TrainingState, menu: MenuId, opts: {
  seed?: number; events?: boolean; preferHonored?: boolean;
} = {}) =>
  advanceWeek({
    state,
    traits,
    menu,
    enableEvents: opts.events ?? false,
    rngFor: rngFor(opts.seed ?? 900, state.ageWeeks),
    ...(opts.preferHonored === undefined ? {} : { preferHonored: opts.preferHonored }),
  });

describe('★① 育成可能になる週（§7.1・境界の両側・R-2）', () => {
  it('78週未満は EP を使わず・成長せず・故障もしない', () => {
    const s = start({ ageWeeks: LIFECYCLE_WEEKS.trainableFrom - 1 });
    const r = step(s, 'hard');
    expect(r.log.epSpent).toBe(0);
    expect(r.log.injuryProb).toBe(0);
    expect(r.log.menu).toBe('rest'); // ★選んだ hard は無視される
    for (const k of ABILITY_KEYS) expect(r.log.gain[k]).toBe(0);
    expect(r.state.current).toEqual(s.current);
  });

  it('★78週ちょうどから EP を使い、成長する', () => {
    const s = start({ ageWeeks: LIFECYCLE_WEEKS.trainableFrom });
    const r = step(s, 'hill');
    expect(r.log.epSpent).toBe(MENUS.hill.epCost);
    expect(r.log.menu).toBe('hill');
    expect(r.log.gain.sp).toBeGreaterThan(0);
  });

  it('★放牧中も週齢だけは進む（進まないと永久に育成不可になる）', () => {
    const r = step(start({ ageWeeks: 10 }), 'hard');
    expect(r.state.ageWeeks).toBe(11);
  });
});

describe('★② 休養中の強制（§7.5）', () => {
  it('休養明けまではメニューが rest に差し替わり、EP を取られない', () => {
    const s = start({ ageWeeks: 100, restUntilWeek: 105 });
    const r = step(s, 'hard');
    expect(r.log.resting).toBe(true);
    expect(r.log.menu).toBe('rest');
    expect(r.log.epSpent).toBe(0); // rest の epCost は 0
    expect(r.log.injuryProb).toBe(0); // ★休養では故障しない
  });

  it('★休養明けの週（restUntilWeek ちょうど）は選んだメニューで動く（境界の両側）', () => {
    const s = start({ ageWeeks: 105, restUntilWeek: 105 });
    const r = step(s, 'hill');
    expect(r.log.resting).toBe(false);
    expect(r.log.menu).toBe('hill');
    expect(r.log.epSpent).toBe(MENUS.hill.epCost);
  });
});

describe('★③ 故障した週は成長しない（順序の要）', () => {
  /** 必ず故障する状況を作る: injuryRateMult を極端に上げる */
  const fragile: HorseTraits = { ...traits, injuryRateMult: 100000 };

  it('故障した週は gain が全部 0 で、疲労も調子も動かない', () => {
    const s = start({ ageWeeks: 150, fatigue: 30, condition: 4 });
    const r = advanceWeek({
      state: s, traits: fragile, menu: 'hard', enableEvents: false,
      rngFor: rngFor(901, s.ageWeeks),
    });
    expect(r.log.injury).not.toBeNull();
    for (const k of ABILITY_KEYS) expect(r.log.gain[k]).toBeLessThanOrEqual(0);
    expect(r.state.fatigue).toBe(30);
    expect(r.state.condition).toBe(4);
  });

  /**
   * ★週齢を進めて探してはいけません。260週で `canTrain` が false になり、
   *   故障判定そのものが止まります（最初にこれを踏んで「引けません」で落ちました）。
   *   週齢は固定し、**種だけを振ります**。
   */
  const findInjury = (pred: (r: ReturnType<typeof advanceWeek>) => boolean, tries = 400) => {
    const s = start({ ageWeeks: 150 });
    for (let seed = 0; seed < tries; seed += 1) {
      const r = advanceWeek({
        state: s, traits: fragile, menu: 'hard', enableEvents: false, rngFor: rngFor(2000 + seed, s.ageWeeks),
      });
      if (pred(r)) return r;
    }
    throw new Error('探している故障を引けませんでした');
  };

  it('★軽度以外なら restUntilWeek が先に進む（休養が実際に効く）', () => {
    const r = findInjury((x) => x.log.injury !== null && x.log.injury.restWeeks !== null && x.log.injury.severity !== 'mild');
    expect(r.state.restUntilWeek).toBe(r.log.week + r.log.injury!.restWeeks!);
    expect(r.state.restUntilWeek).toBeGreaterThan(r.log.week);
  });

  it('★致命的故障はその週に引退になる（休養に入らない）', () => {
    const r = findInjury((x) => x.log.injury?.careerEnding === true, 2000);
    expect(r.state.careerEnded).toBe(true);
    expect(r.state.retirement).not.toBeNull();
    expect(r.state.retirement!.reason).toBe('career_ending_injury');
    // ★正典 §7.5「繁殖入りは可能」
    expect(r.state.retirement!.breeds).toBe(true);
    // ★休養に入っていない（引退したので休養明けが来ない）
    expect(r.state.restUntilWeek).toBe(-1);
  });
});

describe('★④ 不変条件が週送りを通しても閉じている（B-4）', () => {
  it('260週まで通して current ≤ potential が一度も破れない', () => {
    let s = start();
    const fragile: HorseTraits = { ...traits, injuryRateMult: 30 };
    let weeks = 0;
    while (s.retirement === null) {
      weeks += 1;
      if (weeks > LIFECYCLE_WEEKS.retireAt + 5) throw new Error('引退しませんでした');
      const r = advanceWeek({
        state: s, traits: fragile, menu: 'hill', enableEvents: true,
        rngFor: rngFor(904, s.ageWeeks),
      });
      s = r.state;
      for (const k of ABILITY_KEYS) {
        expect(s.current[k], `week ${s.ageWeeks}/${k}`).toBeLessThanOrEqual(s.potential[k] + 1e-9);
      }
    }
  });
});

describe('★⑤ 引退（§7.1・境界の両側・R-2）', () => {
  it('259週を進めた結果 260週になり、そこで引退する', () => {
    const r = step(start({ ageWeeks: LIFECYCLE_WEEKS.retireAt - 1 }), 'light');
    expect(r.state.ageWeeks).toBe(LIFECYCLE_WEEKS.retireAt);
    expect(r.state.retirement).not.toBeNull();
    expect(r.state.retirement!.reason).toBe('age');
  });

  it('258週を進めた時点ではまだ引退しない', () => {
    const r = step(start({ ageWeeks: LIFECYCLE_WEEKS.retireAt - 2 }), 'light');
    expect(r.state.retirement).toBeNull();
  });

  it('★性別で行き先が変わる（牡=種牡馬 / 牝=繁殖牝馬）', () => {
    const at = LIFECYCLE_WEEKS.retireAt - 1;
    const male = advanceWeek({
      state: start({ ageWeeks: at }), traits, menu: 'light', enableEvents: false,
      rngFor: rngFor(905, at),
    });
    const female = advanceWeek({
      state: start({ ageWeeks: at }), traits: { ...traits, sex: 'female' }, menu: 'light',
      enableEvents: false, rngFor: rngFor(905, at),
    });
    expect(male.state.retirement!.role).toBe('stallion');
    expect(female.state.retirement!.role).toBe('broodmare');
  });

  it('★功労馬を選ぶと繁殖に上がらない', () => {
    const r = step(start({ ageWeeks: LIFECYCLE_WEEKS.retireAt - 1 }), 'light', { preferHonored: true });
    expect(r.state.retirement!.role).toBe('honored');
    expect(r.state.retirement!.breeds).toBe(false);
  });

  it('★引退した馬をもう一度進めようとすると落ちる（黙って年を取らせない）', () => {
    const r = step(start({ ageWeeks: LIFECYCLE_WEEKS.retireAt - 1 }), 'light');
    expect(() => step(r.state, 'light')).toThrow(/引退済み/);
  });
});

describe('★⑥ イベントは既定値を持たない（V-7/V-14 との差が見えるように）', () => {
  it('enableEvents=false なら1年回してもイベントが1件も出ない', () => {
    let s = start({ ageWeeks: 104 });
    let n = 0;
    for (let i = 0; i < 52; i += 1) {
      const r = step(s, 'hill', { seed: 906 });
      if (r.log.event !== null) n += 1;
      s = r.state;
    }
    expect(n).toBe(0);
  });

  it('★enableEvents=true なら出る（＝V-7/V-14 は別条件で測られていた）', () => {
    let s = start({ ageWeeks: 104 });
    let n = 0;
    for (let i = 0; i < 400; i += 1) {
      const r = step(s, 'hill', { seed: 906, events: true });
      if (r.log.event !== null) n += 1;
      s = r.state;
      if (s.retirement !== null) break;
    }
    expect(n).toBeGreaterThan(0);
  });
});

describe('★⑦ 決定論（憲法④）', () => {
  it('同じ種で同じ一生になる', () => {
    const run = () => {
      let s = start();
      const hist: number[] = [];
      while (s.retirement === null) {
        const r = advanceWeek({
          state: s, traits, menu: 'hill', enableEvents: true, rngFor: rngFor(907, s.ageWeeks),
        });
        hist.push(r.log.gain.sp, r.log.fatigue, r.log.condition);
        s = r.state;
      }
      return hist;
    };
    expect(run()).toEqual(run());
  });

  it('★種が違えば違う一生になる（乱数が実際に効いている）', () => {
    const run = (seed: number) => {
      let s = start();
      let sp = 0;
      while (s.retirement === null) {
        const r = advanceWeek({
          state: s, traits, menu: 'hill', enableEvents: true, rngFor: rngFor(seed, s.ageWeeks),
        });
        s = r.state;
        sp = s.current.sp;
      }
      return sp;
    };
    expect(run(908)).not.toBe(run(909));
  });
});

describe('★⑧ EP は引き落とさず、金額を返すだけ（憲法③・G-6）', () => {
  it('メニューごとの EP が §7.2 の表と一致する', () => {
    for (const menu of ['hill', 'wood', 'pool', 'gate', 'partner', 'hard', 'light', 'rest'] as MenuId[]) {
      const r = step(start({ ageWeeks: 120 }), menu, { seed: 910 });
      // ★故障した週は成長しないが、EP は既に払っている
      expect(r.log.epSpent, menu).toBe(MENUS[menu].epCost);
    }
  });
});
