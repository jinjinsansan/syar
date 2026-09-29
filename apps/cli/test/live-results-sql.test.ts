/**
 * ★**発走時刻からの着順の公開**（★2026-09-29・移行 0098・レビュー側 B 条件 1・3）
 *
 * 【★見ている壊れ方】
 *   ① ★段だけ・時刻だけで出す（★発走前に着順が見える）→ ★「scheduled かつ 発走時刻を過ぎた」の「かつ」
 *   ② ★中止（cancelled）・公示（announced）で ① の着順が出る
 *   ③ ★① の表が 利用者に直に開く
 * ⚠️ ★実 DB での「発走前に anon・authenticated の両方で読めない」は ★tools/verify-live-results.mjs（staging）が見る。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
// @ts-expect-error -- .mjs の素の JS を読む（型定義は置いていない・`exposure-registry.test.ts` と同じ作法）
import { EXPECTED_EXPOSURE, CLOSED } from '../../../tools/lib/exposure-registry.mjs';

const MIG = path.resolve(__dirname, '../../../db/migrations');
/** ★最後に定義された race_entries_public（★前の定義を見て緑にしない） */
function latestView(): { file: string; body: string } {
  let out = { file: '', body: '' };
  for (const f of readdirSync(MIG).filter((x) => x.endsWith('.sql')).sort()) {
    const s = readFileSync(path.join(MIG, f), 'utf8');
    const i = s.search(/create\s+or\s+replace\s+view\s+(public\.)?race_entries_public\b/i);
    if (i < 0) continue;
    out = { file: f, body: s.slice(i, s.indexOf(';', i)) };
  }
  return out;
}

describe('★発走時刻からの着順の公開（0098）', () => {
  const v = latestView();
  const noComments = v.body.replace(/--[^\n]*/g, '');

  it('★最新の定義は 0098 以降', () => {
    expect(v.file >= '0098', v.file).toBe(true);
    expect(noComments.length).toBeGreaterThan(200);
  });

  it('🔴 ① 着順の 2 列は ★settled か ★「scheduled かつ 発走時刻を過ぎた」だけ（★段と時刻を「かつ」で）', () => {
    for (const col of ['finish_pos', 'finish_time']) {
      const re = new RegExp(
        `case\\s+when r\\.status = 'settled' then e\\.${col}\\s+when r\\.status = 'scheduled' and r\\.scheduled_at <= now\\(\\) then lr\\.${col}\\s+else null\\s+end as ${col}`,
      );
      expect(noComments, `★${col} の式`).toMatch(re);
    }
    /** ★時刻だけ・段だけの形が 残っていない */
    expect(noComments).not.toMatch(/when r\.scheduled_at <= now\(\) then lr\./);
    expect(noComments).not.toMatch(/when r\.status = 'scheduled' then lr\./);
  });

  it('🔴 ② 中止・公示は どちらの枝にも当たらない（★① の着順が出ない）', () => {
    expect(noComments).not.toMatch(/cancelled|announced'\s+then lr|'closed'/);
    /** ★① の表を読むのは この 2 列の枝だけ */
    expect(noComments.match(/\blr\.\w+/g)).toEqual(['lr.finish_pos', 'lr.finish_time', 'lr.race_id', 'lr.gate']);
  });

  it('🔴 ③ ① の表は 利用者から閉じている（★V-20 の簿・移行の revoke）', () => {
    expect(EXPECTED_EXPOSURE['race_live_results']).toBe(CLOSED);
    const s = readFileSync(path.join(MIG, '0098_race_live_results.sql'), 'utf8');
    expect(s).toMatch(/alter table race_live_results enable row level security;/);
    expect(s).toMatch(/revoke all on table race_live_results from public, anon, authenticated;/);
    expect(s).not.toMatch(/grant [^;]*on (table )?race_live_results/i);
  });
});
