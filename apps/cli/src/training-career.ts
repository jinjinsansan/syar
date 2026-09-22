/**
 * ★育成方針とキャリア 1 本の週送り — **V-14 と帯のゲートが同じ経路を通るための共有モジュール**
 *
 * 【★なぜ切り出したか】
 *   ★D-079 ④ の「下のゲート」（**初期馬が適切な育成でキャリア中に少なくとも 1 勝できること**）を
 *   測るには、**V-14 と同じ育成**を通した馬が要ります。
 *   ★ここを写して 2 か所に持つと、**必ず離れます** — この案件は同じ形で繰り返し失敗しています
 *   （`CLAMP_TRUNCATION_FACTOR` の二重管理＝L-2、生成側と確定側で別々に引いていたレース条件＝D-052、
 *   自作の枠×ロス相関が `laneExtraM` と 0.473 対 0.013 に離れた件＝R-30）。
 *   → **方針の定義と週送りは、この 1 ファイルだけが持ちます。**
 *
 * 【★この切り出しで振る舞いを変えていないこと】
 *   ★`verify-v14.ts` の出力が**切り出しの前後で一致する**ことを実測で確かめています
 *   （`tmp/v14-before.txt` と突き合わせ）。★乱数の与え方（`deriveRng(seed, stream, horseIndex*1000+week)`）も
 *   **そのまま**です。★`seed` だけがモジュール変数から引数になりました。
 *
 * 【★足したもの（V-14 の判定には入りません）】
 *   ★`stats` / `potential` / `retireWeek` を返します。**育て終わった馬をレースに出す**ために要ります。
 *   ★既存の戻り値は 1 つも削っていません。
 */
import {
  ABILITY_KEYS, deriveRng, type AbilityKey, type HorseRecord, type Rng,
} from '@star/sim-engine';
import {
  DEFAULT_MENU, MENU_IDS, advanceWeek, initialState,
  type HorseTraits, type MenuId, type TrainingState,
} from '@star/training';
import { LIFECYCLE_WEEKS } from '@star/scheduler';

/** 育成方針 */
export type Policy = 'neglect' | 'balanced' | 'hard_only';

/**
 * ★**「適切な育成」の代表方針**（D-079 ④ の下のゲートが言う「適切な育成」）。
 *
 * ⚠️ ★**測る側が方針を選ばない**ようにここに固定します。
 *    `packages/training/src/temper.ts:67` が `balanced` を「代表方針」と記録しており、
 *    V-14 ① の「適切な育成が 88% 以上」も `balanced` で測っています。**同じものを指します。**
 */
export const APPROPRIATE_POLICY: Policy = 'balanced';

/**
 * その週のメニューを決める。
 * ★放置は「指示を出さない週＝軽め調整」（§7.1）。
 */
export function chooseMenu(policy: Policy, week: number, fatigue: number): MenuId {
  if (policy === 'neglect') return DEFAULT_MENU;
  if (policy === 'hard_only') {
    // ★追い切り偏重。疲労が振り切れたら休むしかない（そうしないと確実に故障する）
    return fatigue >= 85 ? 'rest' : 'hard';
  }
  // バランス型: 疲労を見ながら回す
  if (fatigue >= 70) return 'rest';
  const cycle = week % 4;
  if (cycle === 0) return 'hard';
  if (cycle === 1) return 'hill';
  if (cycle === 2) return 'wood';
  return 'light';
}

export interface CareerResult {
  /** 引退時の素質開放率（current/potential の平均） */
  readonly unlock: number;
  readonly injuries: number;
  readonly careerEnded: boolean;
  readonly epSpent: number;
  /** 現役週数（早期引退なら短い） */
  readonly weeks: number;
  /** ★分解用: メニュー別の週数 */
  readonly menuWeeks: Record<MenuId, number>;
  /** ★分解用: 故障の休養に費やした週数 */
  readonly injuryRestWeeks: number;
  /** ★分解用: 調子の平均 */
  readonly conditionMean: number;
  /** ★分解用: 疲労の平均 */
  readonly fatigueMean: number;
  /** ★分解用: 恒久ダメージで失われた potential の割合 */
  readonly potentialLost: number;
  /** ★育て終わった能力（レースに出すのに要る。★V-14 の判定には入らない） */
  readonly stats: Record<AbilityKey, number>;
  /** ★育て終わった素質（恒久ダメージ適用後。★★の算出には**使わない** — ★は付与時の素質から出す） */
  readonly potential: Record<AbilityKey, number>;
  /** ★引退した週（`LIFECYCLE_WEEKS.retireAt` で寿命引退・それ未満なら早期引退） */
  readonly retireWeek: number;
}

/**
 * 1頭を78週から260週まで通す。
 *
 * ★**`advanceWeek`（週送りの合成器）を通します**（2026-08-11 の載せ替え）。
 *   以前はこの関数が**自前の週ループ**を持っており、
 *   - §7.6 のイベントを一度も引かない
 *   - §7.2 の気性変化（temperDelta）を適用しない
 *   状態で測っていました。**較正した経路と、遊びの経路が別物**だったということです。
 *   R-23 は「いつの証拠か」でしたが、これは「**どの経路の証拠か**」の失効です。
 *
 * ★平均の取り方を旧ループに合わせています（調子・疲労は**その週を進める前**の値）。
 *   ここを後の値に変えると、載せ替え以外の理由で数字が動きます。
 */
export function runCareer(
  horse: HorseRecord,
  policy: Policy,
  horseIndex: number,
  seed: number,
  /**
   * ★**その週が済んだときの `stats` を覗く**（★任意・★**GB-1 ④**・2026-09-19）。
   *
   * 【★なぜ引数で足すのか】
   *   ★「育った実感」を何回 言うかを測るには、★**一生ぶんの週ごとの `stats`** が要ります。
   *   🔴 ★別に週ループを書くと ★**測る経路と較正した経路が別物**になります
   *     （★2026-08-11 に、まさにそれで §7.6 のイベントを引かないまま測っていました）。
   *   → ★**同じループから覗きます**（R-30・「測定器は評価者と同じ入力を見る」）。
   *
   * ⚠️ ★**渡しても振る舞いは 1 ビットも変わりません**（★読むだけ・乱数を消費しません）。
   */
  onWeek?: (week: number, stats: Readonly<Record<AbilityKey, number>>) => void,
  /**
   * ★**調教を始める週齢**（★任意・★PLAN Q-1 の案 B の模擬・2026-09-22）。
   *   ★省けば `LIFECYCLE_WEEKS.trainableFrom`（★78）で、★**振る舞いは 1 ビットも変わりません**。
   *   ⚠️ ★0 を渡しても ★**規則は変わりません**。★「もし 0 週から調教できたら」を測るためだけの入口です。
   */
  startWeek: number = LIFECYCLE_WEEKS.trainableFrom,
): CareerResult {
  const traits: HorseTraits = {
    sex: horse.sex, growth: horse.growth,
    injuryRateMult: horse.injuryRateMult, birthTemper: horse.temper,
  };
  let state: TrainingState = {
    ...initialState({
      potential: horse.potential, current: horse.stats,
      durability: horse.durability, temper: horse.temper,
    }),
    ageWeeks: startWeek,
  };

  let injuries = 0;
  let epSpent = 0;
  const menuWeeks = Object.fromEntries(MENU_IDS.map((m) => [m, 0])) as Record<MenuId, number>;
  const potential0 = { ...horse.potential } as Record<AbilityKey, number>;
  let injuryRestWeeks = 0;
  let condSum = 0;
  let fatSum = 0;
  let weeksCounted = 0;

  while (state.retirement === null) {
    const week = state.ageWeeks;
    // ★進める「前」の値を積む（旧ループと同じ）
    condSum += state.condition;
    fatSum += state.fatigue;
    weeksCounted += 1;

    const r = advanceWeek({
      state,
      traits,
      menu: chooseMenu(policy, week, state.fatigue),
      // ★B-1 が通す経路と同じ条件で測る。false に戻すと
      //   「較正した経路と遊びの経路が別物」に逆戻りします
      enableEvents: true,
      rngFor: (stream: number): Rng => deriveRng(seed, stream, horseIndex * 1000 + week),
      // ★案 B の模擬だけ（★既定の開始週なら渡さない ＝ 較正した経路と 1 ビット同じ）
      ...(startWeek === LIFECYCLE_WEEKS.trainableFrom ? {} : { trainableFromForSimulation: startWeek }),
    });
    menuWeeks[r.log.menu] += 1;
    if (r.log.resting) injuryRestWeeks += 1;
    if (r.log.injury !== null) injuries += 1;
    epSpent += r.log.epSpent;
    state = r.state;
    onWeek?.(week, state.current as Record<AbilityKey, number>);
  }

  const { potential, current } = state;
  let sum = 0;
  for (const k of ABILITY_KEYS) sum += potential[k] > 0 ? current[k] / potential[k] : 0;
  let lost = 0;
  for (const k of ABILITY_KEYS) lost += potential0[k] > 0 ? 1 - potential[k] / potential0[k] : 0;
  return {
    unlock: sum / ABILITY_KEYS.length,
    injuries, careerEnded: state.careerEnded, epSpent,
    weeks: state.ageWeeks - startWeek,
    menuWeeks, injuryRestWeeks,
    conditionMean: weeksCounted > 0 ? condSum / weeksCounted : 0,
    fatigueMean: weeksCounted > 0 ? fatSum / weeksCounted : 0,
    potentialLost: lost / ABILITY_KEYS.length,
    stats: { ...current } as Record<AbilityKey, number>,
    potential: { ...potential } as Record<AbilityKey, number>,
    retireWeek: state.ageWeeks,
  };
}
