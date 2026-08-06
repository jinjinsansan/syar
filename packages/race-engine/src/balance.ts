/**
 * レース定数（正典 §8・§13.1）
 *
 * 正典 §13「全定数は config として外出しし、コードにベタ書きしない」に従い、
 * すべてここに集約して `RaceBalance` として注入する。
 *
 * ★このファイルには2種類の値がある:
 *   (1) **正典に明記された値** — 変更にはオーナー承認＋正典改訂が要る
 *   (2) **開発側の解釈で埋めた値** — 正典が範囲や意図だけ述べて式を定めていない箇所
 *
 * (2) は必ず `INTERPRETATIONS` に登録すること。報告書 §7「仕様からの逸脱・解釈で埋めた箇所」は
 * この配列から**実行時に生成**する（R-10: 数える成果物は静的検索でなく実行時計測で出す）。
 * 手で書いた一覧は必ず漏れる。
 */

import type { AbilityKey, Strategy } from '@star/sim-engine';
import type { DistanceBand, Pace, Surface, TrackCondition } from './types.js';

// ---------------------------------------------------------------------------
// 解釈の登録簿
// ---------------------------------------------------------------------------

export interface Interpretation {
  /** 一意なID（報告書・指示書からの参照キー） */
  id: string;
  /** 正典の該当箇所 */
  canon: string;
  /** 正典が定めていること */
  given: string;
  /** 開発側が埋めたこと */
  filled: string;
  /** なぜその形にしたか */
  rationale: string;
}

/**
 * ⚠️ 正典が式を定めていない箇所の全件。**追加したら必ずここに登録する。**
 *    報告書 §7 はこの配列を実行時に出力して作る（`npm run race:interpretations`）。
 */
export const INTERPRETATIONS: readonly Interpretation[] = [
  {
    id: 'I-DIST-MAP',
    canon: '§8.3',
    given: '距離適性(§5.2)を 0.75〜1.05 にマップ',
    filled: '距離適性 a(0〜100) の線形写像 `0.75 + a/100 * 0.30`',
    rationale:
      '正典は値域だけ与えて写像の形を定めていない。§5.2 の距離適性自体が既に正規分布カーブ' +
      'なので、ここで再度非線形にすると二重に効く。線形が最も素直で、較正は K に集約できる。',
  },
  {
    id: 'I-SURF-MAP',
    canon: '§8.3',
    given: '芝/ダート適性を 0.70〜1.05 にマップ',
    filled: '適性 a(0〜100) の線形写像 `0.70 + a/100 * 0.35`',
    rationale:
      'I-DIST-MAP と同じく正典は値域だけを与えている。芝/ダート適性は §5.2 で 0〜100 の素の値' +
      'として定義されており非線形変換を挟む根拠が無いため、線形写像を採る。',
  },
  {
    id: 'I-COND-APT-MAP',
    canon: '§8.3 / §5.2',
    given: '馬場状態適性。良馬場は常に1.0',
    filled:
      '良は適性値によらず 1.0。稍重/重は適性 a(0〜100) を `0.88 + a/100 * 0.17`（0.88〜1.05）に写像',
    rationale:
      '「良は常に1.0」は明記されている。悪化時の幅は未定義なので、surfaceCoef より狭い幅を置いた' +
      '（馬場状態は馬場種別より影響が小さいという競馬の通念）。V-4〜V-6 の較正対象。',
  },
  {
    id: 'I-COND-APT-SOURCE',
    canon: '§5.2 / §5.4',
    given: '`condition_aptitude` は馬のパラメータとして定義されている',
    filled:
      'genotype スキーマ(§5.4)に無いため**遺伝しない**。race-engine の入力として受け取り、' +
      'K-5 のモンテカルロでは中立値(50)を置く',
    rationale:
      '正典の §5.2 と §5.4 が食い違っている。推測で genotype を拡張すると P0 の全ゲートに影響する' +
      'ため、QUESTIONS_P1 で照会し、それまでは入力として外に出した。',
  },
  {
    id: 'I-CONDITION-MAP',
    canon: '§8.3',
    given: '調子 0.88〜1.10',
    filled: '調子 c(1〜5) の線形写像 `0.88 + (c-1)/4 * 0.22`（c=3 で 0.99）',
    rationale:
      '調子の値域は正典に明記が無いが、§8b.2 が `(condition - 3) * 4` と書くので中央値3の1〜5と読んだ。' +
      'c=3 が 1.00 ちょうどにならないのは値域の端を 0.88/1.10 に固定した帰結。',
  },
  {
    id: 'I-GATE-MAP',
    canon: '§8.3',
    given: '枠順。距離とコース形態で内外の有利不利',
    filled:
      '直線コースは枠順無影響(1.0)。周回コースは内枠有利で、短距離ほど強い: ' +
      '`1 + (1 - 2*(gate-1)/(fieldSize-1)) * GATE_MAX_EDGE * distanceFactor`',
    rationale:
      '正典は向きだけ述べ、式も強さも定めていない。競馬の通念（周回コースの内枠は距離損が小さい／' +
      '短距離ほどポジション争いの比重が大きい）を最小限の形で表現した。GATE_MAX_EDGE は較正対象。',
  },
  {
    id: 'I-AGE-CURVE',
    canon: '§8.3',
    given: '2歳0.88 → 4歳1.00 → 5歳末0.96',
    filled: '2→3→4歳を線形補間し、4歳以降は5歳末0.96へ線形に低下。6歳以降は0.96で頭打ち',
    rationale:
      '3歳の値と5歳の下がり方が未定義。3点を線形でつなぐのが最も仮定が少ない。' +
      '6歳以降は正典に記述が無いが、§7.1 のタイムラインで現役は概ね5歳までのため頭打ちで足りる。',
  },
  {
    id: 'I-SKILL-SEGMENT',
    canon: '§8.5 / §8.1',
    given: '「直線区間スコア +12%」等、区間単位の効果',
    filled:
      '§8.1 が区間シミュレーションを禁じているため、区間効果を**区間の距離シェアで按分**して ' +
      '`skillCoef` に畳み込む（直線 = STRAIGHT_METERS/distance）',
    rationale:
      '区間を持たない設計で区間効果を全体に丸ごと掛けると +12% が過大になる。' +
      '按分は「その区間だけ速い」の1次近似で、距離依存性（短距離ほど直線の比重が大きい）も自然に出る。',
  },
  {
    id: 'I-SKILL-POSITION',
    canon: '§8.5',
    given: '発動条件に「6番手以下」「先頭」など走行中の位置取りを使う',
    filled: '位置取りを持たないため**脚質を代理変数**にする（差し/追込=6番手以下、逃げ=先頭）',
    rationale:
      '§8.1 が位置取りを着順確定後の逆生成と定めており、判定時点では存在しない。' +
      '脚質は位置取りの設計上の決定要因そのものなので代理として妥当。',
  },
  {
    id: 'I-SPEED-MODEL',
    canon: '§8.7',
    given: '`baseTime = distance / averageSpeed(distance, surface, condition)`',
    filled:
      '`averageSpeed` の中身が未定義。芝良の基準を 16.6 m/s とし、距離・馬場・馬場状態で補正する表を置いた',
    rationale:
      'タイムは表示用でスコアや着順に影響しない（着順は finalScore 降順・§8.7）。' +
      'したがってここの精度は判定に波及しない。実測タイムに寄せる較正は P4 の演出時で足りる。',
  },
  {
    id: 'I-MARGIN-LABELS',
    canon: '§8.7',
    given: '`<0.03秒=ハナ, <0.06=アタマ, <0.10=クビ, <0.16=1/2馬身, …`（以降は省略）',
    filled: '省略部分を 3/4馬身・1馬身・…・大差 まで延長した表を置いた',
    rationale: '表示ラベルのみで判定に影響しない。明記された4段はそのまま使っている。',
  },
  {
    id: 'I-STAMINA-WINDOW',
    canon: '§8b.2',
    given: 'ゲージ初期値 ≤100 / 毎秒消費 1.0×ポジション係数（仕掛け中3倍・早仕掛けさらに1.6倍）',
    filled: 'ゲージが減るのは**勝負所（残り800m）以降**とする（`STAMINA_WINDOW_METER = 800`）',
    rationale:
      '★正典の構造的不整合。2000m≒120秒に毎秒1.0〜4.8を当てると消費は120〜576となり、' +
      '上限100のゲージは**どんな馬でも必ず0になる**。結果 §8b.3 の -0.15 が全馬に常時適用され、' +
      '介入の巧拙が結果に出ない。ゲージを「勝負所以降の余力」と読むと数値が整合する。' +
      'QUESTIONS_P1 で照会中であり、正典側の是正が入ればこの解釈は破棄する。',
  },
  {
    id: 'I-STAMINA-EMPTY',
    canon: '§8b.3',
    given: '早仕掛けペナルティ: 残り900m超で仕掛けたら消費1.6倍、ゴール前にゲージ0なら -0.15',
    filled: '「バテ」= **直線（残り400m）に入る前に**ゲージが尽きた場合（`STAMINA_EMPTY_METER = 400`）',
    rationale:
      '「ゴール前にゲージ0」を字義どおり取ると、ゴール直前に使い切る最適プレイも罰される。' +
      'この一文は「早仕掛けペナルティ:」の見出しの下にあり、早仕掛けの帰結を述べたものと読んだ。' +
      '余力を残してゴールするのは走り足りないということなので、使い切ること自体は罰しない。',
  },
  {
    id: 'I-START-CURVE',
    canon: '§8b.3 / §8b.6',
    given: 'スタート判定の効果 -0.04〜+0.03。判定幅は IQ に比例＋ラグ猶予 ±150ms',
    filled:
      '判定窓 = `150ms × (1 + IQ/1000)`。誤差0を頂点に窓の縁で下限へ落ちる線形の連続関数',
    rationale:
      '当初「窓の内側は一律満点」にしたが、それだと AI 代行がほぼ常に満点を取り V-8/V-9 の' +
      '較正余地が消えた（実測で判明）。連続関数にすると IQ の効果も滑らかに出る。',
  },
  {
    id: 'I-SPURT-CURVE',
    canon: '§8b.3',
    given: '「仕掛け」タイミングの適否で -0.08〜+0.09',
    filled: '最適点を残り495m（= EARLY_SPURT_METER × 0.55）とし、±450m で下限へ落ちる線形',
    rationale:
      '正典は最適点も減衰の形も定めていない。早仕掛けの境界が残り900m なので、' +
      'その内側かつ直線(400m)より手前に最適点を置くのが各定数と矛盾しない唯一の帯。',
  },
  {
    id: 'I-AI-QUALITY',
    canon: '§8b.5 / §13.2 V-8',
    given: 'AI 代行の期待値 ≒ 手動の約95%（合格域 93〜97%）',
    filled:
      'AI の入力精度を4定数（スタート誤差の散らばり・仕掛け位置の散らばり・連打率の下限/上限）' +
      'で表し、V-8 を満たすようモンテカルロで較正する',
    rationale:
      '正典は結果（95%）だけを定め、AI の挙動を数値で定めていない。' +
      '「上手い手動は上回り、下手な手動は下回る」を満たすには AI を確率的にする必要がある。',
  },
  {
    id: 'I-REPLAY-POSITION',
    canon: '§8b.4 / §8.8',
    given: 'クライアントは入力イベント（種別＋時刻）のみ送り、サーバーが記録する',
    filled: '道中のポジション指示は**中団固定**として再現する',
    rationale:
      '`InterventionInput` は種別と時刻しか持たず、内/外・前/後の別を持たない。' +
      'ログだけからポジションを一意に復元できないため、再現時は中立値に倒す。' +
      '§8b.4 のログ形式にポジション指示の内容を含める必要がある（照会中）。',
  },
  {
    id: 'I-DRIVE-WINDOW',
    canon: '§8b.3 / §8.8',
    given: '直線は連打 or リズムタップ。連打は秒間15回で頭打ち',
    filled: '連打レートを求める集計区間を 24 秒（直線400m ÷ 平均速度）とする',
    rationale:
      '正典は「直線」としか書かず秒数を定めていない。ログの件数から秒間レートへ換算するには' +
      '区間長が要る。距離やコースで変わりうるが、P1 では定数で足りる。',
  },
  {
    id: 'I-ENTROPY-SORT',
    canon: '§8.6',
    given: 'client_entropy = 全出走馬IDのハッシュ結合',
    filled: '**IDをソートしてから**結合する（順序非依存の集合ハッシュ）',
    rationale:
      '「結合」の順序が定められていない。枠順は締切後の抽選で決まるため順序依存にすると、' +
      '同じ出走馬・同じ server_seed でも entropy が変わり検証者が再計算できない。',
  },
  {
    id: 'I-SEED-FOLD',
    canon: '§8.6',
    given: 'final_seed = HMAC-SHA256(...)（256bit）',
    filled: '256bit を 32bit ごとに XOR で畳んで `Rng` のシードにする',
    rationale:
      'PRNG（xoshiro128**）は 32bit シードを取るが、正典は畳み方を定めていない。' +
      '先頭32bitだけを使うとハッシュの一部しか結果に効かず、' +
      '「final_seed 全体が結果を決めている」という Provably Fair の主張が弱くなる。',
  },
  {
    id: 'I-SCORE-FLOOR',
    canon: '§8.7',
    given: 'finalScore = score × (1 + gaussian(0,K)) × interventionMult',
    filled: '`Math.max(0, …)` で下限0にする',
    rationale:
      '乱数が −1 を下回ると符号が反転し、着順の意味が壊れる（最弱が1着になる）。' +
      'K=0.26 では約3.8σ で起こりうるため塞ぐ。正典に記述は無い。',
  },
  {
    id: 'I-MARGIN-BASIS',
    canon: '§8.7',
    given: '着差ラベル: `<0.03秒=ハナ, …`',
    filled: 'ラベルは**前の馬との差**で出す（1着との差ではない）',
    rationale:
      '正典は timeGap を「1着との差」と定義する一方、着差ラベルの基準を書いていない。' +
      '競馬の着差表記は直前の馬との差なのでそちらを採った。表示のみで判定に影響しない。',
  },
  {
    id: 'I-STRATEGY-APT-MAP',
    canon: '§8.4',
    given: '脚質適性 `strategy_aptitude[選択脚質]/100` が 0.85〜1.05 で効く',
    filled: '適性 a(0〜100) の線形写像 `0.85 + a/100 * 0.20`',
    rationale:
      '正典は `/100` と値域を書いているが、両者を同時に満たす式は書かれていない。線形写像が素直。',
  },
];

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 距離帯の境界（正典 §8.2 の表そのまま） */
export const DISTANCE_BANDS: readonly { band: DistanceBand; maxDistance: number }[] = [
  { band: 'sprint', maxDistance: 1400 },
  { band: 'mile', maxDistance: 1800 },
  { band: 'intermediate', maxDistance: 2200 },
  { band: 'long', maxDistance: 2800 },
  { band: 'extended', maxDistance: Number.POSITIVE_INFINITY },
];

/** 距離帯ごとの能力重み（正典 §8.2 の表そのまま） */
export const ABILITY_WEIGHTS: Readonly<Record<DistanceBand, Readonly<Record<AbilityKey, number>>>> =
  {
    sprint: { sp: 0.42, st: 0.08, pw: 0.24, gt: 0.16, iq: 0.1 },
    mile: { sp: 0.34, st: 0.18, pw: 0.18, gt: 0.2, iq: 0.1 },
    intermediate: { sp: 0.28, st: 0.26, pw: 0.16, gt: 0.2, iq: 0.1 },
    long: { sp: 0.22, st: 0.34, pw: 0.14, gt: 0.2, iq: 0.1 },
    extended: { sp: 0.18, st: 0.42, pw: 0.12, gt: 0.19, iq: 0.09 },
  };

/** 展開による脚質補正（正典 §8.4 の表そのまま） */
export const PACE_STRATEGY_EFFECT: Readonly<Record<Pace, Readonly<Record<Strategy, number>>>> = {
  high: { nige: -0.1, senko: 0, sashi: 0.08, oikomi: 0.08 },
  middle: { nige: 0, senko: 0, sashi: 0, oikomi: 0 },
  slow: { nige: 0.09, senko: 0.09, sashi: 0, oikomi: -0.08 },
};

/** 発動型スキル（正典 §8.5 の表） */
export interface SkillSpec {
  gene: string;
  label: string;
  /** 効果の大きさ（区間スコア倍率の増分。例 +0.12） */
  magnitude: number;
  /** 効果が及ぶ区間。'straight' は距離シェア按分（I-SKILL-SEGMENT）、'whole' は全体 */
  scope: 'straight' | 'whole' | 'special';
}

export const SKILLS: readonly SkillSpec[] = [
  { gene: 'G_SPURT', label: '末脚爆発', magnitude: 0.12, scope: 'straight' },
  { gene: 'G_HOLD', label: '逃げ粘り', magnitude: 0.1, scope: 'straight' },
  { gene: 'G_GATE', label: 'ゲート巧者', magnitude: 0, scope: 'special' },
  { gene: 'G_MUD', label: '雨得意', magnitude: 0, scope: 'special' },
  { gene: 'G_INNER', label: '内枠強者', magnitude: 0.05, scope: 'special' },
  { gene: 'G_STAYER', label: '長距離砲', magnitude: 0.15, scope: 'special' },
];

export interface RaceBalance {
  /** 正典 §13.1 RACE_RANDOM_K。上げるとレースが荒れる */
  RACE_RANDOM_K: number;
  /**
   * 介入倍率のハードキャップ幅（正典 §13.1 INTERVENTION_CAP / 憲法 §1.5-1）。
   * ★`InterventionBalance` にも同名の定数があるが、**スコア確定点である resolveRace が
   *   介入モジュールに依存せずに自力でクランプできる**ようにこちらにも持つ（O-3）。
   *   両者が食い違わないことは `race.test.ts` が固定する。
   */
  INTERVENTION_CAP: number;
  /**
   * 案D: 乱数を**裾の厚い混合分布**にする。
   *   ε ~ 確率(1-p) で N(0, K) / 確率 p で N(0, m·K)
   *
   * ★正規分布は裾が指数的に減衰するため、最下位人気が勝つのに必要な大偏差が
   *   構造的に潰される（＝V-6 が死ぬ数学的な正体）。K を動かしても直らない:
   *   K は V-4 と V-6 を必ず逆方向に動かすだけで、**比を変えられない**。
   *   裾を厚くすると大偏差の確率が桁で上がる一方、1番人気は既に約69%負けているので
   *   稀な大偏差が加わっても勝率の低下は限定的 — K が持っていない非対称性がある。
   * ★現実の競馬に大穴があるのは「その日だけ格上の走りをする馬がいる」からで、
   *   単一の正規分布では表現できない。
   */
  TAIL_MIX_P: number;
  TAIL_MIX_M: number;

  /** 発動率 = SKILL_FIRE_BASE + IQ / SKILL_FIRE_IQ_DIV（正典 §8.5） */
  SKILL_FIRE_BASE: number;
  SKILL_FIRE_IQ_DIV: number;

  /** 距離適性の写像（I-DIST-MAP） */
  DISTANCE_COEF_MIN: number;
  DISTANCE_COEF_MAX: number;
  /** 馬場適性の写像（I-SURF-MAP） */
  SURFACE_COEF_MIN: number;
  SURFACE_COEF_MAX: number;
  /** 馬場状態適性の写像（I-COND-APT-MAP。良馬場は常に 1.0） */
  TRACK_COND_COEF_MIN: number;
  TRACK_COND_COEF_MAX: number;
  /** 調子の写像（I-CONDITION-MAP） */
  CONDITION_COEF_MIN: number;
  CONDITION_COEF_MAX: number;
  CONDITION_MIN: number;
  CONDITION_MAX: number;
  /** 脚質適性の写像（I-STRATEGY-APT-MAP） */
  STRATEGY_APT_COEF_MIN: number;
  STRATEGY_APT_COEF_MAX: number;

  /** 疲労: `1 - fatigue / FATIGUE_DIV`（正典 §8.3） */
  FATIGUE_DIV: number;
  /** 斤量: 基準から ±1kg ごとに ∓WEIGHT_PER_KG（正典 §8.3） */
  WEIGHT_PER_KG: number;

  /** 枠順の最大有利幅（I-GATE-MAP） */
  GATE_MAX_EDGE: number;
  /** 枠順補正が最大になる距離／消えはじめる距離（I-GATE-MAP） */
  GATE_FULL_DISTANCE: number;
  GATE_ZERO_DISTANCE: number;

  /** 年齢曲線（正典 §8.3 の3点・I-AGE-CURVE） */
  AGE_COEF_2: number;
  AGE_COEF_4: number;
  AGE_COEF_5_END: number;

  /** 直線の距離（I-SKILL-SEGMENT の按分に使う） */
  STRAIGHT_METERS: number;
  /** 長距離砲の発動距離（正典 §8.5: 2400m以上） */
  STAYER_SKILL_DISTANCE: number;
  /** 長距離砲の ST 寄与増分（正典 §8.5: +15%） */
  STAYER_ST_BONUS: number;
  /** 雨得意が上書きする trackConditionCoef（正典 §8.5: 1.06） */
  MUD_SKILL_COEF: number;
  /** 内枠強者の適用枠（正典 §8.5: 枠1〜4）と増分（+5%） */
  INNER_SKILL_MAX_GATE: number;

  /** 展開判定（正典 §8.4） */
  PACE_HIGH_NIGE_COUNT: number;
  PACE_SLOW_NIGE_COUNT: number;

  /** タイム生成（I-SPEED-MODEL / 正典 §8.7） */
  BASE_SPEED_MPS: number;
  SPEED_SURFACE_MULT: Readonly<Record<Surface, number>>;
  SPEED_CONDITION_MULT: Readonly<Record<TrackCondition, number>>;
  /** 距離が伸びるほど平均速度が落ちる係数（1000m ごと） */
  SPEED_DISTANCE_DECAY_PER_1000M: number;
  /** 着差→タイム変換の係数（正典 §8.7: 0.55） */
  TIME_GAP_FACTOR: number;
}

/**
 * `RACE_RANDOM_K`。**2026-08-05 の D-016 で正典 §13.1 が 0.12 → 0.26 に改訂された**ため、
 * これは正典の写しである（P1 提出時は「較正値・正典外」だった）。
 *
 * 経緯: K=0.12 では 1番人気の勝率が実測 51.6% で V-4（30〜34%）を大きく外れた。
 * §8.7 の「実装後に必ずモンテカルロ10万レースで人気別勝率を較正する」に従って 0.26 を求め、
 * 照会（QUESTIONS_P1 Q3）の結果 D-016 で正典化された。§8.7 の「0.12 は30%前後」は誤りとして訂正済み。
 *
 * ⚠️ **較正条件（正典 §13.1 に明記）**: 素質開放率プレースホルダ(0.55〜0.85)・クラス分け番組・18頭立て。
 *    P3 で本物の育成ループが入ったら**必ず再較正すること**（R-7）。
 *    この前提が壊れていないことは `apps/cli/test/calibration.test.ts` が経路で固定する（O-4）。
 */
export const CALIBRATED_RACE_RANDOM_K = 0.22;

/** 案D: 大偏差を引く確率（較正対象） */
export const TAIL_MIX_P_DEFAULT = 0.03;

/** 案D: 大偏差のときの幅の倍率（較正対象） */
export const TAIL_MIX_M_DEFAULT = 5;

export const DEFAULT_RACE_BALANCE: RaceBalance = {
  // ★二重管理を作らない（G-0/I-2a/L-2 で三度潰したクラス）。定義は1か所だけ
  RACE_RANDOM_K: CALIBRATED_RACE_RANDOM_K,
  INTERVENTION_CAP: 0.1,
  TAIL_MIX_P: TAIL_MIX_P_DEFAULT,
  TAIL_MIX_M: TAIL_MIX_M_DEFAULT,

  SKILL_FIRE_BASE: 0.4,
  SKILL_FIRE_IQ_DIV: 2000,

  DISTANCE_COEF_MIN: 0.75,
  DISTANCE_COEF_MAX: 1.05,
  SURFACE_COEF_MIN: 0.7,
  SURFACE_COEF_MAX: 1.05,
  TRACK_COND_COEF_MIN: 0.88,
  TRACK_COND_COEF_MAX: 1.05,
  CONDITION_COEF_MIN: 0.88,
  CONDITION_COEF_MAX: 1.1,
  CONDITION_MIN: 1,
  CONDITION_MAX: 5,
  STRATEGY_APT_COEF_MIN: 0.85,
  STRATEGY_APT_COEF_MAX: 1.05,

  FATIGUE_DIV: 500,
  WEIGHT_PER_KG: 0.008,

  GATE_MAX_EDGE: 0.02,
  GATE_FULL_DISTANCE: 1200,
  GATE_ZERO_DISTANCE: 2800,

  AGE_COEF_2: 0.88,
  AGE_COEF_4: 1.0,
  AGE_COEF_5_END: 0.96,

  STRAIGHT_METERS: 400,
  STAYER_SKILL_DISTANCE: 2400,
  STAYER_ST_BONUS: 0.15,
  MUD_SKILL_COEF: 1.06,
  INNER_SKILL_MAX_GATE: 4,

  PACE_HIGH_NIGE_COUNT: 3,
  PACE_SLOW_NIGE_COUNT: 1,

  BASE_SPEED_MPS: 16.6,
  SPEED_SURFACE_MULT: { turf: 1.0, dirt: 0.975 },
  SPEED_CONDITION_MULT: { good: 1.0, yielding: 0.99, soft: 0.975, bad: 0.96 },
  SPEED_DISTANCE_DECAY_PER_1000M: 0.022,
  TIME_GAP_FACTOR: 0.55,
};

/** 着差ラベル（正典 §8.7。明記された4段＋延長分は I-MARGIN-LABELS） */
export const MARGIN_LABELS: readonly { maxGapSec: number; label: string }[] = [
  { maxGapSec: 0.0, label: '同着' },
  { maxGapSec: 0.03, label: 'ハナ' },
  { maxGapSec: 0.06, label: 'アタマ' },
  { maxGapSec: 0.1, label: 'クビ' },
  { maxGapSec: 0.16, label: '1/2馬身' },
  { maxGapSec: 0.24, label: '3/4馬身' },
  { maxGapSec: 0.32, label: '1馬身' },
  { maxGapSec: 0.48, label: '1 1/2馬身' },
  { maxGapSec: 0.64, label: '2馬身' },
  { maxGapSec: 0.96, label: '3馬身' },
  { maxGapSec: 1.6, label: '5馬身' },
  { maxGapSec: 2.56, label: '8馬身' },
  { maxGapSec: 3.2, label: '10馬身' },
  { maxGapSec: Number.POSITIVE_INFINITY, label: '大差' },
];
