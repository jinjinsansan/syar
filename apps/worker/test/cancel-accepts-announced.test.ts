/**
 * ★**中止は `announced` のレースも受けるか**（★2026-09-19・**D-117 DS-7**）
 *
 * 【🔴 ★なぜこの検査を足したか — ★偽の DB が嘘をついていました】
 *   ★`d117-two-phase-loop.test.ts` の DS-6/DS-7 は ★**緑**でした。
 *   ★しかしそこの `cancelRace` は ★**私が書いた偽物**で、★言われたとおり中止したことにしていました。
 *   ★実物（`cancel.ts`）は `where ... status = 'scheduled'` だったので、
 *   ★★**0 行返して何もせず**、★`announced` のまま残っていました。
 *
 *   → ★そのレースは `announcedRaces()` が**毎周返し続け**、
 *     ★**毎周「中止しました」と通報しながら、実際には何も起きない**ところでした。
 *   → ★さらに ★**登録料が返りません**（★馬券は 1 枚も無いので、`bets` のループは空回り）。
 *
 * ★★これが「✅ が別の理由で出ていないか」そのものです。
 *   ★偽の DB は ★**自分が書いた期待**を返すので、★製品の SQL を見ていません。
 *
 * ★実 DB での確認は `tmp/verify-ds7-cancel.mjs`（★rollback 付き・staging で全項目 ✅）。
 *   ★ここは ★**その確認を毎回の `npm test` で持てる形**にしたものです。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '..', 'src');

/** ★TypeScript の註記を外す（★註記の中の文字に一致して緑にしない・CK-1） */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const cancelSrc = stripComments(readFileSync(path.join(SRC, 'cancel.ts'), 'utf8'));

describe('DS-7 中止は announced も受ける', () => {
  it('★走査が空でない（R-21）', () => {
    expect(cancelSrc.length).toBeGreaterThan(500);
    expect(cancelSrc).toContain("set status = 'cancelled'");
  });

  it("🔴 ★`announced` を受ける（★旧は 'scheduled' だけで、黙って 0 行だった）", () => {
    expect(cancelSrc).toMatch(/status in \('scheduled', 'announced'\)/);
  });

  it("★`settled` は受けない（★結果の事後差し替え・§8.6・★対照）", () => {
    // ★`status in (...)` の中身に settled が入っていないこと
    const m = /status in \(([^)]*)\)/.exec(cancelSrc);
    expect(m, '★status の並びが読めない').not.toBeNull();
    expect(m![1]).not.toContain('settled');
    expect(m![1]).not.toContain('cancelled');
  });

  it('🔴 ★登録料も返す（★馬券だけ返して終わりにしない）', () => {
    /**
     * ★組成前のレースに馬券は 1 枚もありません（`place_bet` は `scheduled` だけ）。
     * ★取られているのは**登録料**なので、★`bets` のループだけだと ★**返るものが無いまま中止**になります。
     */
    expect(cancelSrc).toContain('scratchAllEntries');
    // ★返す額は取消の経路の合計を足している（★馬券だけの額を返していない）
    expect(cancelSrc).toMatch(/refundedEp \+ scratched\.refundedEp/);
  });

  it('★取消と返金を自前で書き直していない（★D-052・`scratch.ts` の 1 か所を通す）', () => {
    // ★`cancel.ts` の中に「取消の update」を書いていないこと
    expect(cancelSrc).not.toMatch(/set scratched_at/);
    // ★登録料の額を直書きしていないこと（★行から読むのは scratch.ts の仕事）
    expect(cancelSrc).not.toMatch(/ENTRY_FEE_EP/);
  });
});

/**
 * ★**取消の馬を「登録した馬」として返していないか**（★2026-09-19・D-117 DS-2）
 *
 * 🔴 ★返すと: ★もう走らないと決まった馬を「必ず入れる馬」として出走表に押し込み、
 *   ★`fillRace` の件数照合（★取消でない行だけを数える）が**必ず食い違って投げます**。
 *   → ★そのレースは永久に組成できず、★DS-7 で中止。★**1 頭の取消がレースごと落とします**
 *     （★D-111 ③ が避けたかったことそのもの）。
 *
 * ★取消が付く道は 2 つあり、★**どちらも組成より前に起こりえます**:
 *   ① `entry-freeze` … 登録の後に引退した馬
 *   ② `entry-lottery` … 落選（★取消は組成の取引の外で先に確定するので、やり直すとき残っている）
 *
 * ★実 DB での確認は `tmp/verify-registered-excludes-scratched.mjs`（★staging で全項目 ✅）。
 */
describe('DS-2 registeredHorses は取消を返さない', () => {
  const storeSrc = stripComments(readFileSync(path.join(SRC, 'pg-store.ts'), 'utf8'));

  it('★`registeredHorses` の SQL が読める（R-21）', () => {
    const i = storeSrc.indexOf('async registeredHorses');
    expect(i, '★`registeredHorses` が無い').toBeGreaterThan(0);
    const body = storeSrc.slice(i, storeSrc.indexOf('},', i));
    expect(body.length).toBeGreaterThan(100);
    expect(body).toContain('from race_entries e join races r');
  });

  it('🔴 ★`scratched_at is null` で絞っている', () => {
    const i = storeSrc.indexOf('async registeredHorses');
    const body = storeSrc.slice(i, storeSrc.indexOf('},', i));
    expect(body).toMatch(/scratched_at is null/);
  });

  it('★`fillRace` の件数照合も取消を数えない（★両側が揃っていること）', () => {
    const i = storeSrc.indexOf('async fillRace');
    const body = storeSrc.slice(i, storeSrc.indexOf('\n    },', i));
    expect(body).toMatch(/count\(\*\)::text as n from race_entries[\s\S]{0,80}scratched_at is null/);
  });
});
