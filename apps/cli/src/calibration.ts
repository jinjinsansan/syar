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
    perturbed: 'export const CALIBRATED_RACE_RANDOM_K = 0.26;',
    affects: 'V-4 / V-5 / V-6（乱数の荒れ具合。正典 §13.1・D-016）',
  },
  {
    key: 'TAIL_MIX_P_DEFAULT',
    file: 'packages/race-engine/src/balance.ts',
    perturbed: 'export const TAIL_MIX_P_DEFAULT = 0;',
    affects: 'V-6（案D: 大偏差を引く確率。0 にすると単一正規分布に戻り裾が死ぬ）',
  },
  {
    key: 'TAIL_MIX_M_DEFAULT',
    file: 'packages/race-engine/src/balance.ts',
    perturbed: 'export const TAIL_MIX_M_DEFAULT = 1;',
    affects: 'V-6（案D: 大偏差の幅の倍率。1 にすると単一正規分布に戻る）',
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
 * 走査対象**ディレクトリ**（S-4）。
 *
 * ★以前はファイルの手書きリストだった。それだと**新規ファイルに定数を置くと黙って漏れる** —
 *   Q-3 が排除したはずの「定数を作ったら手で登録する」が、
 *   「ファイルを作ったら手で走査対象に加える」に**一段上がっただけ**だった。
 *   実際 `POOL_GENERATIONS`（判定を決める自由変数）と `DEFAULT_RACE_BALANCE` が漏れていた。
 *   **走査は全件を既定にし、除外は明示する**向きに反転する。
 *
 *   → 一般化: **「構造で解決した」と言えるのは、構造の境界まで自動化されたときだけ。**
 */
export const CALIBRATION_SCAN_DIRS: readonly string[] = [
  'apps/cli/src',
  'packages/sim-engine/src',
  'packages/race-engine/src',
];

/** 走査から外すファイル（理由必須）。新規ファイルは既定で走査される */
export const SCAN_EXCLUDED_FILES: readonly { file: string; why: string }[] = [
  {
    file: 'apps/cli/src/calibration.ts',
    why: '登録簿そのもの。ここに較正定数の実体は置かない（置くと自己参照になる）',
  },
  {
    file: 'packages/sim-engine/src/types.ts',
    why: '型定義とキー一覧のみ。数値の較正定数を持たない',
  },
];

/**
 * ファイル単位の免除パターン（S-4）。**理由必須**。
 *
 * ★走査を全件へ反転した結果、CLI 引数の既定値や正典の写しが大量に出てくる。
 *   これらを1件ずつ免除すると登録簿が実質「手順」に戻るので、
 *   **性質ごとにまとめて理由を書く**。パターンを増やすときも理由を書かせる。
 */
export const EXEMPT_PATTERNS: readonly { pattern: string; why: string }[] = [
  {
    pattern: 'apps/cli/src/(sweep|sweep-distance|selection-compare|race-diagnostics|metric-correlation|decompose)\.ts',
    why: '開発用の診断・掃引ツール。判定（V-x）を作らない。ここの定数は実行時に --flag で上書きする前提の既定値',
  },
  {
    pattern: 'apps/cli/src/verify\.ts',
    why: 'P0 受け入れハーネスの実行条件。既定値は正典 §10.5（800頭）等の写しで、--flag で明示上書きする。判定条件は出力の冒頭に自己申告する（R-8）',
  },
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
    key: 'DEFAULT_RACE_BALANCE',
    why: '正典 §8/§13.1 の写しをまとめたオブジェクト。個々のメンバーは別途防御している（K は S-1 の振る舞いテスト、INTERVENTION_CAP は O-3 の経路テスト）。**メンバー単位の登録は未実装で、次便の課題**',
  },
  {
    key: 'DEFAULT_INTERVENTION_BALANCE',
    why: '同上（正典 §8b/§13.1 の写し）。ハードキャップは O-3 の経路テストが守っている。メンバー単位の登録は次便の課題',
  },
  {
    key: 'DEFAULT_BALANCE',
    why: 'P0 の正典写し。§13.1 の各定数は regression.test.ts がリテラルで固定している',
  },
  {
    key: 'BALANCE',
    why: '正典 §13.1 の写しそのもの。regression.test.ts が値を固定している',
  },
  {
    key: 'FOUNDERS',
    why: '創始世代の定義（正典 §6）。config.test.ts / regression.test.ts が導出経路ごと固定している',
  },
  {
    key: 'TRAIT_MUTATION',
    why: 'FOUNDERS からの導出値。導出そのものを config.test.ts が経路で固定している',
  },
  {
    key: 'TRAIT_BOUNDS',
    why: '正典 §5.1 のアレル値域。較正対象ではなく、仕様そのものの写しである',
  },
  {
    key: 'NICKS_GEN',
    why: '正典 §6.6 のニックス生成条件。V-3 が発生率を固定している',
  },
  {
    key: 'DEFAULT_OPTIONS',
    why: 'シミュレータの既定オプション。判定条件は verify が明示指定し、出力冒頭に自己申告する（R-8）',
  },
  {
    key: 'DISTANCES',
    why: 'モンテカルロで振る距離の刻み。§8.2 の5距離帯を網羅するための列挙で、較正の自由度ではない',
  },
  {
    key: 'PRIZE_BY_POSITION',
    why: '賞金表（正典 §11 未執筆のプレースホルダ）。racing-season.test.ts がリテラルで固定している',
  },
  {
    key: 'DISTANCE_BANDS',
    why: '正典 §8.2 の距離帯境界。race.test.ts が両側の境界を固定している',
  },
  {
    key: 'MARGIN_LABELS',
    why: '着差ラベル（表示のみ・判定に影響しない）。race.test.ts が境界を固定している',
  },
  {
    key: 'PACE_STRATEGY_EFFECT',
    why: '正典 §8.4 の表そのもの。race.test.ts がリテラルで固定している',
  },
  {
    key: 'RNG_DOMAIN',
    why: '乱数サブストリームの用途ID。較正値ではなく識別子',
  },
  {
    key: 'RNG_STREAM',
    why: 'race-engine 側の乱数サブストリーム用途ID。較正値ではなく識別子で、値の大小に意味はない',
  },
  {
    key: 'STREAM',
    why: '検証ハーネス側の乱数サブストリーム用途ID。較正値ではなく識別子で、値の大小に意味はない',
  },
  {
    key: 'GATES',
    why: '正典 §13.2 の合格域そのもの。変更にはオーナー承認が要る（勝手に緩めない）',
  },
  {
    key: 'TOTAL_RACES',
    why: 'モンテカルロのレース数。多いほど推定が正確になるだけで、判定の向きを変える較正値ではない。--races で明示指定し settings に記録する',
  },
  {
    key: 'SEEDS',
    why: 'シード列。4シードで測ることは正典 §13.3「シード固定で再現可能」の運用条件で、較正値ではない。settings に記録する',
  },
  {
    key: 'CLASS_BAND',
    why: 'DEFAULT_CLASS_BAND（登録済み）を読むだけの CLI 既定値。実体はそちらで防御している',
  },
  {
    key: 'RACE_K',
    why: 'CALIBRATED_RACE_RANDOM_K（登録済み・S-1 で振る舞いを固定）を読むだけの CLI 既定値',
  },
  {
    key: 'POPULARITY_TRIALS',
    why: 'DEFAULT_POPULARITY_TRIALS（登録済み・防御済み）を読むだけの CLI 既定値',
  },
  {
    key: 'POOL_GENERATIONS',
    why: '★判定を決める自由変数（監査の実測で 20世代 FAIL / 40世代 PASS）。単体テストでは防御できない（10万レースの実行が要る）ため、いまは settings への記録と本報告での明示に留めている。**未防御であることを承知の上での免除**で、K と床の同時掃引で条件ごと確定させたうえで正典に固定する必要がある',
  },
  {
    key: 'POOL_MARES',
    why: '母集団規模。POOL_GENERATIONS と同じ理由で単体テストでは未防御。settings に記録している',
  },
  {
    key: 'HEX64',
    why: 'SHA-256 の16進形式を検査する正規表現。数値定数ではない',
  },
  {
    key: 'TWO_POW_32',
    why: 'PRNG の 2^32。アルゴリズム上の固定値で較正対象ではない',
  },
  {
    key: 'V1_TARGET',
    why: '正典 §13.2 の合格域・対象形質の定義そのもの。変更にはオーナー承認が要る（勝手に緩めない）',
  },
  {
    key: 'V2A_WINDOW',
    why: '正典 §13.2 の合格域・対象形質の定義そのもの。変更にはオーナー承認が要る（勝手に緩めない）',
  },
  {
    key: 'V2A_TARGET_ABS_MAX',
    why: '正典 §13.2 の合格域・対象形質の定義そのもの。変更にはオーナー承認が要る（勝手に緩めない）',
  },
  {
    key: 'V2B_TARGET_MAX',
    why: '正典 §13.2 の合格域・対象形質の定義そのもの。変更にはオーナー承認が要る（勝手に緩めない）',
  },
  {
    key: 'V2D_TARGET_ABS_MAX',
    why: '正典 §13.2 の合格域・対象形質の定義そのもの。変更にはオーナー承認が要る（勝手に緩めない）',
  },
  {
    key: 'V2E_TARGET',
    why: '正典 §13.2 の合格域・対象形質の定義そのもの。変更にはオーナー承認が要る（勝手に緩めない）',
  },
  {
    key: 'V2D_TRAITS',
    why: '正典 §13.2 の合格域・対象形質の定義そのもの。変更にはオーナー承認が要る（勝手に緩めない）',
  },
  {
    key: 'V3_TOLERANCE',
    why: '正典 §13.2 の合格域・対象形質の定義そのもの。変更にはオーナー承認が要る（勝手に緩めない）',
  },
  {
    key: 'MUTATION_CLAMP_RATIO',
    why: '他の正典定数からの導出値であって、独立した較正対象ではない',
  },
];
