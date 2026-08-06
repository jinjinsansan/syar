/**
 * 実在競走馬名 NG リスト（憲法 §0.1 / DEV_INSTRUCTIONS_P15 N-1）
 *
 * 【なぜハッシュで持つのか】
 *   §0.1 は「実在競走馬名を使わない」と定める。**NG リストを平文でリポジトリに置くと、
 *   それ自体が実在馬名をコードに書く行為**になり、禁じている当のものを置くことになる。
 *   `rg -uu` での検閲も、NG リスト自身が必ずヒットするので機能しなくなる。
 *   → 平文は**未コミットの外部ファイル**に置き、ここでは**ハッシュ集合だけ**を読む。
 *
 * 【前方一致・部分一致はできない】
 *   ハッシュにすると完全一致しか判定できない。目的は
 *   「音節結合で生成した名前が偶然実在馬名と一致するのを弾く」ことなので、
 *   正規化後の完全一致で足りる（`normalizeName` が長音・中黒・空白を落とす）。
 *   ⚠️ 「実在馬名を少し変えた名前」は弾けない。**生成器は音節をランダムに並べるだけで
 *      実在名を参照しない**ので、そもそも似た名前が出る経路が無い。
 *
 * 【運用】
 *   1. オーナーが平文リスト（1行1名）を `data/ng-names.txt` に置く（.gitignore 済み）
 *   2. `npm run blocklist:build` でハッシュ化し `data/ng-names.hash` を作る
 *   3. 本番のプリシードは `loadNameBlocklist()` を注入する
 *
 *   平文が無い環境（CI・レビュー側の再実行）では **`STRICT` で失敗させる**。
 *   黙って「NG 判定なし」で走らせると、憲法の担保が静かに外れる。
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { normalizeName, type NameBlocklist } from '@star/sim-engine';

/** 平文リスト（未コミット）。オーナーが置く */
export const NG_PLAINTEXT_PATH = 'data/ng-names.txt';
/** ハッシュ集合（コミット可能。実在馬名を復元できない） */
export const NG_HASH_PATH = 'data/ng-names.hash';

/**
 * 名前1件のハッシュ。
 * ⚠️ **ソルト無しの生 SHA-256**。総当たりで元の名前は割り出せるが、それでよい —
 *    目的は「リポジトリに実在馬名を平文で置かない」ことで、秘密の保護ではない。
 *    ソルトを付けると、レビュー側が同じリストから同じハッシュを再現できなくなる。
 */
export function hashName(name: string): string {
  return createHash('sha256').update(normalizeName(name), 'utf8').digest('hex').slice(0, 16);
}

/** 平文リスト → ハッシュ集合ファイル */
export function buildBlocklist(plaintextPath = NG_PLAINTEXT_PATH, hashPath = NG_HASH_PATH): number {
  const lines = readFileSync(plaintextPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  const hashes = [...new Set(lines.map(hashName))].sort();
  writeFileSync(hashPath, `${hashes.join('\n')}\n`, 'utf8');
  return hashes.length;
}

export interface BlocklistLoad {
  readonly blocklist: NameBlocklist;
  readonly size: number;
}

/**
 * ハッシュ集合を読んで NG 判定を作る。
 *
 * @param strict true（既定）なら、ハッシュ集合が無いときに**例外を投げる**。
 *   憲法の担保は「無ければ止まる」でなければ意味がない（黙って素通しにしない）。
 */
export function loadNameBlocklist(hashPath = NG_HASH_PATH, strict = true): BlocklistLoad {
  if (!existsSync(hashPath)) {
    if (strict) {
      throw new Error(
        `実在競走馬名の NG リスト（${hashPath}）がありません。憲法 §0.1 の突合ができないため中止します。` +
          `\n  平文 ${NG_PLAINTEXT_PATH} を置いて \`npm run blocklist:build\` を実行してください。` +
          `\n  意図的に NG 判定なしで走らせる場合のみ strict=false を指定してください（本番では禁止）。`,
      );
    }
    return { blocklist: () => false, size: 0 };
  }
  const set = new Set(
    readFileSync(hashPath, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0),
  );
  // 受け取るのは `normalizeName` 済みの文字列なので、ここで再正規化はしない
  return {
    blocklist: (normalized: string): boolean =>
      set.has(createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 16)),
    size: set.size,
  };
}
