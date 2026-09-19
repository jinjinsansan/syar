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
    key: 'RAIL_W',
    file: 'packages/race-engine/src/lane.ts',
    perturbed: 'export const RAIL_W = 10;',
    affects:
      '★V-18 / D-065 / D-071（横位置の落ち着き先。ラチから遠ざけると全馬が外を回り、距離ロスの差が消える。実測: 枠の位置に居続ける形では枠による偏りが 35.5馬身＝枠順で決まるゲームになった）',
  },
  {
    key: 'LANE_REVEAL_FULL_RUN',
    file: 'packages/race-engine/src/lane.ts',
    perturbed: 'export const LANE_REVEAL_FULL_RUN = 1.0;',
    affects:
      '★V-4 / V-17 / V-18（シード由来の横の広がりが出そろう進行率。'
      + '早めると中盤で隊列が横に散り、距離ロスの**ばらつき**が増える。'
      + '実測: 1.0→0.18 で 中盤の広がり 2.13m→8.19m ／ 枠×ロス相関 0.013→0.011（悪化なし）／ ロスの SD +74%）。'
      + '⚠️ ★枠に紐づく `base` / `SETTLE_M` とは別物。こちらは枠に対して単調でない一様乱数から作るので、'
      + '早めても枠順ゲーム化しない（レビュー側裁定 2026-08-21）',
  },
  {
    key: 'LANE_MODELS',
    file: 'packages/race-engine/src/lane.ts',
    perturbed: "export const LANE_MODELS = { b: { homeSpreadM: 0.1, wobbleM: 0.9 }, c: { homeSpreadM: 10.0, wobbleM: 0.9 }, d: { homeSpreadM: 4.5, wobbleM: 0.7 } };",
    affects:
      '★V-18 / D-065 / D-071（走る場所の作り方。`homeSpreadM` を小さくすると全馬が同じ通り道へ寄り、'
      + '★**内ラチに重なる頭数が戻ります**（★現行の形では 12 頭中 6.2 頭が `RAIL_W` に小数以下まで同じ位置）。'
      + '★オーナー評（2026-08-31）「★**正しくないです　こんな競馬は在りません**」を受けて入れたもの。'
      + '⚠️ ★通り道はシードから引き、★**枠に依存させません**（D-069 / D-073）。'
      + '★値は `tools/_lanecand.mjs` の測定と実画面のコマで選びました（★先に値を決めて後から正当化しない）',
  },
  {
    key: 'LANE_MODEL_LEGACY',
    file: 'packages/race-engine/src/lane.ts',
    perturbed: "export const LANE_MODEL_LEGACY: LaneModel = { homeSpreadM: 0, wobbleM: 0, legacy: false };",
    affects:
      '★検査の土台（★較正定数ではありません）。★**旧形**を保存しておくためだけの値で、'
      + '★`lane-reveal.test.ts` の「★**旧形に戻すとこの検査は落ちる**」がこれを使います。'
      + '⚠️ ★`legacy` を false にすると旧形が再現できなくなり、★**検査が何も守らなくなります**（★緑のまま通る）。'
      + '★本番では使いません — ★本番は `LANE_MODEL`。`?lane=old` で実画面の新旧比較にも使います',
  },
  {
    key: 'REVEAL_START_RUN',
    file: 'packages/race-engine/src/lane.ts',
    perturbed: 'export const REVEAL_START_RUN = 0.5;',
    affects:
      '★V-18（シード由来の広がりが出はじめる進行率。発走直後は枠の広がりが残っているので、そこに重ねない）',
  },
  {
    key: 'SETTLE_M',
    file: 'packages/race-engine/src/lane.ts',
    perturbed: 'export const SETTLE_M = 2000;',
    affects:
      '★V-18 / D-071（枠順の位置から内へ寄るまでの距離。長くすると外枠がレース中ずっと外を回り、枠順と着順の相関が上がる）',
  },
  {
    key: 'TRACK_WIDTH_M',
    file: 'packages/race-engine/src/lane.ts',
    perturbed: 'export const TRACK_WIDTH_M = 4;',
    affects:
      '★V-18 / D-065（走路の幅。狭くすると内外差が消え、D-065 が何もしていない状態になる）。⚠️ ★`@star/render` の `ovalCourse` の既定と**必ず同じ値**であること（lane-geometry.test.ts が突き合わせる）',
  },
  {
    key: 'RUN_UP_M',
    file: 'packages/race-engine/src/lane.ts',
    perturbed: 'export const RUN_UP_M = 0;',
    affects:
      '★V-18 ①（発走から最初のコーナーまでの直線）。0 にするとコーナーの途中から発走することになり、外枠が発走直後に大きく外を回る。実測: 枠とロスの相関が 直線発走 0.117 に対し★コーナー発走 0.539。⚠️ ★`@star/render` の `RUN_UP_M` と**必ず同じ値**であること',
  },
  {
    key: 'STALL_W_M',
    file: 'packages/race-engine/src/lane.ts',
    perturbed: 'export const STALL_W_M = 3;',
    affects:
      '★V-18 ①（1房の幅）。広げるとゲートが走路の幅いっぱいに広がり、外枠が発走直後から大きく外を回る',
  },
  {
    key: 'PRIZE_TABLE',
    file: 'packages/scheduler/src/prize.ts',
    perturbed: "export const PRIZE_TABLE: Readonly<Record<PrizeTier, readonly number[]>> = { G1: [1,1,1,1,1], G2: [1,1,1,1,1], G3: [1,1,1,1,1], open: [1,1,1,1,1], win3: [1,1,1,1,1], win2: [1,1,1,1,1], win1: [1,1,1,1,1], maiden: [1,1,1,1,1] };",
    affects:
      '§9.3 / §11.1（賞金は PP の主な発行源。平坦にするとクラスが上がっても賞金が跳ねず、育成が飾りになる・D-020）',
  },
  {
    key: 'INBREED_PENALTY_WEIGHT',
    file: 'apps/cli/src/preseed.ts',
    perturbed: 'export const INBREED_PENALTY_WEIGHT = 0;',
    affects: 'V-12a / D-026（NPC配合AIの近交回避。0 にすると近交を割り引かなくなり平均F が 0.031 → 0.070 に上がる）',
  },
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
    key: 'MARGIN',
    file: 'packages/betting/src/balance.ts',
    perturbed: 'export const MARGIN: Readonly<Record<TicketKind, number>> = { win: 0, place: 0, quinella_place: 0, quinella: 0, exacta: 0, trio: 0, trifecta: 0 };',
    affects: 'V-10 / §11（控除率。PP 発行量の最大の調整弁。0 にすると胴元の取り分が消える）',
  },
  {
    key: 'DOMINANCE_MARGIN_RATIO',
    file: 'apps/cli/src/verify-v14.ts',
    perturbed: 'export const DOMINANCE_MARGIN_RATIO = 100;',
    affects: '★V-14 の3つ目「同一 EP 予算下で追い切り偏重が支配的でない」の判定幅（D-047）。正典 D-044 は「大きく上回らない」としか書いておらず、1.02倍は**私が決めた値**。100 にすると EP あたり効率が何倍でも PASS になり、ゲートが意味を失う（照会中）。★2026-08-11 まで、この定数は「時間軸の水準差 +2pt」を判定していた — すぐ上のコメントが「③の定義は同一EP予算下」と書いているのに、実装がそうなっていなかった',
  },
  {
    key: 'TEMPER_FLOOR_RATIO',
    file: 'packages/training/src/temper.ts',
    perturbed: 'export const TEMPER_FLOOR_RATIO = 0;',
    affects: '★V-15（キャリア中盤の集団SD ≥ 誕生時SD の 50%・D-049）。0 にすると下限が消え、是正前と同じく全馬の気性が 0 に潰れる（1,800頭で 51.0→0.1・199/200 が平均40週で 0 到達）。★潰れても V-2e/V-2f/B-1/全テストは通るので、V-15 だけが検出する',
  },
  {
    key: 'INJURY_BASE_PROB',
    file: 'packages/training/src/injury.ts',
    perturbed: 'export const INJURY_BASE_PROB = 0.0018;',
    affects: '★V-7a（D-049 の較正ゲート）。正典 §7.5 は 0.0018 と書くが、1,800頭の実測で V-7a が 39.1% となり上端40%まで 0.8 SE しか無い。0.0013 で 29.9%（両端 9.2/9.4 SE）。0.0018 に戻すと余裕がほぼゼロになる',
  },
  {
    key: 'COMMON_EVENT_PROB',
    file: 'packages/training/src/events.ts',
    perturbed: 'export const COMMON_EVENT_PROB = 0.5;',
    affects: '★§7.6 の「低確率」の既定値（正典に数値が無い。数値があるのは素質開花の1%だけ）。0.5 にすると毎週のようにイベントが起き、テキストの特別感が消える',
  },
  {
    key: 'PUSH_THROUGH_IQ_MULT',
    file: 'packages/training/src/events.ts',
    perturbed: 'export const PUSH_THROUGH_IQ_MULT = 1.0;',
    affects: '★§7.6「強行は IQ+ だが気性+10」の IQ+ の量（正典に数値が無い）。1.0 にすると強行の利得が消え、気性+10 だけを負う選択肢になり、選ぶ理由が無くなる',
  },
  {
    key: 'BASE_GAIN',
    file: 'packages/training/src/growth.ts',
    perturbed: 'export const BASE_GAIN = 12;',
    affects: '★V-14（D-048）。正典 §7.3 は「既定 12」で固定値ではない。★実質的に唯一の自由度で、3方針すべてに効く（放置=BASE×0.3 / 追い切り偏重=BASE×1.6）。12 に戻すと放置が 87% まで上がり、適切な育成との差（デイリー来訪の動機）が縮む',
  },
  {
    key: 'FATIGUE_NATURAL_RECOVERY',
    file: 'packages/training/src/condition.ts',
    perturbed: 'export const FATIGUE_NATURAL_RECOVERY = 0;',
    affects: '★D-046 で新設した週ごとの疲労回復。0 にすると自然回復が消え、★何もしない馬（軽め+4がたまり続ける）が最も激しい調教をした馬より疲れる状態に戻る（実測: 放置77.9 vs 追い切り偏重69.2）。疲労は §8b の介入ゲージ初期値にも効くので、放置馬はレース中の操作まで不利になる二重の罰になる',
  },
  {
    key: 'MAIN_EFFECT_COEF',
    file: 'packages/training/src/menus.ts',
    perturbed: 'export const MAIN_EFFECT_COEF = 0.08;',
    affects: '★§7.3 成長式（正典に数値が無い）。副効果と同値にすると「主効果」列の意味が消え、どのメニューを選んでも同じ伸びになる。★実装前の解析で、他の係数が1だと調教104週で素質上限に張り付き後半78週の伸びが0になると分かっているため、この値が式全体の桁を決める',
  },
  {
    key: 'SIDE_EFFECT_COEF',
    file: 'packages/training/src/menus.ts',
    perturbed: 'export const SIDE_EFFECT_COEF = 0;',
    affects: '★§7.3 成長式（正典に規定なし）。0 にすると「坂路だけ続けた馬は ST/GT/IQ が初期値のまま」になり、1形質だけ極端に伸びた馬が量産される',
  },
  {
    key: 'CANCEL_AFTER_START_MS',
    file: 'packages/scheduler/src/cycle.ts',
    perturbed: 'export const CANCEL_AFTER_START_MS = 0;',
    affects: '★D-037（確定できないレースを開催中止にして EP を返すまでの時間）。0 にすると発走直後の全レースが中止・全額返還になり、確定が一度も走らない。客の金が戻る条件そのものなので、変異が必ずテストに出ること',
  },
  {
    key: 'LAMBDA_STAR',
    file: 'packages/betting/src/balance.ts',
    perturbed: 'export const LAMBDA_STAR = 1;',
    affects: 'V-10 / D-035（M·p_min の設計余裕。1 にすると c≧1 の打ち切りが無視できなくなり、稀な目のオッズが低く付いて払戻率が不足する。必要な試行数にそのまま比例し、レース生成の所要時間にも直結する）',
  },
  {
    key: 'ODDS_CAP',
    file: 'packages/betting/src/balance.ts',
    perturbed: 'export const ODDS_CAP: Readonly<Record<TicketKind, number>> = { win: 1e9, place: 1e9, quinella_place: 1e9, quinella: 1e9, exacta: 1e9, trio: 1e9, trifecta: 1e9 };',
    affects: '§9.4（配当上限。実質無限にすると1本の高配当で PP 発行が跳ねる）',
  },
  {
    key: 'ODDS_GRID_EPSILON_TENTHS',
    file: 'packages/betting/src/odds-tenths.ts',
    perturbed: 'export const ODDS_GRID_EPSILON_TENTHS = 0;',
    affects:
      '★D-094 候補（オッズを 0.1 単位で切り捨てる・監査 H-2・2026-09-14）。格子ちょうどの値が浮動小数で下側に表されたときに 1 段下げない許容幅。0 にすると 2.3 のつもりの値が 2.2 に落ち（客に不利な向きの取り違え）、tenths / 10 の往復も例外になる。`odds-tenths.test.ts` の「格子ちょうどは下げない」が守る',
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
  // ★S-4: パッケージを増やしたら走査対象に加える。加え忘れると
  //   「変異試験すべて防御」が**走査していない範囲について何も言っていない**状態になる。
  'packages/betting/src',
  'packages/scheduler/src',
  // ★P3 で追加。加え忘れると「変異試験すべて防御」が
  //   **走査していない範囲について何も言っていない**状態になる（S-4）
  'packages/training/src',
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
    pattern: 'packages/race-engine/src/watch\.ts',
    why: '★観戦の再生（D-059）。PHASE_METERS は**値を持たず** DEFAULT_INTERVENTION_BALANCE から取る（二重定義を作らないため）。較正の対象は STAMINA_WINDOW_METER / STAMINA_EMPTY_METER のほうで、そちらは登録済み',
  },
  {
    pattern: 'apps/cli/src/measurement\.ts',
    // ★2026-09-16: V13_MEASUREMENT を追加（D-112 ③）。★同じ理由でこのパターンに含まれる —
    //   ★測定条件であって較正定数ではなく、★通すために動かせる値ではない（動かすなら測り直して報告する）
    why: '★測定条件（どう測るか）。較正定数とは扱いが違い、正典 §13.2/§13.3 に固定して measurement.test.ts が値照合で守る。R-14 は較正定数についての規則で、文書化された測定条件の照合を禁じない',
  },
  {
    pattern: 'apps/cli/src/verify-v15\.ts',
    why: '★V-15 の測定ハーネス。SEED / HORSES は標本の取り方。V15_MEASUREMENT は**測定条件**（中盤=169週・方針=balanced・下限50%）で、正典 §13.2 の写しとして固定する — 較正定数ではなく、通すために動かせる値でもない。較正の対象は TEMPER_FLOOR_RATIO のほうで、そちらは CALIBRATION に登録済み',
  },
  {
    pattern: 'apps/cli/src/diag-topgap\.ts',
    why: '★V-4 が動いた理由を測り直す診断（Q-P3-36）。判定を出さない。SEED / RACES は標本の取り方で、通すために動かせる値ではない',
  },
  {
    pattern: 'apps/cli/src/diag-loop\.ts',
    why: '★週ループの載せ替え差分を測る診断ツール。判定を出さない（V-x を作らない）。SEED / HORSES は標本の取り方で、通すために動かせる値ではない',
  },
  {
    pattern: 'apps/cli/src/(sweep|sweep-distance|selection-compare|race-diagnostics|metric-correlation|decompose)\.ts',
    why: '開発用の診断・掃引ツール。判定（V-x）を作らない。ここの定数は実行時に --flag で上書きする前提の既定値',
  },
  {
    pattern: 'apps/cli/src/verify\.ts',
    why: 'P0 受け入れハーネスの実行条件。既定値は正典 §10.5（800頭）等の写しで、--flag で明示上書きする。判定条件は出力の冒頭に自己申告する（R-8）',
  },
  {
    pattern: 'apps/cli/src/diag-(streams|win|tail)\.ts',
    why: '切り分け用の診断ツール（乱数系列の分布比較）。判定（V-x）を作らず、本番経路からも参照されない。実行条件は出力の冒頭に自己申告する（R-8）',
  },
  {
    pattern: 'apps/cli/src/diag-bias\.ts',
    why: "★恒等式 払戻率 = (1−margin)×[1 + (1/n)Σ(1−p)/(M·p)] の**予測値**を計算する道具。上の diag-* と違い、この出力は判定に効く（予測と実測が一致するかで是正方針が決まる）ので、同じ枠に入れずここに分ける。それでも較正定数ではない理由: (a) MC は自由変数ではなく**実測と同じ M でなければ意味を持たない**量で、ずらすことは較正ではなく誤りである (b) RACES は全出走馬にわたる平均の標準誤差だけを決め、期待値を動かさない (c) SEED は実測と同じ10シードを掃引する。予測を実測に近づけるために動かせる値が1つも無い（R-12）",
  },
  {
    pattern: 'apps/cli/src/verify-pmin\.ts',
    why: "★D-035 を本番のコード経路（apps/worker/src/odds.ts の buildOddsRows）で確かめるハーネス。実行条件は較正定数ではない: MC は D-035 の設計式から決まる値を既定に取り（自由に選べない）、RACES と FINALS は**推定の分散だけ**を下げて期待値を動かさない。★M=3,896,104 では §13.2 の10万レース測定が 3.9×10^11 回の解決（本番機で約44日）になるため、同一レースから確定を多数引く分散低減を使う。合否は出力の乖離で決まり、ここの値をいじって通せるものではない（R-12）。★2026-09-16 訂正（裁定 REVIEW_GAME_BODY_5_VERDICT_20260916 §10・§12-4）: ★**FINALS を増やしても判定の標本数は増えない** — 確定の多数引きは `foldRaceSample` で**1 レース 1 標本**に畳むので、SE を決めるのは RACES だけ（D-036「1 つの出走表を 10 万回引いても出走表間のばらつきは 1 標本のまま」）。★つまり FINALS は**レース内**の分散だけを下げ、★**SE を見かけ上小さくして通す方向には使えない**。★集計は v10-accounting.ts（verify-payout.ts と同じ 1 か所）に通し、★未発売の的中は賭け金にも払戻にも入れない（★旧実装は賭け金だけ数えて払戻に 0 を足しており、買えない目の当たりを払戻から引いていた＝測定の誤り）",
  },
  {
    pattern: 'apps/cli/src/verify-v7\.ts',
    why: "★V-7 の測定条件を決めるための実測ツール（P3 指示書 §4）。SEED/HORSES は標本の取り方、TRAIN_STREAM は乱数の用途ID（既存4表と重ならない61〜の帯）。★このツールは判定を出さず、定義の候補ごとの数字を並べるだけなので、通すために動かせる値がない",
  },
  {
    pattern: 'apps/cli/src/verify-initial-band\.ts',
    why: "★帯の下のゲート（D-079 ④「初期馬が適切な育成でキャリア中に 1 勝」）の測定ハーネス。HORSES は標本の取り方、SEGMENTS は現役 156 週（raceableFrom〜retireAt）の割り方で、1 区間あたりの申し込み数は正典 §7.1 の CAREER_RACE_LIMIT を SEGMENTS で割って導く。★LOTTERY_SURPLUS は正典 1317 の完全抽選が実際に働くための超過分（★一様なのでどの帯にも偏らない。0 にすると抽選が死んでいても数字が変わらない・R-16）。★MATCH_TOLERANCE は --choice matched のときだけ効く測定の自由変数で、★**判定に効くことが実測で分かっている**（★1.0 が 7.7% と 41.0% に分かれる）ため、★正典に固定してもらうよう照会 Q-BAND-04 に出している（R-12）。★判定を通すために動かせる値ではない — ★そもそも本ツールは合否を出さない（合格線が正典・裁定に無いため・照会 Q-BAND-01）。★育成方針も測る側では選ばず training-career.ts の APPROPRIATE_POLICY を引く",
  },
  {
    pattern: 'apps/cli/src/verify-v14\.ts',
    why: "★V-14（D-044）の測定ハーネス。SEED/HORSES は標本の取り方で、TRAIN_STREAM は乱数の用途ID（既存4表と重ならない61〜の帯）。いずれも判定を通すために動かせる値ではない。★ただし DOMINANCE_MARGIN（『大きく上回らない』を +2pt と定義した値）だけは判定そのものを決めるので、較正定数として別に登録している",
  },
  {
    pattern: 'apps/cli/src/diag-growth-scale\.ts',
    why: '★成長式を実装する前に桁が合うかを確かめる診断ツール（P3 指示書 §5-1「掃引する前に解析で決まるものを先に決める」）。正典 §7.3 の値の写しを持つだけで、判定（V-x / B-x）を作らない',
  },
  {
    pattern: 'apps/cli/src/bench-mc\.ts',
    why: 'オッズ MC の実費用（μs/試行）を測るだけの計測器。合否をいっさい作らず、TRIALS は測定の精度を上げるだけで測っている量（1試行あたりの時間）を変えない',
  },
  {
    pattern: 'apps/cli/src/diag-mneed\.ts',
    why: "★真の確率が与えられたときの払戻率を二項分布から厳密に計算する道具。乱数を使わないので推定誤差が無く、出力は判定に効く（§9.4 の上限と V-10 が両立するかを決める）。それでも較正定数ではない理由: SEED/RACES は参照集団の取り方で、TARGETS は結果を読む横軸そのもの、REF は参照 MC の解像度で**目標 M を下回ると例外で止まる**（R-21）。NO_CAP / NO_DEBIAS は上限と D-013 補正を外す切り分けスイッチで、既定はどちらも本番と同じ有効側。判定を通すために動かせる値が1つも無い（R-12）。★2026-09-16 追記: KINDS（`--kinds`）は見る券種を絞る切り分けの口で、★**絞った券種については R-21 の見張りを同じ条件で掛ける**（券種ごとに必要な参照 MC が違い、`trio` の p_min=7.7e-5 は参照 26 万を要求する一方 `place` の 8.2e-3 は 2,440 で足りる。絞らなければ従来どおり全券種を要求する＝見張りを弱めていない）。LEGACY_CONDITIONS（`--legacy-conditions`）は条件を旧来に戻す比較用で、★**既定は本番条件**（`productionRaceOf` ＋ 凍結した走路）に改めた — ★以前は `verify-payout.ts` が本番条件で測る一方この道具は旧来の条件で計算しており、★両者が別の出走表を見ていた（R-30 の家族）",
  },
  {
    pattern: 'apps/cli/src/verify-payout\.ts',
    why: 'A-3/V-10 の測定ハーネスの実行条件（レース数・MC試行数）。--races / --odds-trials で明示上書きし、実行条件を出力の冒頭に自己申告する（R-8）。MC試行数の既定 10,000 は正典 §9.2 の写し',
  },
  {
    pattern: 'apps/cli/src/verify-mi4-own-horse\.ts',
    why: '★**MI-4** の測定ハーネスの実行条件（★2026-09-19・裁定 `REVIEW_PO4_AND_CK4_VERDICT_20260919.md` §4）。'
      + '★RACES / SEED / TRIALS / POOL_FILE はすべて **推定の分散だけ**を動かし、★期待値を動かさない。'
      + '★判定するのは「★自馬に上限いっぱい張ったときの期待収支が負か」で、★**負であることは控除率（§9.4 の 18%）が決めて**おり、'
      + '★ここの値をいじって通せるものではない（R-12）。★素性（日付・母集団・sha256・標本）を出力の冒頭に自己申告する（★VP-8）。'
      + '⚠️ ★**自馬は `stats` で選ぶ**（`potential` ではない） — ★`buildRace` が `abilityOf: h.stats` を渡すため。'
      + '★最初 `potential` で選んだら 1 番人気が 41.67% しか出ず、★`stats` に直したら **95.83%** になった（★最悪ケースの定義を誤っていた）',
  },
];

/** 較正定数ではないもの（理由を必ず書く）。理由なしの免除は作らない */
export const EXEMPT: readonly { key: string; why: string }[] = [
  {
    key: 'STUD_FEE_BASE_EP',
    why: '★NPC 種牡馬の式の基礎額（`packages/scheduler/src/stud-fee.ts`・**正典 §10.5・1354 行**）。'
      + '🔴 ★**較正定数ではありません** — ★正典に `3,000 + G1勝利数 × 8,000 + 総獲得賞金/20` と'
      + '**そのまま書かれている数**です。★動かすなら**正典の改訂**であって、較正の掃引ではありません。'
      + '★D-102 ③（購入価格）と D-107（種付料の目安）が同じ式を読みます',
  },
  {
    key: 'STUD_FEE_PER_G1_EP',
    why: '★NPC 種牡馬の式の G1 1 勝あたり（★同上・正典 §10.5・1354 行）。★正典に書かれた数で、較正値ではない',
  },
  {
    key: 'STUD_FEE_EARNINGS_DIVISOR',
    why: '★NPC 種牡馬の式の「総獲得賞金 ÷ 20」（★同上・正典 §10.5・1354 行）。'
      + '⚠️ ★PP を EP の規模に合わせる割り算も兼ねています（★正典のとおり）。★正典に書かれた数で、較正値ではない',
  },
  {
    key: 'STEP_WEEKS',
    why: '★成長段階の 1 区切り [週]（`packages/scheduler/src/growth-stage.ts`・D-116 ①）。'
      + '🔴 ★**導出値です** — ★`(LIFECYCLE_WEEKS.retireAt - raceableFrom) / 4`。★数を置いていません。'
      + '★動かせるのは **§7.1 の境目（`LIFECYCLE_WEEKS`）と「4 等分」の方**で、★そちらは `GROWTH_STAGE_FROM_WEEKS` として登録済み。'
      + '⚠️ ★ここを直接動かすと、★**境目の登録と実体が食い違います**',
  },
  {
    key: 'DEFAULT_RACE_ID',
    why: '★`?race=` が無いときの 1 鞍（桜星賞）。★**較正定数ではなく、'
      + '2026-08-31 まで画面に直書きされていた 1 鞍の写し**。★これを変えると既定の画面が別のレースになるが、'
      + '★`venue-course.test.ts` の「既定の 1 鞍は直書きされていた画面と同じ」が落ちる。★数値ではなく id',
  },
  {
    key: 'GRADED_RACE_NO',
    why: '★重賞はその日のメインなので 11R。★**見出しの文字列**であって較正対象ではない。'
      + '⚠️ ★番組表（`programme.ts`）が R 番号を持つようになったら、★そちらから引くこと（二重帳簿にしない）',
  },
  { key: 'GRADED_COUNT_BY_GRADE', why: '★重賞 50 鞍の格の内訳（G1 9 / G2 14 / G3 27）。★較正定数ではなく**オーナー判断の写し**（2026-08-30・B案）。★`graded-races.test.ts` が `GRADED_RACES` と突き合わせるので、片方だけ動かすと落ちる。⚠️ ★通すために動かせる値ではない — ★動かすなら正典 §10.3 の週次頻度との噛み合わせを決め直すことになる（照会中）' },
  { key: 'TURN_REF_M', why: '★外へ膨らむ量を距離で割り戻すときの**基準点**（1600m での旋回角を 1 とする）。★較正値ではなく単位の取り方で、動かしても V-18 ② の内外差が全距離で一律に伸縮するだけ。⚠️ 割り戻し自体をやめると長距離で 13.2馬身まで積み上がり V-18 ② を超える（実測）' },
  { key: 'HORSE_LENGTH_M', why: '★1馬身 = 2.4m。**実寸の定義**（競馬ブック用語辞典・dbpedia「着差 (競馬)」）であって較正値ではない。動かすと「馬身」という単位の意味が変わる' },
  { key: 'DEFAULT_OVAL', why: '★`@star/render` の `ovalCourse` の既定（1周2000m・直線400m・幅20m）の**写し**。層の向きの都合でエンジン側にも持つが、★較正するものではなく**同期させるもの**。lane-geometry.test.ts が両者の距離ロスを突き合わせて、離れたら落とす' },
  { key: 'GROWTH_STAGE_FROM_WEEKS', why: '★成長段階（まだ幼い／力をつけてきた／充実期／完成の域／円熟期）の境目 [週齢]（D-116 ①）。★較正値ではなく**言葉が変わる時期の刻み**で、★能力・着順・成長そのものには入らない（★`stats` も `potential` も受け取らない純関数・D-116 ⑥）。⚠️ ★**正典は範囲と名前だけを定め、境目は書いていない** — ★`104`（§7.1 の現役開始）は `LIFECYCLE_WEEKS.raceableFrom` から引き、★**現役の 156 週を 4 等分**した（156 ÷ 4 ＝ 39 週ちょうど）。★開発側が置いた刻みであることを `growth-stage.ts` の註記に書いた。★D-116 ① が禁じたのは「開放率から導くこと」で、★年齢から導く限り段階は素質の代用品にならない' },
  { key: 'GROWTH_TELL_MIN', why: '★「前より○○できるようになった」と言い始める伸びの幅（D-116 ③）。★較正定数だが**値そのものをゲートにしない**。🔴 ★閾値が要るのは、★**毎週何かを言い続けると符号列が積み上がり**、★十分長く観測すれば「どの能力が何回伸びたか」が分かるため（★D-114 が「代償を承知で採る」と書いた漏れを**わざわざ広げる**ことになる）。★動かすと「どれくらい伸びたら言うか」だけが変わる' },
  { key: 'DISCOVERY_STEPS', why: '★能力の発見度が 1 段上がるのに要る「その適性が試された回数」（1・3・6）。★較正値ではなく**見せ方の刻み**で、★正典 D-108 のとおり `stats`・`potential`・`genotype` に 1 ビットも触らない（表示の層だけ）。★動かすと「いつ分かるか」だけが変わり、★着順にも人気にも入らない（人気はモンテカルロの勝率順位なので V-4 に影響しない・D-108 の実測の根拠）' },
  { key: 'CAREER_ASSUMPTION', why: '★1 頭・1 キャリアの収支を並べ直すときの前提（現役 90 週・24 戦・登録料 200 EP・配合費 2,000 EP・賞金 25,000/120,000 PP 相当）。★**正典 §3.4 の表の前提の写し**であって較正値ではない（★同じ仮定のまま、D-102 馬の購入・D-103 厩舎の格・D-105 騎手の料金を足して取り直すために置いた・GB-6）。★調教費・騎手の料金・購入価格は写さず、実装から引いている（`economy-balance.test.ts` ① が二重帳簿を捕まえる）' },
  { key: 'STABLE_GRADE_MULT', why: '★厩舎の格の倍率（ブロンズ 1.0・シルバー 1.25・ゴールド 1.5）。★較正定数だが、★**伸びと費用の両方に同じ値を掛ける**ので「同じ EP で上の格が強くなる」ことはない（D-103 ②・V-14 ③ と同じ形）。★既定のブロンズは 1.0 で、格を入れる前と 1 ビットも同じ。★片方だけに掛ける形にすると `grade.test.ts` の対照が落ちる' },
  { key: 'STABLE_GRADE_LABEL', why: '★格の表示名（ブロンズ・シルバー・ゴールド）。★文字列で較正の対象ではない' },
  { key: 'GRADE_UNLOCK_EP', why: '★格を 1 段上げるのに要る EP（シルバー 20,000・ゴールド 60,000・2026-09-16・第 5 便-5・D-103 ④）。★較正定数だが**値そのものをゲートにしない**（GB-6 の収支の取り直しで、この額込みの 1 キャリアの収支を報告する）。★上の格が買うのは強さではなく**時間**（EP あたりの伸びはどの格でも同じ・gainPerEpRatio が 1.0）なので、★「何週ぶんの調教費に相当するか」で置いた。⚠️ ★金銭で買える経路は作らない（憲法 2）。★値段は DB の stable_grade_price にサーバーが書き、RPC はその行の値で払わせる（二重帳簿にしない）' },
  { key: 'STAR_THRESHOLDS', why: '★素質の平均 → 段（★24 段）の境目。★2026-09-18・D-114 で**画面に出なくなり**、★**内部の帯の定義だけ**になった。★較正値ではなく刻みで、能力・着順・成長には入らない。⚠️ ★この帯は D-102 ③「同じ帯から候補を出す」と D-079 ⑧（在庫の下限）の定義でもあるので、★動かすと候補の帯も一緒に動く（★1 か所にしてある・D-052）。⚠️ ★境目の規則（420 から 20 刻み）は**正典に無く、開発側が置いた**（D-114 は「24 段に差し替える」までしか定めていない）— ★`stars.ts` の註記に根拠を書いた' },
  { key: 'STAR_STEPS', why: '★段の数（24）。★**D-114 ① の写し**であって較正値ではない。★旧 9 段（0.5 刻み）から差し替えたもので、★段は画面に出さない（D-114 ③）' },
  { key: 'STAR_BAND_FROM', why: '★段の下端（420）。★**旧 9 段の下端をそのまま**使っている（正典 §5 の能力の値域から引いた値を、24 段化で動かさないため）' },
  { key: 'STAR_BAND_WIDTH', why: '★1 段ぶんの素質の幅（20）。★**開発側が置いた刻み**（正典に規則が無い）。★旧 9 段は 50×6＋80 と不均一だったが、★細かくするときに不均一を保つ根拠が無いので均等にした。★上端 860 は実測の最大 824 の外側' },
  { key: 'BET_CAP_PER_KIND_EP', why: '★1 レース 1 券種の上限 [EP]（§9.4・30,000）。🔴 ★**較正定数ではなく正典の写し**で、★**賭博性の分水嶺に関わる数**。★動かすなら正典の改訂。★2026-09-19・BT-1 で切り出した — ★それまで `place_bet` の SQL に直書きで、★TS 側に定数が無かった（★画面が出そうとすると写しが増える・D-052）' },
  { key: 'BET_CAP_PER_RACE_EP', why: '★1 レース合計の上限 [EP]（§9.4・50,000）。★同上' },
  { key: 'BET_CAP_PER_DAY_EP', why: '★1 日合計の上限 [EP]（§9.4・500,000）。★同上' },
  { key: 'BET_CAP_OWN_RACE_EP', why: '★自馬が出走するレースの上限 [EP]（§9.5・5,000）。★八百長利得の遮断装置で、★「1 レース合計」を**上書き**する（50,000 ではなく 5,000）。★同上' },
  { key: 'BET_CAP_LABEL', why: '★効いている上限の言葉（★数ではない）。★「なぜ買えないか」を言うため — ★理由を言えない制限は「壊れている」と区別できない' },
  { key: 'ENTRY_FEE_EP', why: '★1 回の出走登録に払う EP（200・§10.4）。★較正定数だが**値そのものをゲートにしない**。🔴 ★**2026-09-19・EF-1 で切り出した** — ★それまで **TypeScript にこの定数は無く**、`enter_race`（`0024`→`0033`）が `v_fee := 200;` と **SQL に直書き**し、★TS 側は `CAREER_ASSUMPTION` の**説明文の中**にあるだけだった。★画面が値段を出すと 3 つ目の写しができるので、★D-103 ④ の先例（正＝TS → サーバーが DB に書く → RPC・ビュー・画面が読む）に倣った。⚠️ ★**値は 1 ビットも変えていない**（EF-4）— ★登録料 200 EP は **正典 §3.4 の 1 キャリアの収支の前提**で、★GB-6 に噛む' },
  { key: 'MIN_PRICE_EP', why: '★馬の購入の最低価格 [EP]。★較正定数。★「配合より割高」（D-102 ④）を満たすための下限で、★種付料の式が正典にも実装にも無いため、比較は GB-6 の収支で報告する' },
  { key: 'SELL_BACK_RATE', why: '★手放したときに戻る割合（0.2）。★D-102 ③「買った額より十分小さく」の実装。★上げると買って売ってを繰り返す振り直しが成立するので、★通すために動かせる値ではない' },
  { key: 'MARKET_STOCK_MIN', why: '★**候補が丸ごと枯れたことを知るための線**（D-102 ⑤・D-079 ⑧）。🔴 ★**2026-09-19・MK-2 で言い直した** — ★旧は「NPC の現役プールの在庫の下限」で、★MK-1 が数えていた**現役 NPC 全体（7,333 頭）**に対する線に読めた。★実際に買えるのは**走った実績のある馬だけ**で、✔ ★実測 **732 頭**（staging）。★200 は**その 27.3%**。🔴 ★**棚が埋まるかは、この線では分からない**: ✔ ★同じ日の実測で 帯0=656 / 帯1=56 / 帯2=18 / ★**帯3=2（3 口に足りない）** / ★**帯4=0** — ★候補が下限の 3.7 倍あるのに**5 段のうち 2 段が空**。★そちらは `planListings` の `shortfall`（T11-1 ②）が帯ごとに数えて `onAlert` を鳴らす（★役割が違う）。★上の帯が空なのは**不具合ではない**: ✔ ★staging は 着順の付いた出走 875 件・重賞は **G3 が 2 件で G1 は 0 件**なので `g1_wins > 0` が 0 頭なのは正しく、★帯4（7,600 EP）には総獲得 92,000 PP が要る（★世界が若いだけ。★`prize_pp` は 875 件すべてに入っている・PR-1）。⚠️ ★**200 そのものに導出は無い** — ★「候補の 1/4 を切ったら異常」という当座の線。★候補の実数が動いたら**割合として読み直す**' },
  { key: 'PRICE_TIERS_EP', why: '★出品を並べる★**価格の帯の下限** [EP]（★**T11-1 ②′**・2026-09-19）。★較正値ではなく**品揃えの決め**で、★着順にも成長にも入らない。🔴 ★**T-11 で `LISTED_BANDS`（素質の帯）から差し替えた** — ★棚を素質の帯で並べると★「どの棚にいるか」が帯を教え、★D-114 ② が塞いだ口が開き直す（★逆算の復活・D-102 ③）。✔ ★**シミュレータで測って決めました**（`apps/cli/src/market-price-distribution.ts`）— ★定常の集団（3,000 頭 × 番組表 26 日 ＝ キャリア 1 本分）の価格の分位点 50/75/90/99% 。★シード 42/7/1234 でどの帯も 3 口 埋まる（★最上段 25〜30 頭）。⚠️ ★**シミュレータの値で、本番の実測ではありません**（PO-5）— ★育成・引退と世代交代・配合は入っていません。🔴 ★旧の仮値 `[3,000/4,000/6,000/10,000/20,000]` では ★**5 段のうち 1 段（20,000 以上）が埋まりませんでした**' },
  { key: 'LISTINGS_PER_TIER', why: '★価格の帯ごとに出しておく口数（3）。★較正値ではなく**品揃えの決め**。★多くすると「選び直し」に近づく（D-102 ③「振り直しが成立しない」）ので、★通すために増やせる値ではない。⚠️ ★T-11 で `LISTINGS_PER_BAND` から名前だけ変えた（★値 3 はそのまま）' },
  { key: 'MARKET_POOL_LIMIT', why: '★出品を作るときに見る NPC プールの上限（5,000 頭）。★較正値ではなく**1 回の走査の大きさ**で、★帯を埋めるには十分な数。★在庫の判定は上限で切らずに count(*) で数えている（★切った数で判定すると在庫が常に足りているように見える）' },
  { key: 'JOCKEY_EFFECT', why: '★騎手の着順への効果。★**この便は 0**（D-105 ③・R-15「入っているが使われない」）。★較正値ではなく「効かせていない」ことの宣言で、`jockeys.test.ts` の対照が 0 を固定する。★0 でない値にする便では、介入の ±10%（INTERVENTION_CAP）と突き合わせて上限を決め、V-4・V-5・V-6・V-17・V-18・V-13 を取り直す' },
  { key: 'JOCKEY_BOND_MAX', why: '★親密度の頭打ち（5 戦）。★正典 D-105 ⑤「早く頭打ちにする」の写しで、★**着順には効かない**（この便は効果 0）。★長時間・複数口座の一方的な有利を防ぐための上限であり、通すために動かせる値ではない' },
  { key: 'JOCKEYS', why: '★騎手の名簿（架空の名前と料金 EP と ★暴走の抑え `calm`）。★較正定数ではなく**素材の表**。★料金は §10.4 の登録料と同じ形のシンクで、★値そのものはゲートにしない（GB-6 の収支の取り直しで、この額込みの収支を報告する）。★`calm`（2026-09-16・第 4 便・D-110 ②）は「★どちらが上手いか」の**順序の宣言**で、★`JOCKEY_CALM_EFFECT`・`RUNAWAY_BASE` が 0 のあいだは**着順に効かない**（`jockey-window-no-effect.test.ts` が判定を回して固定する）。★効かせる便で料金との関係（上限つき）と一緒に決め直す（D-105 ③）' },
  { key: 'TRAIT_EFFECT', why: '★先天個性・後天特性の着順への効果。★**この便は 0**（D-109・R-15「入っているが使われない」）。★較正値ではなく「効かせていない」ことの宣言で、`trait-no-effect.test.ts` が ★`resolveRace` を実際に回して 1 ビット不変を固定する。★0 でない値にする便では V-4・V-5・V-6・V-17（★繊細なら ＋V-18 ①②a②b・★泥巧者なら ＋V-2f）を取り直す' },
  { key: 'TRAIT_LABEL', why: '★特性の表示名（泥巧者・負けず嫌い・繊細・好スタート・長距離経験・大舞台経験・名コンビ）。★文字列で較正の対象ではない（★実在の人名・団体名を入れない・§0.1）' },
  { key: 'INNATE_THRESHOLDS', why: '★先天個性が付く境目（道悪適性 70・根性 700・気性 70・賢さ 700）。★較正値ではなく**「どの馬を個性持ちと呼ぶか」の線**で、★この便は着順に入らない（効果 0）。★動かすと「個性持ちの割合」だけが変わり、★効かせる便でその割合込みで V を取り直す。⚠️ ★**遺伝の行（§5.4）を足していない** — 既存の発現値から導くので V-1・V-2 系は動かない（★独立の遺伝にする裁定が出たら §5.2 と §5.4 の両方を直す・照会 Q-GB4-1）' },
  { key: 'LEARNED_STEPS', why: '★後天特性が付くのに要る回数（長距離 3・重賞 3・同じ騎手 5）。★較正値ではなく**刻み**（★`DISCOVERY_STEPS` と同じ性質）で、★レース結果から決定論で数える（D-109 ②・新しい乱数を引かない）。★同じ騎手の 5 は `JOCKEY_BOND_MAX` と同じ数だが、★二重帳簿にしないため呼ぶ側が親密度を渡す' },
  { key: 'LONG_DISTANCE_M', why: '★「長距離」と呼ぶ距離（2200m）。★較正値ではなく**区切りの定義**（正典 §10.2 の距離区分の写しの延長）で、★この便では着順に入らない' },
  { key: 'OWNERSHIP_LIMITS', why: '★所有上限（現役 30・繁殖牝馬 10・種牡馬 5）。★正典 §6.7 の**写し**であって較正値ではない（★現役は 2026-09-16・D-104 でオーナーが 15 → 30 と決めた値）。★通すために動かせる値ではなく、★動かすなら正典を直すことになる。★1 か所に置く理由は `ownership.ts` の註記' },
  { key: 'ENTRIES_PER_OWNER_MAX', why: '★同じレースに 1 人が出せる頭数（2）。★正典 §6.7・§10.4・D-104 の**写し**。★較正値ではなく規則で、★§9.5 の自馬の投票の制限と §8b.1 の「介入対象を 1 頭選ぶ」が意味を保つ上限' },
  { key: 'TRAINING_BAR_MAX', why: '★調教画面のバーの目盛り（1000）。★正典 §5 の能力の値域 0〜1000 の**写し**であって較正値ではない（★動かすと同じ能力が違う長さで描かれるだけで、成長式・判定には入らない）。★GB-1（D-101）で画面の見せ方を 1 か所にしたときに置いた' },
  { key: 'TRAINING_RESULT_THRESHOLDS', why: '★調教の結果の段（GREAT 1.13 以上・UP 1.10 以上・2026-09-16・D12-2）。★較正定数ではなく**「良い報せ」の頻度の刻み**で、★見ているのは**既存の伸びの乱数 `GAIN_JITTER`（0.85〜1.15）の上側だけ**（★新しい抽選を足していない・正典 D-101）。★`rng.range` は一様なので割合は計算で出る — ★GREAT 6.67%（15 週に 1 回）・UP 10.00%（10 週に 1 回）。★動かすと**演出の頻度だけ**が変わり、★伸びそのもの（V-14）は 1 ビットも動かない。⚠️ ★動かしてよいのは「境目」だけで、★`GAIN_JITTER` のほうは較正済み（動かすと V-14 を測り直す）' },
  { key: 'TRAINING_STREAK_WEEKS', why: '★「N 週続けて良い仕上がりです」のバッジを出す週数（2・2026-09-16・D12-2）。★較正定数ではなく**見せ方の刻み**（★`TRAINING_RESULT_THRESHOLDS` と同じ性質）で、★動かすと**バッジの出る頻度だけ**が変わり、伸びそのもの（V-14）は 1 ビットも動かない。★当初カードは 3 週だったが、★UP 以上が 16.7% なので**3 週連続は 0.46%＝約 216 週に 1 回**で、★現役 182 週では 1 回も出ない馬が多数だった（★実測を出してデザイナーが 2 週＝2.8%・36 週に 1 回を採った）。⚠️ ★画面に週数を書かないこと（★ここが唯一の出どころ・D-052）' },
  { key: 'CONDITION_STEPS', why: '★調子の段階数（5）。★正典 §7.4 の 1〜5 の**写し**。★較正値ではなく段階の定義で、`condition.ts` の判定と同じ値を画面が読むために置いた（★二重帳簿にしないため、画面側に別の数を持たない）' },
  { key: 'V13_SE_FLOOR', why: '★V-13 で「散らない」とみなす SE の下限（1×10⁻¹²・2026-09-16・D-112 ③）。★較正定数ではなく**浮動小数の丸め残りを「散らばり」と読まないための線**。⚠️ ★実行で踏んだ: 「SE が 0 ちょうどなら散らない」と書いたところ、同じ計算をした値どうしでも丸め残り（5.8×10⁻¹⁷）が残り、`0.2 ÷ 5.8e-17` で **3.46×10¹⁵ σ** という無意味な数字が出力に出た（★人工の列では再現せず、検査は緑だった）。★倍率は 0.90〜1.10 の範囲なので 1×10⁻¹² は「差が無い」と言ってよい大きさ。★通すために動かせる値ではない — ★上げれば本物の散らばりを「散らない」と誤読し、下げれば丸め残りで σ が桁あふれする' },
  { key: 'AWAKENING_PROB', why: '正典 §7.6「素質が開花した！（1%）」の写し' },
  { key: 'B6_SAMPLING', why: '★B-6（D-050）の測定条件。出走馬の調子・疲労をどの方針・どの週から採るか（バランス型 / デビュー104週以降 / イベント有）。V-7・V-14・V-15 の錨と揃えてあり、較正定数ではなく測定条件。★通すために動かせる値ではない（動かすと V-4/V-5/V-6 が動くので、動かすなら再測定と報告が要る）' },
  { key: 'B6_WIRED', why: '★配線を有効にするかの旗（--b6-wired）。値ではなく実行条件。既定 false で、付けたときだけ実データに切り替わる' },
  { key: 'REAL_ABILITY', why: '★Q-P3-29: PLACEHOLDER_UNLOCK を使わず週ループが育てた現在能力を使うかの旗（--real-ability）。値ではなく実行条件で、既定 false' },
  { key: 'REAL_POOL', why: '★Q-P3-39: 本番から書き出した母集団を使うかの旗（--pool <file>）。値ではなく実行条件で、既定は合成母集団。★平均を合わせにいくのではなく分布そのものを持ち込むための口' },
  { key: 'TEMPER_BOUNDS', why: '正典 §5.2 の temper 値域 0..100 の写し（TEMPER_RANGE と同じ値。下限つき変化の上側の端として使う）' },
  { key: 'TRAIN_STREAM', why: '★乱数の用途ID（61〜64）。値そのものに意味は無く、他の乱数と衝突しないための番号。★ただし変えると較正済みの数字が再現しなくなるので、動かしてはいけない定数ではある（判定を通すために動かせる値ではない）' },
  { key: 'MAX_LIFE_WEEKS', why: '正典 §7.1 の 260週 + 1。★無限ループ防止の番人であり、判定条件ではない（ここに当たったら実装が壊れている）' },
  { key: 'AWAKENING_MULT', why: '正典 §7.6「potential のうち1形質 +5%」の写し' },
  { key: 'PUSH_THROUGH_TEMPER', why: '正典 §7.6「強行は…気性+10」の写し' },
  { key: 'EVENTS', why: '正典 §7.6 のイベント表（テキストと効果）。★選択肢の効果を data-driven にしたもので、個々の数値は AWAKENING_* / PUSH_THROUGH_* / COMMON_EVENT_PROB として別に登録済み' },
  { key: 'TEMPER_RANGE', why: '正典 §5.2 の temper 値域 0..100 の写し。D-044 の連続補間で両端として使う' },
  { key: 'FATIGUE_DIVISOR', why: '正典 §7.5 の (1 + fatigue / 40) の 40 の写し' },
  { key: 'DURABILITY_REFERENCE', why: '正典 §7.5 の (1000 / durability) の 1000 の写し' },
  { key: 'AGE_FACTOR', why: '正典 §7.5「4歳以降1.0 → 5歳末1.6 へ線形」の写し。★4歳未満の値は正典に規定が無く 1.0 に置いた（照会 Q-P3-9）' },
  { key: 'SEVERITY_TABLE', why: '正典 §7.5 の重篤度表（60/30/9/1%・休養週）の写し' },
  { key: 'MODERATE_SP_LOSS', why: '正典 §7.5「中度: potential SP -3%」の写し' },
  { key: 'SEVERE_ALL_LOSS', why: '正典 §7.5「重度: potential 全体 -8%」の写し' },
  { key: 'SEVERE_DURABILITY_LOSS', why: '正典 §7.5「重度: durability -100」の写し' },
  { key: 'FATIGUE_RANGE', why: '疲労の値域 0..100。★正典 §7.4 に上限の規定が無いため暫定で置いた値で、照会中（Q-P3-8）。判定を通すために動かす値ではない' },
  { key: 'FATIGUE_CAPS_CONDITION_AT', why: '正典 §7.4「疲労70以上は調子2止まり」の 70 の写し。★総当たりで、この規定は一度も効かないと判明（式が先に効く）。照会中（Q-P3-6）' },
  { key: 'CAPPED_CONDITION_MAX', why: '正典 §7.4「調子は最大2止まり」の 2 の写し' },
  { key: 'FATIGUE_RACE_PENALTY_AT', why: '正典 §7.4「疲労90以上で出走時に大幅マイナス（§8.3）」の 90 の写し' },
  { key: 'CONDITION_RANGE', why: '正典 §7.4「condition (0..5)」の値域の写し。段階値の定義そのもの' },
  { key: 'FATIGUE_PER_CONDITION_STEP', why: '正典 §7.4 の floor(fatigue / 25) の 25 の写し' },
  { key: 'CONDITION_BASE', why: '正典 §7.4 の base = 3 - ... の 3 の写し' },
  { key: 'HEADROOM_EXPONENT', why: '正典 §7.3 の headroom 指数 0.7 の写し' },
  { key: 'HEADROOM_EXP', why: 'diag-growth-scale.ts（実装前に桁を確かめる診断ツール）が持つ正典 §7.3 の写し。判定を作らない' },
  { key: 'GAIN_JITTER', why: '正典 §7.3 の rand(0.85, 1.15) の写し' },
  { key: 'TEMPER_COEF_RANGE', why: '正典 §7.3 の rand(0.9,1.1)（temper=0）と rand(0.5,1.3)（temper=100）の写し。★D-044 で2分類をやめ連続補間にしたため閾値の定数は無くなった（両端は正典の値のまま保存）' },
  { key: 'CONDITION_COEF_RANGE', why: '正典 §7.3 の「0.7〜1.3」の写し。★0..5 への対応づけは正典に無く、線形と決めた旨を照会中' },
  { key: 'GROWTH_CURVE', why: '正典 §7.3 の成長型カーブ表（104/156/208/260週）の写し' },
  { key: 'MENUS', why: '正典 §7.2 の調教メニュー表（疲労・EP・主効果の対象・気性への影響）と §7.5 の menuIntensity の写し。★係数だけが MAIN_EFFECT_COEF / SIDE_EFFECT_COEF として較正定数に登録済み' },
  { key: 'MENU_IDS', why: '§7.2 の8メニューの一覧。値ではなく集合の定義' },
  { key: 'DEFAULT_MENU', why: '正典 §7.1「指示を出さない週は軽め調整扱い」の写し' },
  { key: 'CYCLES_PER_WEEK', why: '正典 D-007（1週=4時間・1サイクル=10分）から決まる導出値 24。★別々に書くと片方だけ動いて静かにずれるので CYCLE_MS から導出しており、week.test.ts が正典の値と一致することを守る' },
  { key: 'WEEKS_PER_DAY', why: '正典 §7.1「1日6週」の導出値。テストがリテラル 6 と一致することを守る' },
  { key: 'WEEK_MS', why: '正典 D-007「1ゲーム内週 = リアル4時間」の導出値' },
  { key: 'FIELD_MIN', why: '★verify-race の掃引用の引数（--field-min）。★既定は FIELD_SIZE.MIN で、渡さない実行は 1 ビットも変わらない。'
    + '★CF-7（2026-09-18・裁定 REVIEW_CF5_CF6_VERDICT_20260918）で「平均 8 頭にすると V-4/V-5/V-6 が同時に外れるか」を測るために足した。'
    + '★較正値そのものではなく、★較正定数（FIELD_SIZE）を掃引するための口' },
  { key: 'FIELD_MAX', why: '★同上（--field-max）。★FIELD_SIZE.MAX が既定。★実測: 8〜8 にすると V-4 39.17% / V-5 73.07% / V-6 2.63% で 3 つとも FAIL' },
  { key: 'CLASS_BY_WINS', why: '★勝利数 → 段の対応（新馬/1勝/2勝/3勝。4 勝以上は open）。★正典 §10.3 のクラスそのもので、較正で動かす値ではない。'
    + '★CL-1（2026-09-18・指示書 DEV_INSTRUCTIONS_RACE_CLASS_20260918）で 1 か所に切り出した。★eligibility.test.ts が表と関数の一致を見る' },
  { key: 'CLASS_RANK', why: '★段の高さ（maiden 0 〜 open 4・graded は馬の側では open と同じ層）。★順序の写しで較正値ではない。'
    + '★資格を下へ広げるときの段数の数え方に使う（CL-3）' },
  { key: 'MINUTES_PER_SLOT', why: '★1 枠の分数（CYCLE_MS / 60,000 の導出値）。単位の換算そのもので、較正で動かす値ではない。'
    + '★2026-09-18・D-007 改訂 ④ で G1_SLOTS を時刻から導くために置いた' },
  { key: 'G1_HOURS_JST', why: '★G1 を置く時刻（日本時間 09/13/20 時）。正典 §10.3「G1 は視聴の集まる時間帯に固定し告知を打つ」の写しで、'
    + '★較正値ではない。★枠番号（G1_SLOTS）はここから導く — ★直書きすると、サイクル長を変えた日に時刻が黙ってずれる（D-007 改訂 ④）' },
  { key: 'DAY_MS', why: '★実時間 1 日のミリ秒（24×60×60×1000）。単位の換算そのもので、較正で動かす値ではない。'
    + '★AL-9（2026-09-18）で RACES_PER_DAY を CYCLE_MS から導くために置いた（D-100・裁定 REVIEW_CONSULT_ARCADE_LOOP_ANSWER_20260918）' },
  { key: 'LIFECYCLE_WEEKS', why: '正典 §7.1 のタイムライン表（78/104/260週）の写し。ルールそのもので較正で動かす値ではない' },
  { key: 'CAREER_RACE_LIMIT', why: '正典 §7.1「キャリア上限 24戦」の写し' },
  {
    key: 'SELECTED',
    why: 'F-4 の V-2e 分解で「レース選抜がかかる形質」を列挙した集合。数値の較正値ではなく形質キーの一覧で、V-2f が選抜対象として明示している集合と同じ。判定は変えず、内訳の見出しを分けるだけに使う',
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
    key: 'GENETICS_STREAM',
    why: '乱数ストリームの用途ID（遺伝・配合）。較正値ではなく識別子で、値の大小に意味はない。重複していないことは streams.test.ts が検査する',
  },
  {
    key: 'RACE_STREAM',
    why: '乱数ストリームの用途ID（レース解決）。同上',
  },
  {
    key: 'VERIFY_RACE_STREAM',
    why: '乱数ストリームの用途ID（verify-race）。同上。★§9.2 の「オッズ算出と本番確定は別系列」は ID が別であることで担保され、テストが照合する',
  },
  {
    key: 'VERIFY_PAYOUT_STREAM',
    why: '乱数ストリームの用途ID（verify-payout / A-3）。同上',
  },
  {
    key: 'PRESEED_STREAM',
    why: '乱数ストリームの用途ID（NPCプリシード）。同上',
  },
  {
    key: 'DIAGNOSTIC_STREAM',
    why: '乱数ストリームの用途ID（切り分け用の診断ツール専用・本番経路では使わない）。同上',
  },
  {
    key: 'VERIFY_BAND_STREAM',
    why: '乱数ストリームの用途ID（★帯の下のゲート・D-079 ④ の測定ハーネス）。同上。★育成の週送り（TRAIN_STREAM 61〜64）と本番ワーカーの出走表（build-race.ts の 61・62）が登録簿の外で 61 番台を使っているため、71 番台を取っている',
  },
  {
    key: 'ALL_STREAM_TABLES',
    why: '用途ID表の一覧。重複検査の走査範囲そのもので、較正値ではない。表を足してここに入れ忘れると ★テストが落ちる（R-19）',
  },
  {
    key: 'MARGIN_ALERT_THRESHOLD',
    why: '正典 §11.2「margin_actual の乖離3%でアラート」の写し。監視の閾値であって較正値ではない。両側で判定することを ★テストが押さえている',
  },
  {
    key: 'DISTANCE_MENU',
    why: '番組表が使う距離の一覧。正典 §8.2 の距離帯の写しで、較正値ではない。全帯が1日に現れることを ★テストが押さえる',
  },
  {
    key: 'DIRT_RATIO',
    why: 'ダート開催の割合。★正典 §10.3 に規定が無いため暫定で置いた値（照会中）。芝ダート両方が出ることは ★テストが押さえる',
  },
  {
    key: 'SURFACE_PERIOD',
    why: '★馬場を決める剰余の周期 8（`(i * 3) % 8 < DIRT_RATIO * 8`）。DIRT_RATIO = 3/8 の分母そのもので、較正値ではない。★2026-09-15 に COURSE_IDS（C1〜C4）を廃し、競馬場を「その馬場のレースの通し番号」で回すために名前を付けた。10 場へ均等に配れることは ★conditions.test.ts が 1 週分数えて検査する',
  },
  {
    key: 'LEGACY_CONDITIONS',
    why: '★`verify-race.ts` の `--legacy-conditions` の真偽値（2026-09-15・指示書 VW §7-1）。数値ではなく、既定（本番の条件）と旧来の条件を切り替えるだけの旗。★走査が数字を拾うのは後続行の註記の数字で、較正値を持たない',
  },
  {
    key: 'KNOWN_KEYS',
    why: '★凍結した走路の形（course-frozen.ts）が持ってよい項目名の集合。数値ではなく、版を上げずに項目を足したら投げるための一覧。★走査が数字を拾うのは後続行の数字で、較正値を持たない。★course-frozen.test.ts が知らない項目で投げることを検査する',
  },
  {
    key: 'DAY_ROTATION',
    why: '★芝のレースが 1 日 90 本で 10 場に割り切れるとき、同じ枠に毎日同じ場が来ないよう 1 日ごとにずらす場の数（3）。10 と互いに素であることだけが要件で、結果の分布（均等）を動かす較正値ではない。★conditions.test.ts が「10 日でクラスごとの芝の本数が 10 場で等しい」を検査する',
  },
  {
    key: 'BASE_WEIGHT_KG',
    why: '★基準斤量 55kg（§8.3）。`race-field.ts` の `generateRace`・確定がこれまで直書きしていた 55 の写しで、凍結した走路の形から条件を作る関数（course-frozen.ts）が同じ値を返すために置く。較正値ではなく、★course-frozen.test.ts が 55 であることを検査する',
  },
  {
    key: 'RACES_PER_DAY',
    why: '正典 §10.3 の1日144R。10分サイクル×24時間からの導出で、較正値ではない。クラス別R数の合計と一致することを ★テストが検査する',
  },
  {
    key: 'RACES_BY_CLASS',
    why: '正典 §10.3 のクラス別R数の写し（新馬42/1勝36/2勝24/3勝18/OP15/重賞9）。合計144の検査つき',
  },
  {
    key: 'GRADED_PER_WEEK',
    why: '正典 §10.3 の重賞週次頻度の写し（G1=3/G2=8/G3=20）。G1 が週ちょうど3回になることを ★テストが検査する',
  },
  {
    key: 'G1_SLOTS',
    why: 'G1 を置く時間帯（枠番号）。正典 §10.3「視聴の集まる時間帯に固定」の具体化で、時刻の選択であって較正値ではない',
  },
  {
    key: 'JST_OFFSET_MINUTES',
    why: '★日本時間のずれ（540 分）。★物理的な定数で較正値ではない（★時間帯を日本時間で固定する・オーナー決定 2・2026-09-15）。★`first-pass-time-of-day.test.ts` ⑤ が値を固定する',
  },
  {
    key: 'TIME_OF_DAY_BANDS',
    why: '★何時から朝・昼・夕・夜とするかの対応表（★描画の見た目だけ・着順にもポイントにも効かない・計画書 C-1・2026-09-15）。★開発側の仮置きで、★オーナーの目で決める値。★D-052 の「データとして 1 か所」',
  },
  {
    key: 'G1_DAYS',
    why: 'G1 を打つ曜日と枠。正典に曜日の規定が無いため解釈（照会中）。週3回に収めるための配置で、較正値ではない',
  },
  {
    key: 'CYCLE_MS',
    why: '正典 §10.2 / D-007 の10分サイクルそのもの。較正で動かす値ではなくゲームの構造で、値の一致は scheduler のテストが照合する',
  },
  {
    key: 'PHASE_OFFSET_MS',
    why: '正典 §10.2 のタイムテーブルの写し（確定0:00/公開0:30/発売3:00/締切9:30/発走10:00）。順序が単調増加であること自体を ★テストが押さえている',
  },
  {
    key: 'LOOKAHEAD_RACES',
    why: '正典 §10.2「生成は2レース先まで先行実行」の写し。障害時バッファの深さで、判定（V-x）を作らない。'
      + '★**2026-09-19・D-117** で **fill**（出走表とオッズを入れる段）の先行数になった。'
      + '★**締切はここから導く**（`entryDeadlineMs = cycleStartMs(N − LOOKAHEAD_RACES)`）',
  },
  {
    key: 'ANNOUNCE_AHEAD_RACES',
    why: '★**枠だけ先に告知しておくサイクル数**（★**D-117**・2026-09-19）。'
      + '★較正値ではなく**登録の窓の長さの決め**で、★着順にも経済にも入らない。'
      + '★窓 ＝ (ANNOUNCE_AHEAD_RACES − LOOKAHEAD_RACES) サイクル ＝ **12 分**（6 分 × 2）。'
      + '🔴 ★**物理の制約ではありません** — ★番組表は純関数なのでどこまで先でも作れる。'
      + '★重賞を狙って出せるようにするなら延ばす（★DS-5・オーナー判断）。'
      + '⚠️ ★fill の持ち時間（締切 → 発売開始）は **780 秒 ＝ 13 分**で、★オッズの 98 秒（本番機換算）に対し **7.96 倍**',
  },
  {
    key: 'MAX_FILLS_PER_CYCLE',
    why: '★**1 周で組成してよいレースの本数**（★**D-117 DS-9**・2026-09-19）。'
      + '★較正値ではなく**時間配分の決め**で、★着順にも経済にも入らない（★何本作るかは変わらない — ★いつ作るかだけ）。'
      + '★根拠: 1 周 360 秒 ÷ オッズ 1 本 70〜98 秒（AL-6 の実測）。★2 本 ＝ 最悪 196 秒で、残り 164 秒が確定に残る。'
      + '★3 本だと 294 秒で残り 66 秒しかない。★平常時に要るのは 1 本なので、★取り戻しの余力は 2 倍。'
      + '⚠️ ★**開発機は 160 秒/本**なので 2 本で 320 秒 — ★開発機で溜めると遅れが続く（★`fillDeferred` に出る・DS-8）',
  },
  {
    key: 'MIN_STAKE',
    why: '正典 §9.1 の最小購入単位 100 EP の写し。判定（V-x）を作らず、値の一致は betting のテストが照合する',
  },
  {
    key: 'BET_LIMITS',
    why: '正典 §9.4 のベット上限の写し。射幸性抑制とエクスプロイト時の被害上限で、較正で動かす値ではない。値の一致はテストが照合する',
  },
  {
    key: 'OWN_HORSE_RACE_LIMIT',
    why: '正典 §9.5 の自馬出走レース上限 5,000 EP の写し。八百長利得の遮断装置そのもので、較正値ではない',
  },
  {
    key: 'PLACE_THREE_MIN_FIELD',
    why: '正典 §9.1「出走7頭以下は複勝・ワイドを2着まで」の境界。実競馬の慣行の写しで、較正で動かす値ではない。両側の挙動を ★テストが押さえている（R-2）',
  },
  {
    key: 'MAX_ODDS_TENTHS',
    why: '★オッズ（0.1 単位の整数）として受け付ける上限（2026-09-14・監査 H-1/H-2）。DB の列型 `numeric(9,1)` の最大 99,999,999.9 倍の写しで、較正値ではない。§9.4 の上限（三連単 100,000 倍）より十分大きく、判定（V-x）を作らない。越えたら例外にする安全弁（R-3）',
  },
  {
    key: 'EVEN_ODDS_TENTHS',
    why: '★D-096 の境界「1.0 倍」を 0.1 単位の整数で表したもの（2026-09-14・AUDIT_FIX2 BF-5）。正典の写しで、較正値ではない。これ未満の目は売らない。境界の両側は `sell-decision.test.ts` が押さえる（R-2）',
  },
  {
    key: 'V10_TOLERANCE',
    why: '★正典 §13.2「設定 margin ±1%」の写し（2026-09-14・AUDIT_FIX2 BF-6）。V-10 の判定幅で、較正値ではない。判定の両側は `v10-accounting.test.ts` が押さえる',
  },
  {
    key: 'V10_SE_LIMIT',
    why: '★正典 §13.2（D-036）「プール SE ≤ 0.25pt」の写し（2026-09-14・AUDIT_FIX2 BF-6）。測定の精度の条件で、較正値ではない。届かなければ判定不能（R-3）',
  },
  {
    key: 'DECIMAL_ODDS',
    why: '★DB が返す十進の文字列（`numeric(9,1)`）の書式を表す正規表現（2026-09-14・監査 H-1）。数値ではなく書式の定義で、正規表現の中の桁数に走査が反応している。較正値ではない。受け付ける形と弾く形は `odds-tenths.test.ts` が両側から押さえる（R-2）',
  },
  {
    key: 'TICKET_ARITY',
    why: '券種ごとに必要な馬番の数（単勝1・馬連2・三連単3）。定義であって較正値ではない',
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
