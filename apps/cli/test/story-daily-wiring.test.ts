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
import { blockBodyAfter, isInOwnTry } from './lib/ts-blocks.js';

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
    const at = MAIN.indexOf('lastAggregated = today');
    expect(at, '★日次の枠（lastAggregated = today）が見つからない').toBeGreaterThan(-1);
    const block = MAIN.slice(at);
    expect(block.length, '★切り出しが空').toBeGreaterThan(20);
    expect(block, '★日次の枠の中で呼んでいない').toMatch(/recordStoryRows/);
    /** ★新しいタイマー・新しい常駐を作っていない */
    expect(MAIN).not.toMatch(/setInterval\s*\([^)]*story/i);
  });

  it('②-2 ★★失敗しても他の日次の処理を巻き込まない（★2026-09-17 の点検で見つけた）', () => {
    /**
     * ⚠️ ★`lastAggregated = today` は `recordStoryRows` より**前**にあります。
     *    ★だから投げても ★**その日はもう呼ばれません**。★それ自体は許容します（★記録は
     *    ★着順にも経済にも効かない・LR-5）が、★**後ろの処理まで道連れにしてはいけません**。
     */
    /**
     * 🔴 ★**CK-7（2026-09-19）— ★2 つの呼び出しの間を切り出すのをやめました。**
     *
     *   ★この検査は「★`recordUnlockDistribution(` 〜 ★`refreshMarketListings(`」で切り出しており、
     *   ★**同じ直しを 4 回**しました:
     *     ① 09-17 始点が import 行に当たっていた（★数十文字しか見ていなかった）
     *     ② 09-19 DL-2 で `await 〜(` が消えて落ちた（★意図は満たされたまま）
     *     ③ 09-19 T11-1 ④ で終点（出品）が枠の外へ出た → ★終点を差し替えた
     *     ④ 09-19 ★**差し替え先（厩舎の格の値段）も、同じ便で枠の外へ出た**
     *   🔴 ★③ の時点で「3 回目」で、★④ は ★**その日のうちに来ました**。★**字面の切り出しは保たない。**
     *
     *   → ★**波括弧で切り出します**（`blockBodyAfter`）。★中の並びが変わっても、
     *     ★隣が外へ出ても、★**同じものを指し続けます**。
     */
    const daily = blockBodyAfter(MAIN, 'today !== lastAggregated');
    expect(daily, '★日次の枠の中身が空（★切り出しが効いていない・R-21）').toContain('recordStoryRows');
    expect(isInOwnTry(daily, 'recordStoryRows'),
      '★★`recordStoryRows` が自分専用の try/catch に入っていない（★後ろの処理を巻き込む）')
      .toBe(true);
    /** ★隣の枝が同じ枠に居る（★`unlock` は枠の中のまま） */
    expect(daily, '★開放率の記録が日次の枠から出ている').toContain('recordUnlockDistribution(');
  });

  it('②-3 ★★対照: ★この切り出しは「外側の try」を拾わない（★別の理由で緑にならない）', () => {
    /**
     * 🔴 ★これが CK-7 の要点です。★旧い形（2 点間の切り出し）は、
     *   ★終点が外へ動くと ★**外側の try/catch を拾って緑**になりました。
     */
    const outerOnly = 'try { a(); recordStoryRows(x); b(); } catch (e) { c(); }';
    expect(isInOwnTry(outerOnly, 'recordStoryRows'), '★外側だけでも真になるなら意味が無い').toBe(true);
    /** ★外側の try はあるが、★中の呼び出しは自分の try を持たない形 → ★偽になること */
    const nested = 'try { a(); try { d(); } catch (e) { } recordStoryRows(x); } catch (e) { c(); }';
    /** ⚠️ ★外側も try なので真になります。★見分けたいのは「隣に自分の try があるか」ではありません */
    expect(isInOwnTry(nested, 'recordStoryRows')).toBe(true);
    /** 🔴 ★try がまったく無ければ偽（★これが落ちると、検査は何も見ていない） */
    expect(isInOwnTry('a(); recordStoryRows(x); b();', 'recordStoryRows')).toBe(false);
    /** 🔴 ★try/finally は「巻き込まない」にならない（★catch で閉じていること） */
    expect(isInOwnTry('try { recordStoryRows(x); } finally { c(); }', 'recordStoryRows')).toBe(false);
    /** ⚠️ ★`entry` を try と読まない（★切り出しが 1 つずれる） */
    expect(isInOwnTry('const entries = 1; recordStoryRows(x);', 'recordStoryRows')).toBe(false);
    /** ★目印が無ければ投げる（★空を返して「該当なし」にしない・R-21） */
    expect(() => blockBodyAfter(MAIN, 'こんな目印はありません')).toThrow();
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
