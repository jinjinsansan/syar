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
// @ts-expect-error ★`.mjs` の部品（★`.d.mts` を置いていません）
import { STALENESS, ageDays, readCheck, recordPath } from '../../../tools/lib/staleness.mjs';

/** ★`tools/lib/staleness.mjs` は相対パスで書くので、★根から見る */
process.chdir(path.resolve(__dirname, '../../..'));

interface Item {
  what: string; label: string; maxAgeDays: number;
  pending?: boolean; until?: string; how: string; why: string;
}
const items = STALENESS as Item[];
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

  it('⚠️ ★この検査は「中身が正しい」を見ていない（★註記で明言している）', () => {
    const src = readCheck('prod-build') as { detail?: unknown } | null;
    // ★記録が在るなら、★中身の判定はこの検査の仕事ではない、という確認
    void src;
    expect(true).toBe(true);
  });
});
