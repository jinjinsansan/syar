/**
 * ★**生涯の記録の行数を毎日見る配線**（★正典 §18 **LR-10**・移行 `0029`・2026-09-16）
 *
 * 【★なぜ検査で固定するか】
 *   ★**LR-9 の教訓そのものです。** ★`tools/settle-races.mjs` が `epochMs` を渡しておらず、
 *   ★**確定しても物語が 1 行も書かれない**期間がありました。★純関数も偽 DB の検査も全部緑でした。
 *   → ★「作った」と「経路に繋がっている」は別です。★**ワーカーが本当に呼んでいるか**を見ます。
 *
 * 【★見ている壊れ方】
 *   ① ★道具はあるのに ★**ワーカーが呼んでいない**（★LR-9 と同じ形）
 *   ② ★**新しい仕組みを作った**（★裁定: 既存の日次の枠に 1 本足すだけ）
 *   ③ ★**閾値を置いた**（★裁定: 閾値は置かない。★線を引くと「通るだけの検査」になる・R-16）
 *   ④ ★**`point_flow_daily` に混ぜた**（★物語の行数は資金ではない・D-052）
 *   ⑤ ★増分 0（★**止まった**）が、★黙って流れる
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { STORY_EVENT_TYPES } from '@star/training';
import { formatStoryDay, type StoryDaySnapshot } from '../../worker/src/story-daily.js';

const ROOT = path.resolve(__dirname, '../../..');
const strip = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');
const read = (rel: string): string => strip(readFileSync(path.join(ROOT, rel), 'utf8'));
const MAIN = read('apps/worker/src/main.ts');
const FLOW = read('apps/worker/src/story-daily.ts');
const MIGRATION = readFileSync(path.join(ROOT, 'db/migrations/0029_story_daily.sql'), 'utf8');

describe('★行数を日次で見る（§18 LR-10）', () => {
  it('① ★★ワーカーが本当に呼んでいる（★作っただけで終わらせない・LR-9）', () => {
    expect(MAIN).toMatch(/recordStoryRows/);
    expect(MAIN).toMatch(/formatStoryDay/);
  });

  it('② ★既存の日次の枠の中で呼んでいる（★新しい仕組みを作っていない）', () => {
    /**
     * ★`lastAggregated` で 1 日 1 回に絞っている既存の枠の中にあること。
     * ★呼び出しが枠の外にあると、★毎周 DB を叩きます。
     */
    const block = MAIN.slice(MAIN.indexOf('lastAggregated = today'));
    expect(block, '★日次の枠の中で呼んでいない').toMatch(/recordStoryRows/);
    /** ★新しいタイマー・新しい常駐を作っていない */
    expect(MAIN).not.toMatch(/setInterval\s*\([^)]*story/i);
  });

  it('②-2 ★★失敗しても他の日次の処理を巻き込まない（★2026-09-17 の点検で見つけた）', () => {
    /**
     * ⚠️ ★`lastAggregated = today` は `recordStoryRows` より**前**にあります。
     *    ★だから投げても ★**その日はもう呼ばれません**。★それ自体は許容します（★記録は
     *    ★着順にも経済にも効かない・LR-5）が、★**後ろの処理まで道連れにしてはいけません**。
     * ★隣の `refreshMarketListings`・`syncStableGradePrices` は個別に try/catch で囲まれています。
     *    ★同じ形にしていないと、★移行 0029 が当たっていない DB で
     *    ★**市場の出品と厩舎の格の値段が毎日止まります**。
     */
    /**
     * ⚠️ ★**import 行から切り出さないこと**（★2026-09-17 にこれで誤判定しました）。
     *    ★`indexOf('recordUnlockDistribution')` は **30 行目の import** に当たり、
     *    ★`refreshMarketListings` の import までの数十文字しか見ていませんでした。
     *    → ★**呼び出しの形**（`await 〜(`）で切り出します。
     */
    const from = MAIN.indexOf('await recordUnlockDistribution(');
    const to = MAIN.indexOf('await refreshMarketListings(');
    expect(from, '★日次の枠の呼び出しが見つからない').toBeGreaterThan(0);
    expect(to, '★出品の更新の呼び出しが見つからない').toBeGreaterThan(from);
    const between = MAIN.slice(from, to);
    expect(between, '★行数の記録が日次の枠に無い').toContain('recordStoryRows');
    expect(between, '★★独自の try/catch で囲んでいない（★後ろの処理を巻き込む）')
      .toMatch(/try\s*\{[\s\S]*recordStoryRows[\s\S]*catch/);
  });

  it('③ ★閾値を置いていない（★裁定: 線を引かない）', () => {
    /** ★「これを超えたら警報」に当たる比較を持たない */
    expect(FLOW).not.toMatch(/rows\s*[><]=?\s*\d/);
    expect(FLOW).not.toMatch(/THRESHOLD|LIMIT_|MAX_ROWS|警報|アラート/);
    /** ★判定の語を持たない（★数えて残すだけ） */
    expect(FLOW).not.toMatch(/PASS|FAIL|合否/);
  });

  it('④ ★`point_flow_daily` に混ぜていない（★物語の行数は資金ではない・D-052）', () => {
    expect(FLOW).not.toContain('point_flow_daily');
    expect(FLOW).toContain('story_daily');
    expect(MIGRATION).toMatch(/create table if not exists story_daily/i);
    /** ★資金の表に列を足していない */
    expect(MIGRATION).not.toMatch(/alter table point_flow_daily/i);
  });

  /**
   * ★移行 `0029` の要点。
   * ⚠️ ★**番号の連番はここで見ません** — ★`entry-scratch-migration.test.ts` が
   *    ★**全ファイルを走査**しており、★`0029` を足した時点で自動的に効きます（★二重帳簿にしない）。
   */
  it('★移行 0029 の要点（★既定値の罠を作らない・利用者に開けない・混ぜない）', () => {
    /** ★`rows`・`horses` は not null で既定値なし（★書き忘れたら入らない＝黙って 0 が入らない） */
    expect(MIGRATION).toMatch(/rows bigint not null/i);
    expect(MIGRATION).toMatch(/horses bigint not null/i);
    expect(MIGRATION).not.toMatch(/rows bigint not null[^,]*default/i);
    expect(MIGRATION).not.toMatch(/horses bigint not null[^,]*default/i);
    /** ★運営の監視の表。★利用者には開けない（★`point_flow_daily` と同じ扱い） */
    expect(MIGRATION).toMatch(/alter table story_daily enable row level security/i);
    expect(MIGRATION).toMatch(/revoke\s+insert,\s*update,\s*delete,\s*truncate\s+on\s+story_daily\s+from\s+anon,\s*authenticated/i);
    /** ★1 つの移行で 1 つのこと（★RPC も他の表の破壊も混ぜない） */
    expect(MIGRATION).not.toMatch(/create or replace function/i);
    expect(MIGRATION).not.toMatch(/drop table|drop column/i);
  });

  it('⑤ ★★「増えていない」が目に付く（★止まったことを捕まえる）', () => {
    const base = { rows: 100, horses: 50, byType: { debut: 100 } };
    /** ★増分 0 は専用の語で出す（★`+0` を黙って流さない） */
    const stopped = formatStoryDay({ ...base, deltaRows: 0 } as StoryDaySnapshot, ['debut']);
    expect(stopped).toContain('前日から増えていません');
    /** ★増えた日は差を出す */
    const moved = formatStoryDay({ ...base, deltaRows: 12 } as StoryDaySnapshot, ['debut']);
    expect(moved).toContain('+12');
    /** ★前日の記録が無いときは 0 と混ぜない */
    const first = formatStoryDay({ ...base, deltaRows: null } as StoryDaySnapshot, ['debut']);
    expect(first).toContain('前日の記録なし');
    expect(first).not.toContain('前日から増えていません');
  });

  it('★書かれていない種類が読める（★2026-09-16 に 15 種のうち 2 種しか無かった）', () => {
    const snap = { rows: 77, horses: 68, byType: { debut: 69, 'first-win': 8 }, deltaRows: 5 } as StoryDaySnapshot;
    const line = formatStoryDay(snap, STORY_EVENT_TYPES);
    /** ★15 種のうち 13 種に行が無いことが、その場で読める */
    expect(line).toContain(`${STORY_EVENT_TYPES.length - 2}/${STORY_EVENT_TYPES.length}`);
    expect(line).toContain('birth');
    /** ★全種そろっていれば、その注記は出ない */
    const full = Object.fromEntries(STORY_EVENT_TYPES.map((t) => [t, 1]));
    expect(formatStoryDay({ ...snap, byType: full }, STORY_EVENT_TYPES)).not.toContain('行が 1 つも無い種類');
  });
});
