/**
 * §8.6 Provably Fair のワーカー側配線
 *
 * 【P1 で実装済みのものを繋ぐだけ】
 *   `commitServerSeed` / `clientEntropy` / `finalSeed` は `@star/race-engine` にあります。
 *   ここは **server_seed をどう作り、どこに保存するか**だけを決めます。
 *
 * 【★server_seed の生成に必要な性質】
 *   1. **予測できない** — 予測できると賭ける側が有利になります
 *   2. **同じサイクルからは同じ値** — 再起動で作り直すと commit と食い違い、
 *      §8.6 の検証が成立しなくなります（A-2 と同じ理由）
 *
 *   1 と 2 は両立しにくく、素朴に乱数で作ると 2 が壊れます。
 *   → **プロセス起動時に1つだけ秘密を持ち、サイクル番号と HMAC で決める**形にします。
 *     秘密が漏れない限り予測できず、同じサイクルからは必ず同じ値が出ます。
 *
 * ⚠️ 秘密はプロセスが持つので、**再起動すると変わります**。
 *    まだコミットしていないサイクルなら問題ありませんが、
 *    **コミット済みのレースの server_seed は DB に保存**しておく必要があります。
 *    → `races.seed_commit` を保存し、確定時に `seed_reveal` を書きます。
 *      本実装では DB 保存までを次便に回し、ここでは**導出だけ**を提供します。
 */

import { commitServerSeed, type HashProvider } from '@star/race-engine';

/**
 * サイクル番号から server_seed を導出する。
 *
 * @param secret プロセス起動時に生成する秘密（環境変数 or ランダム）
 */
export function serverSeedFor(secret: string, cycleIndex: number, hash: HashProvider): string {
  if (secret === '') throw new Error('serverSeedFor: secret が空です');
  // ★HMAC を使う。単純な連結ハッシュだと長さ拡張攻撃の余地がある
  return hash.hmacSha256(secret, `race:${cycleIndex}`);
}

/** サイクル番号から seed_commit（発走前に公開する値）を作る */
export function seedCommitFor(secret: string, cycleIndex: number, hash: HashProvider): string {
  return commitServerSeed(serverSeedFor(secret, cycleIndex, hash), hash);
}
