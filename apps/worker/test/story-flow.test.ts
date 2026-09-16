/**
 * ★**生涯の記録を書く経路**（★(a) 第 5 便-4・2026-09-16・正典 **§18**・移行 `0024`）
 *
 * ★偽の DB で `writeRaceStory` を**本物のまま**回します（★出来事を決める純関数も本物）。
 *
 * 【★見ている壊れ方】
 *   ① ★**文章を保存する**（★LR-4。★文言を直した日に、過去の行だけ古い文のまま残る）
 *   ② ★**持ち主の情報を書く**（★LR-6。★表示名・牧場名を残さない）
 *   ③ ★**二度確定すると行が増える**（★冪等でない）
 *   ④ ★**実時刻を書く**（★LR-3 の家族・憲法 4。★残すのは**ゲーム内の週**）
 *   ⑤ ★戦績の数え方がずれる（★このレース自身を「前の戦績」に数える／まだ走っていない登録を数える）
 *   ⑥ ★騎手を名簿から引き直す（★凍結から読む・D-105 ④）
 */
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JOCKEY_BOND_MAX } from '@star/scheduler';
import { writeRaceStory } from '../src/story-flow.js';

const SRC = readFileSync(path.join(path.resolve(__dirname, '..'), 'src/story-flow.ts'), 'utf8');

const uuid = (i: number): string => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
const HORSE_A = uuid(1);
const HORSE_B = uuid(2);
const RACE = uuid(99);

interface StoredEvent {
  horse_id: string; event_type: string; game_week: number; race_id: string;
  detail: Record<string, unknown>;
}

/** ★`prior` … その馬の「このレースより前」の戦績（★偽 DB が返す値） */
function fakeDb(
  prior: Record<string, { runs: number; wins: number; rides: number }>,
  stored: StoredEvent[],
): { client: pg.Client; sqls: string[] } {
  const sqls: string[] = [];
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      sqls.push(sql);
      if (sql.includes('from race_entries e') && sql.includes('group by e.horse_id')) {
        /** ★このレースを除いていること（★SQL の文面で確かめる・R-30） */
        expect(sql).toContain('e.race_id <> $3');
        expect(sql).toContain('e.finish_pos is not null');
        const ids = params[0] as string[];
        const rows = ids
          .filter((id) => prior[id] !== undefined)
          .map((id) => ({
            horse_id: id,
            runs: String(prior[id]!.runs),
            wins: String(prior[id]!.wins),
            rides: String(prior[id]!.rides),
          }));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('insert into horse_story_event')) {
        const ids = params[0] as string[];
        const kinds = params[1] as string[];
        const weeks = params[2] as number[];
        const details = params[3] as string[];
        const raceId = params[4] as string;
        let n = 0;
        ids.forEach((id, i) => {
          /** ★`not exists` の冪等を偽 DB でも効かせる（★SQL の文面にあるときだけ） */
          const dup = sql.includes('not exists')
            && stored.some((e) => e.horse_id === id && e.event_type === kinds[i] && e.race_id === raceId);
          if (dup) return;
          stored.push({
            horse_id: id, event_type: kinds[i]!, game_week: weeks[i]!, race_id: raceId,
            detail: JSON.parse(details[i]!) as Record<string, unknown>,
          });
          n += 1;
        });
        return { rows: [{ n: String(n) }], rowCount: 1 };
      }
      throw new Error(`偽の DB が想定していない SQL: ${sql.slice(0, 60)}`);
    },
  };
  return { client: client as unknown as pg.Client, sqls };
}

const input = (over: Partial<Parameters<typeof writeRaceStory>[1]> = {}) => ({
  raceId: RACE,
  raceName: '桜星賞',
  grade: 'G1' as const,
  week: 1234,
  runners: [
    { horseId: HORSE_A, finishPosition: 1, jockeyName: '青井 はやと', jockeyId: 'j-aoi' },
    { horseId: HORSE_B, finishPosition: 2, jockeyName: '倉田 みなと', jockeyId: 'j-kurata' },
  ],
  ...over,
});

describe('★生涯の記録を書く（§18・第 5 便-4）', () => {
  it('★勝った馬にだけ、初勝利・重賞勝ち・最高格勝ちが残る', async () => {
    const stored: StoredEvent[] = [];
    const { client } = fakeDb({ [HORSE_A]: { runs: 4, wins: 0, rides: 1 }, [HORSE_B]: { runs: 9, wins: 3, rides: 1 } }, stored);
    const r = await writeRaceStory(client, input());

    expect(r.written).toBe(3);
    expect(r.horses).toBe(1);
    expect(stored.map((e) => e.event_type)).toEqual(['first-win', 'graded-win', 'top-grade-win']);
    for (const e of stored) expect(e.horse_id).toBe(HORSE_A);
  });

  it('③ ★二度呼んでも行が増えない（★二重確定・再実行に耐える）', async () => {
    const stored: StoredEvent[] = [];
    const { client } = fakeDb({ [HORSE_A]: { runs: 4, wins: 0, rides: 1 }, [HORSE_B]: { runs: 9, wins: 3, rides: 1 } }, stored);
    await writeRaceStory(client, input());
    const again = await writeRaceStory(client, input());
    expect(again.written).toBe(0);
    expect(stored.length).toBe(3);
  });

  it('①② ★文章も持ち主の情報も保存しない（★LR-4・LR-6）', async () => {
    const stored: StoredEvent[] = [];
    const { client } = fakeDb({ [HORSE_A]: { runs: 0, wins: 0, rides: 0 }, [HORSE_B]: { runs: 0, wins: 0, rides: 0 } }, stored);
    await writeRaceStory(client, input({ grade: null }));
    for (const e of stored) {
      /** ★残すのは値だけ（★文・表示名・牧場名を持たない） */
      expect(Object.keys(e.detail).sort()).toEqual(['finishPosition', 'jockeyName', 'raceName']);
      expect(JSON.stringify(e.detail)).not.toMatch(/牧場|ownerName|displayName|しました|勝ちました/);
    }
  });

  it('④ ★残すのはゲーム内の週（★実時刻を書かない・憲法 4）', async () => {
    const stored: StoredEvent[] = [];
    const { client } = fakeDb({ [HORSE_A]: { runs: 0, wins: 0, rides: 0 }, [HORSE_B]: { runs: 0, wins: 0, rides: 0 } }, stored);
    await writeRaceStory(client, input({ week: 777 }));
    for (const e of stored) expect(e.game_week).toBe(777);
    /** ★この層は時刻も乱数も読まない */
    expect(SRC).not.toMatch(/Date\.now|Math\.random|new Date\(/);
  });

  it('⑥ ★騎手は凍結から読む（★名簿を引き直さない・D-105 ④）', () => {
    /** ★名簿（`JOCKEYS`）を引いていない。★引くのは上限の値だけ */
    expect(SRC).not.toMatch(/JOCKEYS|jockeyById/);
    expect(SRC).toMatch(/JOCKEY_BOND_MAX/);
    expect(JOCKEY_BOND_MAX).toBeGreaterThan(0);
  });

  it('★名コンビは頭打ちに達した回に残る（★戦績の数え方が効いている）', async () => {
    const stored: StoredEvent[] = [];
    const { client } = fakeDb(
      { [HORSE_A]: { runs: 9, wins: 3, rides: JOCKEY_BOND_MAX - 1 }, [HORSE_B]: { runs: 9, wins: 3, rides: 0 } },
      stored,
    );
    await writeRaceStory(client, input({ grade: null }));
    expect(stored.map((e) => e.event_type)).toEqual(['jockey-bond']);
    expect(stored[0]!.horse_id).toBe(HORSE_A);
  });

  it('★出走馬がいなければ何も書かない（★空の insert を出さない）', async () => {
    const stored: StoredEvent[] = [];
    const { client, sqls } = fakeDb({}, stored);
    const r = await writeRaceStory(client, input({ runners: [] }));
    expect(r.written).toBe(0);
    expect(sqls.some((s) => s.includes('insert into horse_story_event'))).toBe(false);
  });
});
