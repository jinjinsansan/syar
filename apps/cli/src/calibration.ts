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
    key: 'POLICY_FIT_WEIGHT',
    file: 'apps/cli/src/preseed.ts',
    perturbed: 'export const POLICY_FIT_WEIGHT = 0;',
    affects: 'N-4 / D-025（厩舎方針が配合相手の評価に効く強さ。0 にすると D-025 以前の無差別選択に戻る）',
  },
  {
    key: 'DISTANCE_FIT_SPAN',
    file: 'apps/cli/src/preseed.ts',
    perturbed: 'export const DISTANCE_FIT_SPAN = 100000;',
    affects: 'D-025（距離方針の効く幅。極端に広げると全馬が適合扱いになり距離の個性が消える）',
  },
  {
    key: 'STABLE_EMPHASIS_WEIGHT',
    file: 'apps/cli/src/preseed.ts',
    perturbed: 'export const STABLE_EMPHASIS_WEIGHT = 1.0;',
    affects: 'N-4（厩舎方針が選抜に効く強さ。1.0 にすると 40厩舎が同じ馬を選び系統が潰れる）',
  },
  {
    key: 'NPC_FOLLOW_COEFFICIENT',
    file: 'apps/cli/src/preseed.ts',
    perturbed: 'export const NPC_FOLLOW_COEFFICIENT = 1.0;',
    affects: 'N-3（正典 §10.5 の 0.92。1.0 にすると NPC がプレイヤー上位と同水準になり成長実感が消える）',
  },
  {
    key: 'NPC_FOLLOW_TOP_RATIO',
    file: 'apps/cli/src/preseed.ts',
    perturbed: 'export const NPC_FOLLOW_TOP_RATIO = 1.0;',
    affects: 'N-3（正典 §10.5 の上位30%。1.0 にすると全体平均への追従になり NPC が弱くなる）',
  },
  {
    key: 'NAME_TAIL_RATE',
    file: 'packages/sim-engine/src/naming.ts',
    perturbed: 'export const NAME_TAIL_RATE = 0;',
    affects: 'N-1（馬名の語尾音が付く割合。0 にすると語尾が消えて名前空間が狭まり、重複が増える）',
  },
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
    key: 'TRACK_CONDITION_CDF',
    file: 'apps/cli/src/race-field.ts',
    perturbed: 'export const TRACK_CONDITION_CDF = { good: 1.0, yielding: 1.0, soft: 1.0 } as const;',
    affects:
      'V-2d/V-2f（馬場状態の出現分布。良100%にすると heavy_aptitude が一度も発現せず選抜圧がゼロになる）',
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
    pattern: 'apps/cli/src/measurement\.ts',
    why: '★測定条件（どう測るか）。較正定数とは扱いが違い、正典 §13.2/§13.3 に固定して measurement.test.ts が値照合で守る。R-14 は較正定数についての規則で、文書化された測定条件の照合を禁じない',
  },
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
    key: 'SELECTED',
    why: 'F-4 の V-2e 分解で「レース選抜がかかる形質」を列挙した集合。数値の較正値ではなく形質キーの一覧で、V-2f が選抜対象として明示している集合と同じ。判定は変えず、内訳の見出しを分けるだけに使う',
  },
  {
    key: 'INBREED_PENALTY_WEIGHT',
    why: '★F-1 の近交回避項。R-15 で未接続（0 ＝ 無効）。3.0 にすると平均F 0.0519 → 0.0095 と劇的に効くが、y50 有効系統数が 6.02 → 2.09 に悪化し実行時間が25倍になる。採否はレビュー側の判断待ち',
  },
  {
    key: 'SIRE_CHOICE_TOP_K',
    why: '★R-15 で未接続（1 ＝ 厩舎ごとの最良1頭・従来動作）。上位K頭に分散させる機構だが、実測で有効系統数が y50 8.83 → 2.28 と悪化したため有効化しない',
  },
  {
    key: 'HOME_SIRE_BONUS',
    why: '★R-15 で未接続（1.0 ＝ 無効）。自厩舎の種牡馬を優先する機構だが、合格基準3 を通す 1.30 では平均F が 0.107 → 0.500・虚弱率 3.5% → 23.8% になる。採否はレビュー側の判断待ちで、判断が出るまで有効化しない',
  },
  {
    key: 'PRESEED_RETIRE_AGE',
    why: '引退年齢。正典 §10.4 の現役年齢の写しで、現役プール頭数（§10.5 の2,500）を決める運用条件。実測値は npm run preseed が毎回出力する',
  },
  {
    key: 'PRESEED_DEBUT_AGE',
    why: 'デビュー年齢。正典 §10.4 の写し。較正で動かす値ではなくルールそのもの',
  },
  {
    key: 'PEDIGREE_GENERATIONS',
    why: '正典 §10.5 の「5代血統表」の 5 そのもの。判定を通すために動かす値ではなく、測る対象の定義',
  },
  {
    key: 'FULL_PEDIGREE_ANCESTORS',
    why: '5代の枠数 62（2+4+8+16+32）。PEDIGREE_GENERATIONS からの導出で、導出関係を ★テストが押さえている',
  },
  {
    key: 'DEFAULT_PRESEED_OPTIONS',
    why: 'プリシードのプール構成（正典 §10.5 の 現役2,500/種牡馬200/繁殖牝馬800）の写し。実際に何頭になったかは npm run preseed の出力で照合する',
  },
  {
    key: 'NAME_MAX_ATTEMPTS',
    why: '馬名生成の引き直し上限。安全弁であって較正値ではない（増やしても名前の性質は変わらず、失敗が遅くなるだけ）。ここに達したら例外を投げる＝黙って重複を通さない',
  },
  {
    key: 'DISTANCE_BIAS_CENTER',
    why: 'NPC 厩舎の距離方針 → 狙う距離適性中心（m）。正典 §8.2 の距離帯の写しで、判定（V-x）を作らない。分散したかは N-4 で実測する',
  },
  {
    key: 'NPC_STABLES',
    why: 'NPC 厩舎表そのもの。数値の較正値ではなく方針の組み合わせ。分散の有無は N-4 で実測して報告する（R-16）',
  },
  {
    key: 'NAME_SYLLABLES',
    why: '馬名の音節表。数値ではなく語彙。名前空間の広さは ★テストで下限を押さえる',
  },
  {
    key: 'NAME_TAILS',
    why: '馬名の語尾音表。数値ではなく語彙で、付く割合のほうは NAME_TAIL_RATE として登録簿に載せている',
  },
  {
    key: 'DEFAULT_NAME_SHAPE',
    why: '馬名の既定形（冠名なし・2〜4音節）。厩舎ごとに上書きされる既定値で、判定を作らない',
  },
  {
    key: 'ALLOW_ALL_NAMES',
    why: '何も禁止しない NG 判定。**テストとプリシードの部分実行専用**。本番経路で使われていないことは ★テストで押さえる',
  },
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
    why: '測定条件（measurement.ts）を読むだけの CLI 既定値。実体は measurement.test.ts が正典 §13.2 との一致を照合している',
  },
  {
    key: 'FLOOR',
    why: 'FIELD_STRENGTH_FLOOR（登録済み・防御済み）を読むだけの CLI 既定値。掃引用に --field-floor で上書きする',
  },
  {
    key: 'LONGSHOT_RANKS',
    why: '測定条件（measurement.ts）を読むだけの CLI 既定値。実体は apps/cli/test/measurement.test.ts が正典 §13.2 との一致を照合している',
  },
  {
    key: 'POOL_GENERATIONS',
    why: '測定条件（measurement.ts）を読むだけの CLI 既定値。実体は measurement.test.ts が正典 §13.2 との一致を照合している。★Q-4 で頭数分布を是正した結果 ΔV-4 = 0.00 になり、自由変数ではなくなった（decompose.ts の実測）',
  },
  {
    key: 'POOL_MARES',
    why: '測定条件（measurement.ts）を読むだけの CLI 既定値。実体は measurement.test.ts が正典 §13.2 との一致を照合している',
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
    key: 'NON_ABILITY_TRAITS',
    why: '能力5種を除いた形質の一覧。NUMERIC_TRAITS からの差分で自動導出しており独立した較正値ではない',
  },
  {
    key: 'V2F_TRAITS',
    why: '正典 §13.2・D-019 の V-2f 対象形質の定義。V2D_TRAITS からの差分で自動導出しており較正値ではない',
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
