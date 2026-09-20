/**
 * 🔴 ★**着順は 1 度しか書けない**（★正典 §17.3 **F-3**・2026-09-20）
 *
 * 【★何を守るか】
 *   ✔ ★2026-09-20 に数えました: ★`finish_pos` を書く経路は ★**製品に 1 か所だけ**
 *     （`apps/worker/src/pg-store.ts`）。★移行 `0031` の註記も同じことを書いています。
 *   🔴 ★しかし ★**列の側に守りが何も無く**、★`finish_pos` の変更を記録する引金も表も **0 件**でした。
 *   → ★せめて ★**製品の経路が上書きできない**ことは閉じます（★`and finish_pos is null`）。
 *
 * 【⚠️ ★この検査が守らないもの】
 *   ★**手で流す SQL は止まりません。** ★そちらは ★**再計算で示す**（★F-1/F-2 と同じ作法）。
 *   → ★`F3-NO-RESULT-AUDIT` に、★その設計が残っています。
 *   ⚠️ ★**ここが緑でも「差し替えが無かった」ではありません。**
 *
 * 【★なぜ構文木ではなく文面を見るか】
 *   ★実 DB を使わずに「★上書きできない」を示すには、★**流す SQL の文面**を見るのが
 *   ★いちばん直接です（★偽の client は ★**自分の期待を返す**だけなので・★2026-09-19 の教訓）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import nodePath from 'node:path';

const SRC = readFileSync(
  nodePath.join(nodePath.resolve(__dirname, '..'), 'src/pg-store.ts'), 'utf8',
);
/** ★註記を外した本文（★註記の中の語で緑にしない・**CK-1** / **CK-13**） */
const LIVE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/[^\n]*/gm, ' ');

describe('🔴 ★F-3: 着順は 1 度しか書けない', () => {
  it('★`finish_pos` を書く文が、★製品に 1 つだけ', () => {
    const writes = [...LIVE.matchAll(/update\s+race_entries\s+set\s+finish_pos/gi)];
    expect(writes.length, '★着順を書く文が 1 つではありません').toBe(1);
  });

  it('🔴 ★その文が **`finish_pos is null`** で守られている（★上書きできない）', () => {
    const m = LIVE.match(/update\s+race_entries\s+set\s+finish_pos[\s\S]{0,400}?`/i);
    expect(m, '★着順を書く文が見つかりません').not.toBeNull();
    const stmt = m?.[0] ?? '';
    expect(stmt, '★`finish_pos is null` が無い ＝ ★**上書きできてしまいます**')
      .toMatch(/and\s+finish_pos\s+is\s+null/i);
  });

  it('🔴 ★0 行だったら**投げる**（★黙って確定しない）', () => {
    /**
     * ⚠️ ★状態遷移（`status = 'scheduled'` → `'settled'`）が守っているので、
     *   ★ここが 0 行になるのは ★**出走表の行が無い**か ★**既に着順が入っている**か。
     *   ★どちらも ★**結果が記録されないまま確定する**ことを意味します。
     */
    const at = LIVE.indexOf('update race_entries set finish_pos');
    expect(at, '★着順を書く文が見つかりません').toBeGreaterThan(-1);
    const after = LIVE.slice(at, at + 700);
    expect(after, '★rowCount を見ていない').toMatch(/rowCount\s*===?\s*0/);
    expect(after, '★投げていない（★警報では済ませない）').toMatch(/throw new Error/);
  });

  it('⚠️ ★二重確定は、★状態遷移でも守られている（★対照・★多層防御の 1 枚目）', () => {
    expect(LIVE, "★`status = 'settled'` への遷移が `scheduled` を要求していない")
      .toMatch(/update races set status = 'settled'[\s\S]{0,200}?where[\s\S]{0,120}?status = 'scheduled'/);
  });

  it('🔴 ★**この検査が守らないもの**を、★註記が明言している（★R-21）', () => {
    /**
     * ★「緑 ＝ 差し替えが無かった」と読まれないように、★註記の側を見張ります。
     */
    expect(SRC, '★手の SQL は止まらない、と書いていない')
      .toMatch(/手で流す SQL/);
  });
});
