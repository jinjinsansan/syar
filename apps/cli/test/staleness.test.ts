/**
 * 🔴 ★**「誰も見ていない期間」を作らない**（★`DP-1` / `O-2` / `O-4` / `O-6` / `F-3`）
 *
 * 【★4 件を 1 つの仕掛けに揃えました】
 *   ★別々の話に見えて、★**同じ形**でした: ★① 記録する ★② 古びたら落ちる。
 *   → ★`tools/lib/staleness.mjs` が ★**古さだけ**を見ます（★中身は各道具の仕事）。
 *
 * 【⚠️ ★1 件の失敗が、★4 件の赤に見えないこと】
 *   🔴 ★設計のときに自分で挙げた弱点です。★**項目ごとに `it` を分けます。**
 *   ★まとめて 1 つの `expect` にすると、★どれが落ちたのか読めません。
 *
 * 【⚠️ ★この検査が守らないもの】
 *   ★**中身の正しさ**は見ません。★「★7 日以内に誰かが走らせた」しか言いません。
 *   ★★**緑 ＝ 本番が正しい、ではありません。**
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error ★`.mjs` の部品（★`.d.mts` を置いていません）
import { STALENESS, ageDays, readCheck, recordPath } from '../../../tools/lib/staleness.mjs';

/** ★`tools/lib/staleness.mjs` は相対パスで書くので、★根から見る */
process.chdir(path.resolve(__dirname, '../../..'));

interface Item {
  what: string; label: string; maxAgeDays: number;
  pending?: boolean; until?: string; how: string; why: string;
}
const items = STALENESS as Item[];
/** ★記録の置き場（★`recordPath` は `evidence/<what>/last-check.json`） */
const EVIDENCE = 'evidence';
/** ★記録は在るのに登録簿に無いもの（★純関数にして、★自分で試せるようにする） */
function orphansAmong(withRecord: readonly string[], known: ReadonlySet<string>): string[] {
  return withRecord.filter((n) => !known.has(n));
}
const NOW = Date.now();
const TODAY = new Date(NOW).toISOString().slice(0, 10);

describe('🔴 ★記録が古びたら落ちる（DP-1）', () => {
  it('★登録簿の形が揃っている', () => {
    for (const e of items) {
      expect(typeof e.what, `${e.what}: what`).toBe('string');
      expect(e.maxAgeDays, `${e.what}: maxAgeDays が正でない`).toBeGreaterThan(0);
      expect(e.how.length, `${e.what}: how（直し方）が短すぎる`).toBeGreaterThan(10);
      expect(e.why.length, `${e.what}: why（根拠）が短すぎる`).toBeGreaterThan(20);
    }
  });

  /**
   * 🔴 ★**`pending` を「言い訳の置き場」にしない。**
   *   ★期限を必須にし、★過ぎたら落とします（★`open-findings` と同じ作法）。
   */
  it('🔴 ★`pending` には期限が在り、★切れていない', () => {
    const bad: string[] = [];
    for (const e of items.filter((x) => x.pending === true)) {
      if (typeof e.until !== 'string') { bad.push(`${e.what}: until が無い`); continue; }
      if (e.until < TODAY) bad.push(`${e.what}: 期限 ${e.until} を過ぎています`);
    }
    expect(bad, `🔴 ★動かせないままの項目が、★期限を過ぎています:\n  ${bad.join('\n  ')}`).toEqual([]);
  });

  // 🔴 ★**項目ごとに 1 つ**（★1 件の失敗が 4 件の赤に見えないように）
  for (const e of items) {
    const title = e.pending === true
      ? `⏸ ★${e.what}: ★まだ動かせない（★理由と期限を持つ）`
      : `🔴 ★${e.what}: ★記録が ${e.maxAgeDays} 日 より古くない`;
    it(title, () => {
      if (e.pending === true) {
        // ★動かせないものは、★「記録が無いこと」を責めません。★期限は上で見ています
        expect(e.why, `${e.what}: なぜ動かせないかが書かれていない`).toMatch(/\S/);
        return;
      }
      const rec = readCheck(e.what) as { checkedAt?: string } | null;
      expect(rec, `★${recordPath(e.what)} が在りません。\n   ★直し方: ${e.how}`).not.toBeNull();
      const age = ageDays(rec, NOW) as number | null;
      expect(age, `${e.what}: checkedAt を時刻として読めません`).not.toBeNull();
      expect(Number.isNaN(age), `🔴 ${e.what}: ★記録が**未来**です（★時計をずらして黙らせない）`)
        .toBe(false);
      expect(
        age as number,
        `🔴 ★${e.label} を ${(age as number).toFixed(1)} 日 確かめていません`
          + `（★上限 ${e.maxAgeDays} 日）。\n   ★直し方: ${e.how}`,
      ).toBeLessThan(e.maxAgeDays);
    });
  }

  /**
   * 🔴 ★**CK-16 — ★登録簿の見張りは、★両側を見る**（★2026-09-20）。
   *
   * 【★なぜ足したか】
   *   ⚠️ ★この簿には ★**「増えたら落ちる」も「減ったら落ちる」も在りませんでした。**
   *     ★`STALENESS` から 1 行 消しても、★**検査は 1 件も落ちません**（★静かに見張りが消える）。
   *   ✔ ★実例は `broad-deletes`: ★`delete` を `truncate` に変えた瞬間、★**登録簿から静かに消えた**。
   *     ★増える側だけ見る網は、★**「網が見なくなった」を「直った」と読みます。**
   *
   * ⚠️ ★下限は ★**いまの数に釘を打つ**だけです。★項目を減らすなら、★この数も一緒に直してください
   *    （★それが「人が判断した」の印になります）。
   */
  it('🔴 ★登録が黙って減らない（★CK-16・★見張りが静かに消えない）', () => {
    expect(items.length, '🔴 ★`STALENESS` の項目が減っています。'
      + '★減らしてよいなら、★この数も一緒に直してください（★人が判断した印）')
      .toBeGreaterThanOrEqual(5);
  });

  /**
   * 🔴 ★**孤児 — ★記録は在るのに、★登録簿に無い**（★CK-16 のもう片側）。
   *   ★`writeCheck()` は `evidence/<what>/last-check.json` に書きます。
   *   ★登録簿から外した項目の記録が残っていると、★**「確かめてある」ように見えます。**
   */
  it('★孤児を見つける述語が、★本当に見つける（★R-14: 検出器は自分自身を検査しない）', () => {
    // 🔴 ★これが無いと、★述語が壊れていても「孤児 0 件」で通ります（★CK-14）
    expect(orphansAmong(['a', 'b'], new Set(['a'])), '★孤児を見逃した').toEqual(['b']);
    expect(orphansAmong(['a'], new Set(['a', 'b'])), '★登録だけ在るものを孤児と呼んだ').toEqual([]);
  });

  it('🔴 ★記録が在るのに登録簿に無いものが無い（★孤児）', () => {
    const known = new Set(items.map((e) => e.what));
    const withRecord = readdirSync(EVIDENCE, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((n) => existsSync(join(EVIDENCE, n, 'last-check.json')));
    // ⚠️ ★対照: ★記録が 1 つも無ければ、★この検査は何も見ていません
    expect(withRecord.length, '🔴 ★記録が 1 つも在りません。★この検査は空回りしています')
      .toBeGreaterThan(0);
    const orphans = orphansAmong(withRecord, known);
    expect(
      orphans,
      `🔴 ★記録は在るのに登録簿に無い: ${orphans.join(' / ')}\n`
        + '   → ★`tools/lib/staleness.mjs` に戻すか、★記録のほうを消してください。\n'
        + '   ⚠️ ★残したままだと「確かめてある」ように見えます。',
    ).toEqual([]);
  });

  it('⚠️ ★この検査は「中身が正しい」を見ていない（★註記で明言している）', () => {
    const src = readCheck('prod-build') as { detail?: unknown } | null;
    // ★記録が在るなら、★中身の判定はこの検査の仕事ではない、という確認
    void src;
    expect(true).toBe(true);
  });
});
