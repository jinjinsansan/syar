/**
 * 🔴 ★**戻せない操作は、押す前に そう言うこと**（★D-123 ③）
 *   ★裁定 `REVIEW_IDLE_WORK_20260925.md` (a)（2026-09-25・レビュー側の指摘）
 *
 * 【🔴 ★なぜ要るか】
 *   ★D-123 は ★「★取り消せないものは ★**押す前に**そう言う（★押した後に知らせない）」と定めています。
 *   ✔ ★`/vote`（投票）・`/entry`（出走登録）・`/exchange`（景品交換）には ★在りました。
 *   🔴 ★しかし ★**1 回きりで戻せない 2 つ**に ★**在りませんでした**（★レビュー側が見つけました）:
 *     ★① `/setup` … ★牧場をつくる（★表示名・牧場名・勝負服。★画面から変える口が無い）
 *     ★② `/stable/foal` … ★**無償の生産 1 頭**（★父と母を選び直せない・案 A・D-120）
 *
 * 【★この網が見るもの】
 *   ★① ★戻せない操作の一覧（★下の簿）に ★`window.confirm` が在る
 *   ★② 🔴 ★**押す前**に呼んでいる（★`await` の後に置いていない）
 *   ★③ ★文面が「戻せない」ことを言っている
 *
 * 【⚠️ ★`window.confirm` は仮の形です】
 *   ★既存の部品だけで済ませるための選択で、★デザイナー便で ★画面の中の確認に差し替える前提です。
 *   → ★差し替えるときは ★**文面を持っていくこと**（★この網は「確認が在るか」を見ます）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CLAIM_ENTRY_CANCEL_WINDOW, CLAIM_ENTRY_SCRATCH_CONFIRM, CLAIM_NO_CHANGE_LATER } from '../../web/src/lib/claims';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string): string => readFileSync(path.join(ROOT, p), 'utf8');

/**
 * 🔴 ★**註記を落としてから位置を見る**（★2026-09-25 に踏みました）
 *
 * ★`/setup` の見出しに ★説明として ★`supabaseSetupRepo.create(...)` と書いてあり
 * ★（★26 行目）、★`indexOf` が ★**そこ**に当たりました。
 * → ★「確認（180 行）が呼び出し（26 行）より後に在る」と ★**嘘の判定**をしました。
 *
 * ⚠️ ★同じ形を同じ日に ★**2 回**踏みました（★もう 1 つは対照の壊し方）。
 *    ★**自分の変更を註記に残すほど、同じ文字列がファイルに 2 回現れます。**
 */
const stripComments = (src: string): string => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
  .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => ' '.repeat(m.length));

/**
 * ★**戻せない操作**（★押す前に言うべきもの）。
 * ⚠️ ★足すときは ★**なぜ戻せないか**を書くこと。
 */
const IRREVERSIBLE: readonly {
  readonly file: string;
  /** ★確認の直後に呼ぶ関数（★この呼び出しより前に `confirm` が要る） */
  readonly action: string;
  /** ★文面に必ず入る言葉（★「戻せない」の言い方） */
  readonly says: string;
  readonly why: string;
  /** ★文を `lib/claims.ts` の定数から読む画面（★2026-09-29）: ★その定数名を画面が読み、★定数の値が `says` を含むこと */
  readonly saysFrom?: { readonly name: string; readonly value: string };
}[] = [
  {
    file: 'apps/web/src/app/vote/page.tsx',
    action: 'placeBet(',
    says: '投票は取り消せません',
    why: '★投票の取消は作らない（★オッズを見てから引ける形を作らないため）',
  },
  {
    file: 'apps/web/src/app/entry/page.tsx',
    action: 'supabaseEntryRepo.enter(',
    says: '出走表が出る前',
    saysFrom: { name: 'CLAIM_ENTRY_CANCEL_WINDOW', value: CLAIM_ENTRY_CANCEL_WINDOW },
    why: '★取り消せるのは 出走表が出る前まで（★2026-09-29 に取消の画面を作った・D-123 ①）。★その先は戻せないので 押す前に言う',
  },
  {
    file: 'apps/web/src/app/entry/page.tsx',
    action: 'requestEntryScratch(',
    says: '止められません',
    saysFrom: { name: 'CLAIM_ENTRY_SCRATCH_CONFIRM', value: CLAIM_ENTRY_SCRATCH_CONFIRM },
    why: '★取消の依頼は 積んだ時点で取り下げられない（★request_entry_scratch に取り下げの口は無い）',
  },
  {
    file: 'apps/web/src/app/setup/page.tsx',
    action: 'supabaseSetupRepo.create(',
    says: 'あとから変えられません',
    saysFrom: { name: 'CLAIM_NO_CHANGE_LATER', value: CLAIM_NO_CHANGE_LATER },
    why: '🔴 ★牧場をつくるのは 1 回きり（★表示名・牧場名・勝負服を画面から変える口が無い）',
  },
  {
    file: 'apps/web/src/app/stable/foal/page.tsx',
    action: 'requestInitialBreeding(',
    says: '選び直せません',
    why: '🔴 ★無償の生産は 1 回だけ（★父と母を選び直せない・案 A・D-120）',
  },
];

describe('🔴 ★戻せない操作は押す前に言う（★D-123 ③）', () => {
  it('★簿が空でない', () => {
    expect(IRREVERSIBLE.length, '★簿が空（★網の意味がない）').toBeGreaterThanOrEqual(4);
    const silent = IRREVERSIBLE.filter((r) => r.why.length < 6).map((r) => r.file);
    expect(silent, '★「なぜ戻せないか」が書かれていない').toEqual([]);
  });

  it('🔴 ★どれも window.confirm を持っている', () => {
    const missing = IRREVERSIBLE
      .filter((r) => !read(r.file).includes('window.confirm'))
      .map((r) => `${r.file}（${r.why}）`);
    expect(
      missing,
      '🔴 ★戻せない操作に ★**押す前の確認**がありません（★D-123 ③）:\n  ' + missing.join('\n  '),
    ).toEqual([]);
  });

  /**
   * 🔴 ★**押す前**であること。
   * ⚠️ ★`confirm` が ★`action` より ★**後**に在ると、★「押した後に知らせる」形になります。
   *    ★それは D-123 が禁じているものです。
   */
  it('🔴 ★確認が、呼び出しより前に在る（★押した後に知らせない）', () => {
    const wrong: string[] = [];
    for (const r of IRREVERSIBLE) {
      // ⚠️ ★註記を空白に置き換えてから位置を見ます（★行の位置は保たれます）
      const src = stripComments(read(r.file));
      const c = src.indexOf('window.confirm');
      const a = src.indexOf(r.action);
      if (a < 0) { wrong.push(`${r.file}: ★呼び出し ${r.action} が見つかりません（★簿が古い）`); continue; }
      if (c < 0 || c > a) wrong.push(`${r.file}: ★確認が ${r.action} より後に在ります`);
    }
    expect(wrong, '🔴 ★押した後に知らせる形になっています（★D-123 ③ は「押す前」）').toEqual([]);
  });

  it('🔴 ★文面が「戻せない」ことを言っている', () => {
    const silent = IRREVERSIBLE
      .filter((r) => !read(r.file).includes(r.says)
        && !(r.saysFrom !== undefined && read(r.file).includes(r.saysFrom.name) && r.saysFrom.value.includes(r.says)))
      .map((r) => `${r.file}: 「${r.says}」が文面に在りません`);
    expect(
      silent,
      '🔴 ★確認は出るのに ★**戻せないことを言っていません**（★「よろしいですか？」だけでは足りません）:\n  '
      + silent.join('\n  '),
    ).toEqual([]);
  });
});
