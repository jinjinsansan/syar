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
  return hashNormalizedName(normalizeName(name));
}

/**
 * ★**正規化済みの名前 1 件のハッシュ**（★ハッシュの式はここ 1 か所・裁定 `REVIEW_I3_NAMING_VERDICT_20260922.md` §2）。
 *   ⚠️ ★`node:crypto` を使うので ★`packages/sim-engine` には置けない（★依存ゼロ・画面やアプリも読む包み）。
 *   ★サーバー側（`apps/cli`・`apps/worker`）だけがここを読む。
 */
export function hashNormalizedName(normalized: string): string {
  return createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 16);
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
  /**
   * ★**どの版のリストで検査したか**（★ハッシュ表の中身のハッシュ・先頭 16 桁）。
   *   ★馬の行の `name_checked_with` に残す（★裁定 `REVIEW_UNNAMED_FOAL_PLACEMENT_VERDICT_20260922.md` §4）。
   *   ★表が無く素通しにしたときは ★`null`（★「検査していない」を黙って合格にしない）。
   */
  readonly version: string | null;
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
    return { blocklist: () => false, size: 0, version: null };
  }
  const text = readFileSync(hashPath, 'utf8');
  const set = new Set(
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0),
  );
  // 受け取るのは `normalizeName` 済みの文字列なので、ここで再正規化はしない
  return {
    blocklist: (normalized: string): boolean => set.has(hashNormalizedName(normalized)),
    size: set.size,
    version: createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16),
  };
}

/**
 * ★**禁止名の一覧の種類**（★提案 `PROPOSAL_PLAYER_NAME_MODERATION_20260922.md` §2 段 1・§4・2026-09-22）。
 *   ★`real-horse` … ★実在の競走馬名（★完全一致・★憲法 §0.1・★無ければ既定で止まる）
 *   ★`offensive-exact` … ★不快な語（★完全一致）
 *   ★`offensive-contains` … ★不快な語（★名前の中に含まれていれば当たり・★誤検知が増えるので短い一覧に限る）
 *   ★どの一覧も ★平文を repo に置かず、★正規化した語のハッシュだけを持つ（★`buildBlocklist` と同じ形）。
 */
export type NameListKind = 'real-horse' | 'offensive-exact' | 'offensive-contains';

/** ★一覧の置き場所（★不快な語の 2 本は、★オーナーが用意するまで無い） */
export const NAME_LIST_PATHS: Readonly<Record<NameListKind, string>> = {
  'real-horse': NG_HASH_PATH,
  'offensive-exact': 'data/ng-offensive-exact.hash',
  'offensive-contains': 'data/ng-offensive-contains.hash',
};

/** ★版を組み立てる順（★同じ一覧の組なら、★いつも同じ文字列になる） */
const NAME_LIST_ORDER: readonly NameListKind[] = ['real-horse', 'offensive-exact', 'offensive-contains'];

export interface NameChecksLoad {
  /** ★どれか 1 つの一覧に当たれば true（★どの一覧に当たったかは返さない・★一覧の中身を当てさせない） */
  readonly blocked: NameBlocklist;
  /**
   * ★**どの一覧のどの版で検査したか**（★`name_checked_with` に残す）。★例 `real-horse:<16 桁>+offensive-exact:<16 桁>`。
   *   ★在る一覧だけを並べる。★1 つも無ければ ★`null`（★「検査していない」を黙って合格にしない）。
   *   ★後から一覧が増えると ★版の文字列が変わるので、★再検査の道具が ★その行を拾い直せる。
   */
  readonly version: string | null;
  /** ★読めた一覧の種類 */
  readonly kinds: readonly NameListKind[];
}

/** ★ハッシュの一覧を読む（★無ければ null） */
function readHashSet(hashPath: string): { set: ReadonlySet<string>; version: string } | null {
  if (!existsSync(hashPath)) return null;
  const text = readFileSync(hashPath, 'utf8');
  const set = new Set(text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0));
  return { set, version: createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16) };
}

/**
 * ★**禁止名の一覧を全部読んで、★1 つの判定にする**。
 *
 * @param paths ★一覧の置き場所（★試験で差し替える）
 * @param strictRealHorse ★true（既定）なら ★実在馬名の一覧が無いときに投げる（★`loadNameBlocklist` と同じ・憲法 §0.1）。
 *   ⚠️ ★不快な語の一覧は ★無くても投げない（★まだ用意されていない・提案 §3-1）。★無い一覧は版に入らない。
 */
export function loadNameChecks(
  paths: Readonly<Record<NameListKind, string>> = NAME_LIST_PATHS,
  strictRealHorse = true,
): NameChecksLoad {
  const real = loadNameBlocklist(paths['real-horse'], strictRealHorse);
  const exact = readHashSet(paths['offensive-exact']);
  const contains = readHashSet(paths['offensive-contains']);
  const versions: Partial<Record<NameListKind, string>> = {};
  if (real.version !== null) versions['real-horse'] = real.version;
  if (exact !== null) versions['offensive-exact'] = exact.version;
  if (contains !== null) versions['offensive-contains'] = contains.version;
  const kinds = NAME_LIST_ORDER.filter((k) => versions[k] !== undefined);
  const version = kinds.length === 0 ? null : kinds.map((k) => `${k}:${versions[k]}`).join('+');
  return {
    blocked: (normalized: string): boolean => {
      if (real.blocklist(normalized)) return true;
      if (exact !== null && exact.set.has(hashNormalizedName(normalized))) return true;
      if (contains !== null) {
        // ★名前の中の ★連続した部分をすべて調べる（★9 文字なら 45 通り）
        const chars = [...normalized];
        for (let i = 0; i < chars.length; i += 1) {
          for (let j = i + 1; j <= chars.length; j += 1) {
            if (contains.set.has(hashNormalizedName(chars.slice(i, j).join('')))) return true;
          }
        }
      }
      return false;
    },
    version,
    kinds,
  };
}
