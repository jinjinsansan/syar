/**
 * `HashProvider` の Node 実装（正典 §8.6）
 *
 * ★ここが `node:crypto` を import する**唯一の場所**。
 *   race-engine 側に置くと、パッケージが Node に依存してブラウザで動かなくなる
 *   （P0 で sim-engine に課したのと同じ制約）。注入点を1つに絞ることで、
 *   ブラウザ実装（WebCrypto）へ差し替えるときの変更箇所も1か所で済む。
 */

import { createHash, createHmac } from 'node:crypto';
import type { HashProvider } from '@star/race-engine';

export const nodeHash: HashProvider = {
  sha256(message: string): string {
    return createHash('sha256').update(message, 'utf8').digest('hex');
  },
  hmacSha256(key: string, message: string): string {
    return createHmac('sha256', key).update(message, 'utf8').digest('hex');
  },
};
