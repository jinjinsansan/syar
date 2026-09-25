/**
 * 🔴 ★**画面が並べる段と、★`enter_race` が受ける段が一致すること**（★2026-09-25）
 *
 * ============================================================================
 * 【🔴 ★何が起きていたか — ★誰も一度も登録できていなかった】
 *   ★2026-09-19 の **D-117**（移行 `0051`）で、★`enter_race` が受ける段が
 *   ★`scheduled` → ★**`announced`** に変わりました。★**画面は直していませんでした。**
 *
 *   ✔ ★本番で実測（2026-09-25・読むだけ）:
 *   ```
 *   いま登録を受けられるレース（announced かつ締切前） … 3 件（★すべて races_public に在る）
 *   画面が並べる段（.eq('status','scheduled')）        … その 3 件は ★**出ない**
 *   持ち主の居る馬の登録（これまで全部）                … ★**0 件**
 *   ```
 *   → ★出ているレースは ★**RPC が「受付を終えています」で断り**、
 *     ★受け付けているレースは ★**画面に出ない**。★詰んでいました。
 *
 * 【★なぜ検査にするか】
 *   ★同じ値を ★**SQL と TS の 2 か所**が持っています（★D-052 の族）。
 *   ★片方だけ変えても ★**どちらも「正しく」動く**ので、★例外も赤も出ません。
 *   ★気づいたのは ★「取消を作ろうとして一覧を読んだ」★偶然でした。
 *
 * ⚠️ ★この検査は ★**最新の `enter_race` の定義**から段を取り出して突き合わせます。
 *    ★移行を足して段を変えたら、★ここが落ちます（★それが狙いです）。
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ENTERABLE_RACE_STATUS } from '../../web/src/lib/entry-repo.js';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATIONS = path.join(ROOT, 'db/migrations');
const REPO = readFileSync(path.join(ROOT, 'apps/web/src/lib/entry-repo.ts'), 'utf8');

/** ★`enter_race` を定義している ★**いちばん新しい**移行を探す */
function latestEnterRaceMigration(): { readonly file: string; readonly body: string } {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  let found: { file: string; body: string } | null = null;
  for (const f of files) {
    const src = readFileSync(path.join(MIGRATIONS, f), 'utf8');
    if (/create\s+or\s+replace\s+function\s+public\.enter_race/i.test(src)) found = { file: f, body: src };
  }
  if (found === null) throw new Error('🔴 ★`enter_race` の定義が 1 つも見つかりません（★走査が壊れています）');
  return found;
}

describe('🔴 ★登録を受ける段が、画面と DB で一致する', () => {
  const latest = latestEnterRaceMigration();

  it('★最新の定義を見つけられている（★0 件 通過を合格にしない）', () => {
    expect(latest.file, '🔴 ★移行が見つからない').toMatch(/^\d{4}_/);
    expect(latest.body.length, '🔴 ★移行が読めていない').toBeGreaterThan(500);
  });

  it('🔴 ★`enter_race` が受ける段と、★画面の `ENTERABLE_RACE_STATUS` が同じ', () => {
    /** ★`if v_race.status <> 'xxx' then` の xxx を取り出す */
    const m = latest.body.match(/v_race\.status\s*<>\s*'(\w+)'/);
    expect(m, `🔴 ★${latest.file} から「受ける段」を読めません（★書き方が変わった？）`).not.toBeNull();
    expect(
      ENTERABLE_RACE_STATUS,
      `🔴 ★画面と DB で段が食い違っています。★DB（${latest.file}）は '${m?.[1]}'、`
      + `★画面は '${ENTERABLE_RACE_STATUS}'。\n`
      + '  ★このずれは ★**例外も赤も出ません**。★画面に出るレースは RPC が断り、'
      + '★受け付けているレースは画面に出ません（★2026-09-25 に本番でそうなっていました）',
    ).toBe(m?.[1]);
  });

  it('🔴 ★段の名前を、画面が 2 か所に持っていない', () => {
    /**
     * ⚠️ ★`ENTERABLE_RACE_STATUS` の宣言そのものを除いて、★`'announced'` / `'scheduled'` を
     *    ★判定に使っている所が残っていないかを見ます（★註記の中は除く）。
     */
    const code = REPO.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    const decl = new RegExp(`ENTERABLE_RACE_STATUS\\s*=\\s*'${ENTERABLE_RACE_STATUS}'`);
    const withoutDecl = code.replace(decl, ' ');
    const strays = [...withoutDecl.matchAll(/'(announced|scheduled)'/g)].map((x) => x[1]!);
    expect(
      strays,
      `🔴 ★段の名前が ★**もう 1 か所**書かれています（${strays.join(' / ')}）。`
      + '★`ENTERABLE_RACE_STATUS` を使ってください（★二重帳簿）',
    ).toEqual([]);
  });
});
