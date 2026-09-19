/**
 * ★**`/vote` が §9.5 の規則を自分で持っていない**（★**VT-1 ①**・2026-09-19・オーナー決定）
 *
 * 【🔴 ★何が起きていたか】
 *   ★画面は「★**自分の馬が出るレースは投票できません**」としていました。
 *   ★正典 §9.5 は ★**買い目の条件**（自馬を含む／全頭／5,000 EP）で、★「買えない」ではありません。
 *   → ★★**画面が、正典より狭い規則を独自に持っていました。**
 *   ✅ ★サーバー（`place_bet`・移行 `0044`）は ★**最初から正しく守っています**。
 *
 * 【★見ている壊れ方】
 *   ① ★また「投票できません」で塞ぐ
 *   ② ★判定を画面で組み立てる（★`includes` を並べる等・BT-0「材料でなく結果を渡す」）
 *   ③ ★5,000 を画面に数で書く（★D-052）
 *   ④ ★自馬の行を押せなくする（★正典は「選べない」ではなく「含めること」）
 *   ⑤ ★「押せない」だけで理由を出さない
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stripComments } from './lib/ts-blocks.js';

const ROOT = path.resolve(__dirname, '../../..');
const RAW = readFileSync(path.join(ROOT, 'apps/web/src/app/vote/page.tsx'), 'utf8');
/** ★註記に書いた語で緑にしない（★註記には「投票できません」も 5,000 も出てくる） */
const PAGE = stripComments(RAW);

describe('VT-1 ① /vote が §9.5 を自分で持たない', () => {
  it('★切り出しが成立している（R-21）', () => {
    expect(PAGE.length, '★註記を剥がしたら本文が消えた').toBeGreaterThan(2_000);
    expect(PAGE, '★マークシートの画面ではない').toContain('picks');
  });

  it('① ★★「投票できません」で塞いでいない', () => {
    expect(PAGE, '🔴 ★また自馬レースをまるごと塞いでいる').not.toContain('投票できません');
    expect(PAGE, '🔴 ★「投票はできません」で塞いでいる').not.toContain('投票はできません');
    expect(PAGE, '🔴 ★「選べません」で塞いでいる').not.toContain('選べません');
  });

  it('② ★★判定は `@star/betting` の 1 か所から引いている（★画面で組み立てない）', () => {
    expect(PAGE, '★`checkOwnRaceSelection` を使っていない').toContain('checkOwnRaceSelection');
    /**
     * 🔴 ★画面が自分で「自馬が入っているか」を組み立てていない。
     *    ★`picks.includes(ownGate)` のような形が出たら、★そこが第 2 の規則です。
     */
    expect(PAGE, '🔴 ★画面が自馬の有無を自分で判定している')
      .not.toMatch(/picks\s*\.\s*includes\s*\(\s*own/);
    expect(PAGE, '🔴 ★画面が自馬の有無を自分で判定している')
      .not.toMatch(/own[A-Za-z]*\s*\.\s*(every|some|filter)\s*\(/);
  });

  it('③ ★★5,000 を画面に数で書いていない（★D-052）', () => {
    expect(PAGE, '🔴 ★上限を画面に数で書いている').not.toMatch(/5[,_]?000/);
    expect(PAGE, '★上限を `@star/betting` から引いていない').toContain('BET_CAP_OWN_RACE_EP');
  });

  it('④ ★★自馬の行も押せる（★正典は「選べない」ではなく「含めること」）', () => {
    /** ★行のボタンが、自馬の有無で `disabled` になっていない */
    expect(PAGE, '🔴 ★自馬が出ていると行を押せなくしている')
      .not.toMatch(/disabled=\{ownHorseRuns\}/);
    expect(PAGE, '🔴 ★自馬が出ていると行を押せなくしている')
      .not.toMatch(/cursor:\s*ownHorseRuns\s*\?/);
    /** ★`toggleRow` が自馬の有無で早期に返っていない */
    expect(PAGE, '🔴 ★`toggleRow` が自馬レースで何もしない')
      .not.toMatch(/toggleRow[\s\S]{0,200}?if\s*\(\s*ownHorseRuns\s*\)\s*return/);
  });

  it('⑤ ★★理由を出している（★「押せない」だけにしない）', () => {
    expect(PAGE, '★理由の文を `@star/betting` から引いていない').toContain('ownRaceReasonText');
    /** ★主ボタンの `sub` に理由が入っている */
    expect(PAGE).toMatch(/sub=\{[^}]*ownRaceReasonText/);
  });

  it('★★複数の自馬に対応している（★§9.5-3・D-104 で 1 人 2 頭まで）', () => {
    /** ★1 頭ぶんの変数だけを渡していない（★配列で渡していること） */
    expect(PAGE, '★自馬を配列で渡していない').toContain('ownGates');
    expect(PAGE).toMatch(/checkOwnRaceSelection\(\s*picks\s*,\s*ownGates/);
  });

  it('🔴 ★サーバー側の規則が生きている（★画面を緩めたら、サーバーが最後に弾く・憲法 3）', () => {
    /**
     * ⚠️ ★画面の判定は ★**「なぜ出せないか」を言うため**のものです。
     *    ★最後に弾くのはサーバーなので、★**そちらが消えていないこと**をここで見ます。
     * ⚠️ ★R-19: ★`place_bet` は何度も `create or replace` されています。★**最後の定義**を見ます。
     */
    const { globSync } = require('node:fs') as typeof import('node:fs');
    const files = globSync('db/migrations/*.sql', { cwd: ROOT }).sort();
    let last: string | null = null;
    for (const f of files) {
      const sql = readFileSync(path.join(ROOT, f), 'utf8');
      if (/create or replace function (public\.)?place_bet/i.test(sql)) last = f;
    }
    expect(last, '★`place_bet` の定義が 1 つも無い（R-21）').not.toBeNull();
    const sql = readFileSync(path.join(ROOT, last!), 'utf8');
    /** ★自馬を全頭 含むことを確かめている */
    expect(sql, `🔴 ★${last}: ★自馬の全頭 チェックが消えている（§9.5-3）`)
      .toContain('not (p_selection @> to_jsonb(e.gate))');
    expect(sql, `🔴 ★${last}: ★理由の文が消えている`).toContain('§9.5');
    /** ★金額の上限は `bet_allowance` が見る（★SQL に数を直書きしていない） */
    expect(sql, `★${last}: ★上限を bet_allowance から引いていない`).toContain('bet_allowance');
  });
});
