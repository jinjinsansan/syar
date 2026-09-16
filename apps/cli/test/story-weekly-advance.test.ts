/**
 * ★**記録だけの馬は週送りの対象に入らない**（★ゲーム本体 第 3 便・2026-09-16・正典 **§18 LR-3**）
 *
 * 【★なぜ検査で固定するか】
 *   ★正典 LR-3 は「**記録だけの馬が週進行のクエリから外れていることを検査で固定する**」と書いています。
 *   ★いまのワーカーは `retired_at_week is null` で絞っているので **既に満たしています**が、
 *   ★**それは「たまたま今そうなっている」だけ**です（★`horse_story_event` を足したこの便から、
 *   ★記録だけの馬は**増え続けます**・LR-8）。★条件を外した日に、★週送りの所要が頭数に比例して増えます。
 *
 * 【★見方】★製品の SQL を**構文木ではなく文字列**で見ます（★SQL は TypeScript の構文木に出ないため）。
 *   ★`grep` との違いは、★**「週送りのクエリ」だけを取り出してから**条件を見ている点です
 *   （★ファイル全体に語があればよい、にしない）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isRecordOnly, weeklyAdvanceTargets } from '@star/training';

const ROOT = path.resolve(__dirname, '../../..');
const RUNNER = path.join(ROOT, 'apps/worker/src/training-runner.ts');

/** ★`from horses` を含む select 文を取り出す（★週送りが読む馬の集合） */
function horseSelects(sql: string): string[] {
  return [...sql.matchAll(/select[\s\S]{0,600}?from horses[\s\S]{0,400}?`/gi)].map((m) => m[0]);
}

describe('★記録だけの馬は週送りの対象に入らない（§18 LR-3）', () => {
  const src = readFileSync(RUNNER, 'utf8');

  it('① ★週送りが読む馬のクエリは、引退した馬を外している', () => {
    const selects = horseSelects(src);
    expect(selects.length, '★週送りのクエリが見つからない').toBeGreaterThan(0);
    const bad = selects.filter((s) => !/retired_at_week\s+is\s+null/i.test(s));
    expect(bad.map((s) => s.slice(0, 80)), '★引退を外していないクエリ').toEqual([]);
  });

  it('② ★対象の数え方も同じ条件（★上限の計算だけ条件が違うと、途中で止まる）', () => {
    /** ★頭数を数える所（`count(*)`）も同じ条件で絞っていること */
    const counts = [...src.matchAll(/count\(\*\)[\s\S]{0,200}?from horses[\s\S]{0,200}?['"`]/gi)].map((m) => m[0]);
    expect(counts.length, '★頭数を数えるクエリが見つからない').toBeGreaterThan(0);
    for (const c of counts) {
      expect(c, `★数える側の条件: ${c.slice(0, 80)}`).toMatch(/retired_at_week\s+is\s+null/i);
    }
  });

  it('③ ★規則の側（@star/training）も同じ判定（記録だけの馬を外す）', () => {
    /** ★引退して繁殖にも種牡馬にも上がらなかった馬＝記録だけ（LR-2） */
    expect(isRecordOnly({ retired: true, breeds: false })).toBe(true);
    const horses = [
      { id: 'active', retired: false, breeds: false },
      { id: 'broodmare', retired: true, breeds: true },
      { id: 'record', retired: true, breeds: false },
    ];
    expect(weeklyAdvanceTargets(horses).map((h) => h.id)).toEqual(['active', 'broodmare']);
  });

  it('④ ★記録が増えても週送りの対象は増えない（LR-3 の目的）', () => {
    const base = [{ id: 'a', retired: false, breeds: false }];
    const withRecords = [...base, ...Array.from({ length: 500 }, (_, i) => ({ id: `r${i}`, retired: true, breeds: false }))];
    expect(weeklyAdvanceTargets(withRecords).length).toBe(weeklyAdvanceTargets(base).length);
  });
});
