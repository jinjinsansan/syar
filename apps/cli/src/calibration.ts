/**
 * 較正定数の登録簿（Q-3）
 *
 * 【なぜ登録簿にするのか】
 *   「較正に効く定数を新設したら、同じ便で変異項目も追加する」という**手順**は、
 *   守る努力に依存する限り漏れ続けます。実際 P1-fix2 の1便で
 *   `OVERSAMPLE_RATIO` / `FLOOR_REDRAW_PASSES` / `FLOOR_FIELD_SIZE_SLOPE` の3つを
 *   無防備なまま増やしました（＝手順は機能しなかった）。
 *
 * 【構造で強制する】
 *   1. 較正定数はすべてここに登録する
 *   2. `apps/cli/test/calibration-registry.test.ts` が、走査対象ファイルの
 *      **数値の `export const` で未登録のものがあれば落ちる**
 *   3. 変異試験ハーネスは**この登録簿から変異項目を自動生成**する
 *      （`tools/mutation/run.mjs`）。防御するテストが無ければ `npm run mutation` が落ちる
 *
 *   → **新しい較正定数は、登録と防御テストの両方が無いと追加できません。**
 */

/**
 * 宣言行を**値に依存せず**特定する正規表現。
 *
 * ★当初は宣言文字列そのものを登録簿に持たせ、テストで一字一句一致を検査していた。
 *   ところがそれだと**較正定数を摂動した瞬間にその照合テストが落ちる**ため、
 *   変異試験の13件すべてが「登録簿テストが落ちただけ」で「守られている」と読めていた。
 *   検出器が自分自身を検出していた（R-9 の一般形）。値に依存しない形にする。
 */
export function declarationPattern(key: string): RegExp {
  return new RegExp(`^export const ${key}\\s*[:=].*$`, 'm');
}

export interface CalibrationConstant {
  /** 定数名 */
  key: string;
  /** 宣言があるファイル（リポジトリルートからの相対パス） */
  file: string;
  /** 摂動後の宣言。**判定に効くなら、これでテストが落ちなければならない** */
  perturbed: string;
  /** 何に効く定数か（報告書と照会に使う） */
  affects: string;
}

/**
 * ★摂動値の選び方: 「その定数を実質無効化する値」か「明確に別の較正点」を選ぶ。
 *   微小な変更にすると、テストの許容幅の内側に収まって落ちず、
 *   「防御されている」と誤って読める（＝R-9 の一般形）。
 */
export const CALIBRATION: readonly CalibrationConstant[] = [
  {
    key: 'CALIBRATED_RACE_RANDOM_K',
    file: 'packages/race-engine/src/balance.ts',
    perturbed: 'export const CALIBRATED_RACE_RANDOM_K = 0.12;',
    affects: 'V-4 / V-5 / V-6（乱数の荒れ具合。正典 §13.1・D-016）',
  },
  {
    key: 'PLACEHOLDER_UNLOCK',
    file: 'apps/cli/src/race-field.ts',
    perturbed: 'export const PLACEHOLDER_UNLOCK = { MIN: 0.3, MAX: 0.95 } as const;',
    affects: 'V-4 / V-6（レース内スコア分散の最大要因。K の較正条件・R-7）',
  },
  {
    key: 'DEFAULT_CLASS_BAND',
    file: 'apps/cli/src/race-field.ts',
    perturbed: 'export const DEFAULT_CLASS_BAND = 1.0;',
    affects: 'V-4（クラス分け。正典 §10.4・D-018）',
  },
  {
    key: 'OFF_SURFACE_ENTRY_RATE',
    file: 'apps/cli/src/race-field.ts',
    perturbed: 'export const OFF_SURFACE_ENTRY_RATE = 1.0;',
    affects: 'V-2f（混合番組が万能型を有利にし、芝/ダート適性を押し上げる）',
  },
  {
    key: 'DISTANCE_SUIT_MIN',
    file: 'apps/cli/src/race-field.ts',
    perturbed: 'export const DISTANCE_SUIT_MIN = 0;',
    affects: 'V-6（距離不適の馬が裾を伸ばす）',
  },
  {
    key: 'OFF_DISTANCE_ENTRY_RATE',
    file: 'apps/cli/src/race-field.ts',
    perturbed: 'export const OFF_DISTANCE_ENTRY_RATE = 1.0;',
    affects: 'V-6（同上）',
  },
  {
    key: 'FIELD_STRENGTH_FLOOR',
    file: 'apps/cli/src/race-field.ts',
    perturbed: 'export const FIELD_STRENGTH_FLOOR = 0.0;',
    affects: 'V-4 / V-6（1レース内の能力レンジの下限）',
  },
  {
    key: 'FLOOR_FIELD_SIZE_SLOPE',
    file: 'apps/cli/src/race-field.ts',
    perturbed: 'export const FLOOR_FIELD_SIZE_SLOPE = 0.0;',
    affects: 'V-6（頭数が増えるほど床を上げる。多頭数で裾が死ぬのを防ぐ）',
  },
  {
    key: 'OVERSAMPLE_RATIO',
    file: 'apps/cli/src/race-field.ts',
    perturbed: 'export const OVERSAMPLE_RATIO = 1;',
    affects: '出走頭数分布（正典 §10.4）。1 にすると床が頭数を削る＝Q-4 の元のバグ',
  },
  {
    key: 'FLOOR_REDRAW_PASSES',
    file: 'apps/cli/src/race-field.ts',
    perturbed: 'export const FLOOR_REDRAW_PASSES = 0;',
    affects: 'V-4 / V-6（床を割る馬の差し替え回数。0 なら床が効かない）',
  },
  {
    key: 'CLASS_PRIZE_TOP_MULT',
    file: 'apps/cli/src/racing-season.ts',
    perturbed: 'export const CLASS_PRIZE_TOP_MULT = 1;',
    affects: 'V-1（クラス係数。1 にすると絶対能力への選抜圧が消える）',
  },
  {
    key: 'FIELD_SIZE',
    file: 'apps/cli/src/race-field.ts',
    perturbed: 'export const FIELD_SIZE = { MIN: 8, MAX: 10 } as const;',
    affects:
      '出走頭数分布（正典 §10.4）。頭数が減れば1頭あたりの勝率は機械的に上がり、V-4/V-6 が動く',
  },
  {
    key: 'DEFAULT_POPULARITY_TRIALS',
    file: 'apps/cli/src/popularity.ts',
    perturbed: 'export const DEFAULT_POPULARITY_TRIALS = 3;',
    affects: 'V-4 / V-6（人気推定の試行数。測定の自由変数・R-12）',
  },
];

/**
 * 登録簿の走査対象。ここに挙げたファイルの**数値の `export const`** は
 * すべて登録されているか、`EXEMPT` に理由付きで載っていなければならない。
 */
export const CALIBRATION_SCAN_FILES: readonly string[] = [
  'apps/cli/src/race-field.ts',
  'apps/cli/src/racing-season.ts',
  'apps/cli/src/popularity.ts',
  'packages/race-engine/src/balance.ts',
];

/** 較正定数ではないもの（理由を必ず書く）。理由なしの免除は作らない */
export const EXEMPT: readonly { key: string; why: string }[] = [
  {
    key: 'NEUTRAL_CONDITION_APTITUDE',
    why: '馬場状態適性の中立値。P-1 で heavy_aptitude を genotype に入れたら消える暫定値で、判定の較正には使っていない',
  },
  {
    key: 'CLAMP_TRUNCATION_FACTOR',
    why: '正典 §13.1 の写し（参考値）。実際の計算は clampTruncationFactor() が解析式で出す',
  },
  {
    key: 'MUTATION_CLAMP_RATIO',
    why: '他の正典定数からの導出値であって、独立した較正対象ではない',
  },
];
