/**
 * ★**生成物が「いつの何から作られたか」を記録する**（★RD-4 ③・2026-09-19）
 *   ★裁定 `REVIEW_RD4_AND_BACKFILL_VERDICT_20260919.md` §1
 *   ★分類: **COMPONENT**（★道具ではなく、道具が使う部品）
 *
 * 【🔴 ★なぜ要るか】
 *   ★`packages/render/test/edit-grammar-audit.test.ts` は
 *   ★題に ★**「seed 分類を現 HEAD で再確認している」**と書きながら、
 *   ★`.gitignore` の下にある ★**1 週間前の生成物**を読んでいました。
 *   ★しかも ★**2 つの主張（接戦代表・独走代表）が両方とも古く**、★どちらも偽のまま緑でした。
 *   ★入力が無ければ落ちます（★それは正しく書けています）が、
 *   ★★**「有るが古い」ときだけは、何も言わずに緑**です。
 *
 * 【★どう解くか】
 *   ★道具が ★**入力のソースの hash** を生成物に書き、
 *   ★検査が ★**いまのソースの hash と突き合わせます**。
 *   → ★ずれていたら ★**古い**と分かります。★安い生成物なら ★**その場で作り直せます**。
 *
 * 【⚠️ ★何を hash に入れるか】
 *   ★**その生成物の答えを変えうるもの**だけを入れます。★広すぎると、
 *   ★無関係なコミットのたびに作り直しが走ります。★狭すぎると ★**古いのに気づけません**。
 *   → ★呼ぶ側が ★**依存する場所を名指しで**渡します（★暗黙にしない）。
 *
 * ⚠️ ★**`git ls-files` を使います**（★TM-1）。★除外の一覧を持ちません。
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * ★指定した場所のソースの hash。
 * @param {readonly string[]} prefixes ★`git ls-files` の出力に前方一致させる（★ディレクトリでもファイルでも）
 */
export function sourceHash(prefixes) {
  if (!Array.isArray(prefixes) || prefixes.length === 0) {
    throw new Error('sourceHash: 依存する場所を 1 つ以上渡してください（★暗黙にしない）');
  }
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n').filter(Boolean).sort();
  const files = tracked.filter((f) => prefixes.some((p) => f === p || f.startsWith(`${p}/`)));
  // ⚠️ ★0 件を「該当なし」と読まない（R-21）。★前置きを書き間違えたときに黙って通らないように
  if (files.length === 0) {
    throw new Error(`sourceHash: ${prefixes.join(', ')} に追跡されたファイルが 1 つもありません（★走査が空・R-21）`);
  }
  const h = createHash('sha256');
  for (const f of files) {
    h.update(f);
    h.update('\0');
    h.update(readFileSync(f));
    h.update('\0');
  }
  return { hash: h.digest('hex'), fileCount: files.length, inputs: [...prefixes] };
}

/**
 * ★**そのソースを最後に触ったコミットの時刻**（ISO）。
 *
 * 【★なぜ hash ではなく時刻か — ★**RD-5 ②**】
 *   ★ブラウザの撮影が要る生成物は ★**作り直せません**。
 *   ★そこに hash の突き合わせを付けると ★**常に赤**になり、
 *   ★既知の赤の登録簿が常時埋まった状態 ＝ ★**RD-2 の意味が消えます**。
 *   → ★撮影物は ★**「撮った後にソースが動いたか」**だけを見ます。
 *     ★動いていなければ緑、★動いていれば赤（★撮り直しが要る、という正しい答え）。
 * ⚠️ ★**できないことを機構で装いません** — ★ここは自動で作り直しません。★人に知らせるだけです。
 */
export function newestCommitISO(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('newestCommitISO: 場所を 1 つ以上渡してください');
  }
  const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', ...paths], { encoding: 'utf8' }).trim();
  // ⚠️ ★空は「変更が無い」ではなく「読めていない」かもしれない（R-21）
  if (out === '') throw new Error(`newestCommitISO: ${paths.join(', ')} のコミットが 1 件も見つかりません（★走査が空・R-21）`);
  return out;
}

/**
 * ★生成物に埋める記録。
 * ⚠️ ★`generatedAt` は ★**人が読むため**だけのものです。★判定に使いません
 *    （★時刻で判定すると「古いソースで今さっき作った」を見逃します）。
 */
export function provenanceOf(prefixes) {
  const s = sourceHash(prefixes);
  return {
    generatedAt: new Date().toISOString(),
    sourceHash: s.hash,
    fileCount: s.fileCount,
    inputs: s.inputs,
  };
}
