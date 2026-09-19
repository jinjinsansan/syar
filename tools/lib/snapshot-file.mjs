/**
 * ★**元に戻すための控えを、★プロセスの外に置く**（★**SB-6**・2026-09-19）
 *
 * 【🔴 ★なぜ要るか — ★馬 9 頭の所属厩舎を永久に失いました】
 *   ★`verify-v11-synthetic.mjs` を `timeout 600` で流し、★**SIGTERM で殺され**ました。
 *   ★`bail` は例外しか捕まえておらず、★`clean()` が走りませんでした。
 *   🔴 ★そして ★**控え（`STABLE_OF`）は ★メモリの中**でした。★**プロセスと一緒に消えました。**
 *   ★`horses_owner_xor_npc` があるので、★`owner_id` を付けた時点で `npc_stable_id` は消えています。
 *   → ★★**元の厩舎は、どこにも残っていません。★推測もできません。**
 *
 * 【⚠️ ★シグナルを捕まえるだけでは足りません】
 *   ★`SIGINT`/`SIGTERM`/`SIGHUP` を捕まえる形にはしました（★応急）。
 *   🔴 ★しかし ★**`SIGKILL`・電源断・OOM では、★ハンドラは走りません。**
 *   → ★★**「プロセスが死ぬ」という、まさにその場合に、★メモリの控えは消えます。**
 *
 * > ★**SB-6** ★元に戻すための控えは、★**プロセスの外に置く。**
 *
 * 【★この道具がすること】
 *   ★控えを ★**`tmp/snapshots/<名前>.json` に、★書いた直後に `fsync` して置きます。**
 *   ★次に同じ名前で開くと、★**前の実行が残した控えを読めます**（★`restoreLeftovers`）。
 *
 * 【⚠️ ★`tmp/` に置く理由】
 *   ★`tmp/` は `.gitignore` です。★**控えは版管理に載せません**（★staging の id が混じるため）。
 *   🔴 ★そのかわり ★**消えます。** ★`SH-1‴` と同じで、★**置き去りを数えるのは呼ぶ側**です。
 *
 * ⚠️ ★**これは検査の道具だけのものです。** ★製品には入れないこと。
 */

import {
  mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync,
  openSync, fsyncSync, closeSync, renameSync, readdirSync,
} from 'node:fs';
import path from 'node:path';

const DIR = 'tmp/snapshots';

/** ★名前を道の一部にするので、★区切り文字を通さない（★上のディレクトリへ出られないように） */
function fileOf(name) {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`★控えの名前に使えない文字があります: ${name}`);
  return path.join(DIR, `${name}.json`);
}

/**
 * ★**控えを取る**（★プロセスの外へ・★`fsync` まで）。
 *
 * ⚠️ ★**書いてから変更すること。** ★変更してから書くと、★間で殺されたときに控えが無い。
 *
 * @param {string} name ★道具ごとの名前（例 `verify-v11-synthetic`）
 * @param {unknown} data ★戻すのに要るもの（★id と、元の値）
 */
export function takeSnapshot(name, data) {
  mkdirSync(DIR, { recursive: true });
  const f = fileOf(name);
  const tmp = `${f}.writing`;
  const body = JSON.stringify({ takenAt: new Date().toISOString(), name, data }, null, 2);
  /**
   * 🔴 ★**`fsync` してから `rename`**。
   *   ★`writeFileSync` だけだと、★OS の緩衝に載ったまま電源が落ちれば ★**空のファイルが残ります。**
   *   ★`SH-1''` と同じ形（★別名で書いて置き換える）ですが、★**理由が違います** —
   *   ★あちらは「書き込みが落ちても元を壊さない」、★こちらは「殺されても中身が届いている」。
   */
  writeFileSync(tmp, body, 'utf8');
  const fd = openSync(tmp, 'r+');
  try { fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, f);
  return f;
}

/**
 * ★**前の実行が残した控えが在るか**（★`null` なら無い）。
 *
 * 🔴 ★**在ったら、★前の実行は片付けずに死んでいます。** ★呼ぶ側は ★**先に戻してから始めること。**
 */
export function readSnapshot(name) {
  const f = fileOf(name);
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch (e) {
    // ★壊れた控えは「無い」と同じに扱わない。★呼ぶ側に判断させる
    throw new Error(`★控えが読めません（${f}）: ${(e).message}。★中を見てから消してください`);
  }
}

/**
 * ★**片付いたので控えを捨てる**。
 *
 * ⚠️ ★**戻したことを数えてから呼ぶこと**（★`TL-1` の `restores`）。
 *    ★捨ててから数えると、★失敗したときに戻せません。
 */
export function dropSnapshot(name) {
  const f = fileOf(name);
  if (existsSync(f)) unlinkSync(f);
}

/** ★置き去りの控えを数える（★`SH-1‴`: ★守られたこと自体は見えない。★残骸だけが痕跡） */
export function listSnapshots() {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR).filter((x) => x.endsWith('.json'));
}
