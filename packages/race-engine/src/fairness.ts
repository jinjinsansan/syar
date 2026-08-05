/**
 * Provably Fair（正典 §8.6・§8.8）
 *
 * ```
 * 1. レース作成時: server_seed を生成し、seed_commit = SHA256(server_seed) を公開
 * 2. 締切時:      client_entropy = 全出走馬IDのハッシュ結合
 * 3. 確定時:      final_seed = HMAC-SHA256(server_seed, race_id + client_entropy)
 * 4. レース後:    server_seed を公開（seed_reveal）
 * ```
 *
 * ★ハッシュ関数は**注入**する（`HashProvider`）。
 *   race-engine は `node:crypto` を import しない — P0 の sim-engine と同じ方針で、
 *   ブラウザ・Node・Worker のどこでも同じコードが動くようにするため。
 *   Node 実装は `apps/cli/src/node-hash.ts` にある。
 *
 * ★「景品があるゲームの生命線」（正典 §8.6）なので、ここは**静かに壊れてはいけない**。
 *   検証系の関数は判定不能を true に倒さない（R-3）。
 */

import type { HorseId } from '@star/sim-engine';

/** 外部から注入するハッシュ実装。いずれも 16進小文字の文字列を返すこと */
export interface HashProvider {
  /** SHA-256(message) の16進表現 */
  sha256(message: string): string;
  /** HMAC-SHA256(key, message) の16進表現 */
  hmacSha256(key: string, message: string): string;
}

const HEX64 = /^[0-9a-f]{64}$/;

function assertHex64(value: string, what: string): void {
  if (!HEX64.test(value)) {
    throw new Error(`${what}: SHA-256 の16進小文字64桁であること (received: ${value})`);
  }
}

/** 手順1: server_seed から公開するコミットメント */
export function commitServerSeed(serverSeed: string, hash: HashProvider): string {
  if (serverSeed === '') throw new Error('commitServerSeed: server_seed が空');
  const commit = hash.sha256(serverSeed);
  assertHex64(commit, 'seed_commit');
  return commit;
}

/**
 * 手順2: client_entropy = 全出走馬IDのハッシュ結合（正典 §8.6）
 *
 * ★出走馬IDを**ソートしてから**結合する（I-ENTROPY-SORT）。
 *   出走表の並び順（枠順）は締切後の抽選で決まるため、並び順に依存させると
 *   「同じ出走馬・同じ server_seed なのに entropy が変わる」ことが起き、
 *   検証者が再計算できなくなる。順序に依存しない集合ハッシュにする。
 */
export function clientEntropy(horseIds: readonly HorseId[], hash: HashProvider): string {
  if (horseIds.length === 0) throw new Error('clientEntropy: 出走馬が0頭');
  const unique = [...new Set(horseIds)];
  if (unique.length !== horseIds.length) {
    throw new Error('clientEntropy: horseId が重複している');
  }
  const entropy = hash.sha256([...unique].sort().join('|'));
  assertHex64(entropy, 'client_entropy');
  return entropy;
}

/** 手順3: final_seed = HMAC-SHA256(server_seed, race_id + client_entropy) */
export function deriveFinalSeed(
  serverSeed: string,
  raceId: string,
  entropy: string,
  hash: HashProvider,
): string {
  if (raceId === '') throw new Error('deriveFinalSeed: race_id が空');
  assertHex64(entropy, 'client_entropy');
  const finalSeed = hash.hmacSha256(serverSeed, `${raceId}${entropy}`);
  assertHex64(finalSeed, 'final_seed');
  return finalSeed;
}

/**
 * final_seed（16進64桁）を `Rng` が使う 32bit 整数へ畳み込む。
 *
 * ★全 256bit を XOR で畳む（I-SEED-FOLD）。先頭8桁だけを使うと、ハッシュの一部しか結果に効かなくなり
 *   「final_seed 全体が結果を決めている」という Provably Fair の主張が弱くなる。
 */
export function finalSeedToRngSeed(finalSeed: string): number {
  assertHex64(finalSeed, 'final_seed');
  let acc = 0;
  for (let i = 0; i < 64; i += 8) {
    acc = (acc ^ Number.parseInt(finalSeed.slice(i, i + 8), 16)) >>> 0;
  }
  return acc >>> 0;
}

/** 手順4: 公開された server_seed が commit と一致するか（誰でも実行できる検証） */
export function verifyReveal(
  revealedServerSeed: string,
  seedCommit: string,
  hash: HashProvider,
): boolean {
  // ★判定不能を true に倒さない（R-3）。形式不正はそのまま false
  if (revealedServerSeed === '' || !HEX64.test(seedCommit)) return false;
  return hash.sha256(revealedServerSeed) === seedCommit;
}

// ---------------------------------------------------------------------------
// §8.8 介入込みの完全再現
// ---------------------------------------------------------------------------

/** 介入入力1件（正典 §8b.4: 種別＋クライアント時刻。サーバー受信時刻で判定する） */
export interface InterventionInput {
  horseId: HorseId;
  /** 局面 */
  phase: 'start' | 'travel' | 'spurt' | 'drive';
  /** サーバー受信時刻（レース開始からのミリ秒）。判定基準はこちら（§8b.6） */
  serverMs: number;
  /** クライアント申告時刻（参考記録・マクロ調査の入力・§8b.6） */
  clientMs: number;
}

/**
 * レースを完全再現するために保存すべき一式（正典 §8.8）。
 *
 * > 完全再現 = seed_reveal + 介入入力ログ
 */
export interface RaceAuditRecord {
  raceId: string;
  seedCommit: string;
  /** レース後に公開する。公開前は null */
  seedReveal: string | null;
  clientEntropy: string;
  finalSeed: string;
  entrantIds: readonly HorseId[];
  interventions: readonly InterventionInput[];
}

/**
 * 監査記録が「seed だけで再現できる状態」にあるかを検査する。
 *
 * 返すのは真偽ではなく**理由の配列**にしている: 「検証した」と言うために何を見たかを
 * 呼び出し側が報告できる形にするため（R-9 の適用）。空配列なら合格。
 */
export function auditFailures(record: RaceAuditRecord, hash: HashProvider): string[] {
  const failures: string[] = [];
  if (record.seedReveal === null) {
    failures.push('seed_reveal が未公開（レース後に公開されていない）');
  } else {
    if (!verifyReveal(record.seedReveal, record.seedCommit, hash)) {
      failures.push('SHA256(seed_reveal) が seed_commit と一致しない（事後差し替えの疑い）');
    }
    const expectedEntropy = clientEntropy(record.entrantIds, hash);
    if (expectedEntropy !== record.clientEntropy) {
      failures.push('client_entropy が出走馬IDから再計算した値と一致しない');
    }
    const expectedFinal = deriveFinalSeed(
      record.seedReveal,
      record.raceId,
      record.clientEntropy,
      hash,
    );
    if (expectedFinal !== record.finalSeed) {
      failures.push('final_seed が HMAC 再計算値と一致しない');
    }
  }
  for (const input of record.interventions) {
    if (!record.entrantIds.includes(input.horseId)) {
      failures.push(`介入ログに出走していない馬が含まれる: ${input.horseId}`);
    }
  }
  return failures;
}
