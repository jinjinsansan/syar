/**
 * 馬名の自動生成（音節結合方式） — 正典 §10.5 / 憲法 §0.1
 *
 * 【憲法上の要請と、その実装上の落とし穴】
 *   §0.1 は「実在競走馬名を使わない」と定める。指示書は「実在競走馬名 NG リストと突合」を求めるが、
 *   **NG リストをリポジトリに平文で置くと、それ自体が実在馬名をコードに書く行為**になり §0.1 に反する。
 *   （`rg -uu` での検閲も、NG リスト自身が必ずヒットするので機能しなくなる。）
 *
 *   したがってここでは NG 判定を **注入された述語** として受け取り、
 *   このパッケージには実在馬名も、そのハッシュも、一切置かない。
 *   平文リストは未コミットの外部ファイルに置き、CLI 側でハッシュ化して読む（`apps/cli`）。
 *   → 照会中: QUESTIONS_P15（正典 §10.5 に「NG リストは平文で保持しない」を明記したい）
 *
 * 決定論（憲法 §1-4）: 乱数は `Rng` を注入する。`Math.random()` は呼ばない。
 */

import type { Rng } from './rng.js';

/**
 * 生成に使う音節表。
 * ⚠️ 実在の競走馬名・実在の牧場冠名から取らないこと。日本語カタカナの音節を機械的に並べたもの。
 */
export const NAME_SYLLABLES: readonly string[] = [
  'ア', 'イ', 'ウ', 'エ', 'オ',
  'カ', 'キ', 'ク', 'ケ', 'コ',
  'サ', 'シ', 'ス', 'セ', 'ソ',
  'タ', 'チ', 'ツ', 'テ', 'ト',
  'ナ', 'ニ', 'ヌ', 'ネ', 'ノ',
  'ハ', 'ヒ', 'フ', 'ヘ', 'ホ',
  'マ', 'ミ', 'ム', 'メ', 'モ',
  'ヤ', 'ユ', 'ヨ',
  'ラ', 'リ', 'ル', 'レ', 'ロ',
  'ワ',
  'ガ', 'ギ', 'グ', 'ゲ', 'ゴ',
  'ザ', 'ジ', 'ズ', 'ゼ', 'ゾ',
  'ダ', 'デ', 'ド',
  'バ', 'ビ', 'ブ', 'ベ', 'ボ',
  'パ', 'ピ', 'プ', 'ペ', 'ポ',
  'キャ', 'キュ', 'キョ', 'シャ', 'シュ', 'ショ',
  'チャ', 'チュ', 'チョ', 'リャ', 'リュ', 'リョ',
] as const;

/** 語尾に置くと名前らしくなる音（音節表と別に持つと生成が単調にならない） */
export const NAME_TAILS: readonly string[] = [
  'ン', 'ー', 'ル', 'ス', 'ト', 'ク', 'ノ', 'ラ', 'リ', 'ア',
] as const;

export interface NameShape {
  /** 冠名（牧場ごとの接頭辞）。空文字なら冠名なし */
  readonly prefix: string;
  /** 冠名を除いた音節数の下限 */
  readonly minSyllables: number;
  /** 冠名を除いた音節数の上限 */
  readonly maxSyllables: number;
}

export const DEFAULT_NAME_SHAPE: NameShape = {
  prefix: '',
  minSyllables: 2,
  maxSyllables: 4,
};

/** 語尾音を付ける確率（正典に規定が無いので較正定数として登録簿に載せる） */
export const NAME_TAIL_RATE = 0.45;

/**
 * 馬名を1つ生成する（重複・NG の判定はしない。`generateHorseName` を使うこと）。
 */
export function composeName(rng: Rng, shape: NameShape): string {
  const min = Math.max(1, Math.floor(shape.minSyllables));
  const max = Math.max(min, Math.floor(shape.maxSyllables));
  const count = rng.int(min, max);

  let body = '';
  for (let i = 0; i < count; i += 1) {
    body += rng.pick(NAME_SYLLABLES);
  }
  // 長音・撥音は語頭に立てない（日本語として読めない名前を避ける）
  if (rng.bool(NAME_TAIL_RATE)) {
    body += rng.pick(NAME_TAILS);
  }
  return shape.prefix + body;
}

/**
 * 突合用の正規化。
 * 「同じ名前を長音や中黒の有無でくぐり抜ける」ことを防ぐため、
 * **判定に使わない文字を落としてから**比較する。
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/[ー・\s'’\-]/g, '')
    .toUpperCase();
}

/** 実在競走馬名 NG 判定（注入）。正規化済みの文字列を受け取り、禁止なら true */
export type NameBlocklist = (normalized: string) => boolean;

/** 何も禁止しない NG 判定（テスト・プリシードの部分実行用。本番では必ず実物を注入する） */
export const ALLOW_ALL_NAMES: NameBlocklist = () => false;

export interface NameGenerationResult {
  readonly name: string;
  /** 何回引き直したか（0 = 一発で通った）。偏りの監視に使う */
  readonly attempts: number;
}

/** 生成の上限回数。ここに達したら**名前を返さず失敗させる**（黙って重複を通さない） */
export const NAME_MAX_ATTEMPTS = 200;

/**
 * 重複と NG リストを避けて馬名を生成する。
 *
 * @param taken 既に使われている**正規化済み**の名前集合。生成に成功すると追加する
 * @throws 上限回数まで引いても通らなかったとき（音節表が枯れている兆候なので黙って続けない）
 */
export function generateHorseName(
  rng: Rng,
  shape: NameShape,
  taken: Set<string>,
  blocked: NameBlocklist,
): NameGenerationResult {
  for (let attempts = 0; attempts < NAME_MAX_ATTEMPTS; attempts += 1) {
    const name = composeName(rng, shape);
    const key = normalizeName(name);
    if (taken.has(key) || blocked(key)) continue;
    taken.add(key);
    return { name, attempts };
  }
  throw new Error(
    `馬名を ${NAME_MAX_ATTEMPTS} 回引いても確定できませんでした（既出 ${taken.size} 件）。` +
      '音節表か音節数の上限を見直してください。',
  );
}
