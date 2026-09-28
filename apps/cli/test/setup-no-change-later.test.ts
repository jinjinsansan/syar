/**
 * ★**初回設定の帯と 押す前の確認が ★同じことを言う**（★2026-09-29・レビュー側）
 *
 * 【★なぜ】
 *   ★帯は「★あとから変えられます」、★確認は「★あとから変えられません」と ★逆のことを言っていた。
 *   ★事実は「変えられない」（★画面から変える口が無い・★`create_account` は作り直せない）。
 *   ★帯は芝の下に沈んで見えていなかったので ★誰も気づかなかった（★NoticeBar の重ね順を直して 見えた日に 見つかった）。
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★帯と確認が 別々の文字列を持つ（★片方だけ直る）
 *   ② 🔴 ★「変えられます」が 戻る
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stripComments } from './lib/ts-blocks.js';

const SETUP = stripComments(readFileSync(path.resolve(__dirname, '../../..', 'apps/web/src/app/setup/page.tsx'), 'utf8'));

describe('★初回設定: あとから変えられない', () => {
  it('🔴 ① 帯と確認は 同じ定数を使う', () => {
    expect(SETUP).toContain("const NO_CHANGE_LATER = 'あとから変えられません。';");
    expect(SETUP).toContain('`最初の 1 回だけ。${NO_CHANGE_LATER}`');
    expect(SETUP).toContain('`${NO_CHANGE_LATER}この内容でよろしいですか？`');
  });
  it('🔴 ② 「変えられます」と言わない', () => {
    expect(SETUP).not.toContain('変えられます');
  });
});
