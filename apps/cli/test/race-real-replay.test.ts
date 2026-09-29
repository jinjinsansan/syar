/**
 * 🔴 ★**実レースの録画を読む層が、★出してはいけないものを止めること**（★段 2 D・2026-09-27）
 *   ★裁定 `REVIEW_RACE_REAL_D_AND_CALIBRATION_20260927.md` §4〜§6・★読む層 `apps/web/src/lib/race-real.ts`
 *
 * 【★見ている壊れ方】
 *   ① ★確定前のレースを走らせる（★「そのレースを見た」が嘘になる・契約 §表示段階）
 *   ② ★自分の馬が出ていないレースで ★どれかの馬を「自馬」と偽る（★裁定 Q-RACE-6。★2026-09-28 から ★出すが `ownGate` は `null`）
 *   ③ ★取消で欠けた枠を詰めて並べる（★馬番の嘘）
 *   ④ ★知らない格・条件を既定へ落とす（★R-27）
 *   ⑤ ★ログインしていないのに `is_mine` を読んだことにする（★`readClient` では常に偽）
 *   ⑥ 🔴 ★**入口を作らない**（★裁定 Q-RACE-6 の条件）: ★`/race?race=` へのリンクを ★他の画面に張らない
 *
 * ⚠️ ★DB には繋ぎません。★`supabase` の層だけを ★表を返す偽物に差し替え、★読む層の判断だけを見ます。
 *    ★「止める」判定には ★**止めない対照**（★揃ったレースは読める）を必ず並べます（★0 件を合格と読ませない）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

type Row = Record<string, unknown>;
interface Result { readonly data: Row[]; readonly error: null }

/** ★`from(表).select().eq().order().limit()` の最小の偽物（★`eq` は その列を持つ行だけ絞る） */
class FakeQuery implements PromiseLike<Result> {
  constructor(private readonly rows: Row[]) {}
  select(): FakeQuery { return this; }
  order(): FakeQuery { return this; }
  limit(): FakeQuery { return this; }
  eq(col: string, value: unknown): FakeQuery {
    return new FakeQuery(this.rows.filter((r) => !(col in r) || r[col] === value));
  }
  then<A = Result, B = never>(
    ok?: ((v: Result) => A | PromiseLike<A>) | null,
    ng?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve<Result>({ data: this.rows, error: null }).then(ok, ng);
  }
}

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  loggedIn: true,
}));

vi.mock('../../web/src/lib/supabase', () => {
  const client = (): unknown => ({
    from: (table: string) => new FakeQuery(state.tables[table] ?? []),
    auth: { getSession: async () => ({ data: { session: state.loggedIn ? { user: { id: 'u1' } } : null } }) },
  });
  return { readClient: client, authClient: client };
});

const {
  loadRealRace, RaceNotPlayableError, settledResultOf, assertReplayOrder, replayStopMessage, ReplayOrderMismatchError,
} = await import('../../web/src/lib/race-real');
const { replayOf } = await import('../../../packages/race-engine/src/index.js');

const RACE_ID = 'r-1';
const race = (over: Row = {}): Row => ({
  id: RACE_ID, name: 'R120', status: 'settled', scheduled_at: '2026-09-27T00:00:00Z',
  grade: null, surface: 'turf', distance: 1600, track_condition: 'good', course_id: 'star-park', cycle_index: 120,
  ...over,
});
/** ★8 頭・★着順はタイム順・★自馬は 3 番 */
const entries = (n = 8, over: (i: number) => Row = () => ({})): Row[] => Array.from({ length: n }, (_, i) => ({
  race_id: RACE_ID, gate: i + 1, horse_name: `馬${i + 1}`,
  strategy: (['nige', 'senko', 'sashi', 'oikomi'] as const)[i % 4], weight: 55,
  finish_pos: i + 1, finish_time: 95 + i * 0.3, horse_id: `h${i + 1}`, is_mine: i + 1 === 3,
  ...over(i),
}));

beforeEach(() => {
  state.loggedIn = true;
  state.tables = {
    races_public: [race()],
    race_entries_public: entries(),
    my_runs: [{ race_id: RACE_ID, gate: 3, game_week: 60 }],
    race_odds_public: [
      { race_id: RACE_ID, bet_type: 'win', selection: [1], odds: 3.2 },
      { race_id: RACE_ID, bet_type: 'win', selection: [3], odds: 7.5 },
      { race_id: RACE_ID, bet_type: 'place', selection: [1], odds: 1.4 },
    ],
  };
});

describe('🔴 ★実レースの録画を読む層', () => {
  it('✅ ★対照: 揃ったレース（確定・自馬あり・枠が欠けない）は読める', async () => {
    const data = await loadRealRace(RACE_ID);
    expect(data.runners.map((r) => r.gate)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(data.ownGate, '★自馬は `is_mine` の馬').toBe(3);
    expect(data.focusGate, '★自馬が居れば ★主役も自馬（★1 着ではない）').toBe(3);
    expect(data.gameWeek, '★週は `my_runs` から').toBe(60);
    expect(data.raceNo, '★R 番号は `slotOfDay(cycle_index) + 1`').toMatch(/^\d+R$/);
    expect(data.grade, '★格が無ければ平場（null）').toBeNull();
    /** ★単勝だけ・★無い馬は入れない（★埋めない） */
    expect([...data.winOddsByGate.entries()]).toEqual([[1, 3.2], [3, 7.5]]);
    expect(data.weightKgByGate.get(8)).toBe(55);
  });

  it('✅ ★対照: 18 頭立ても読める（★頭数で止めない・裁定 Q-RACE-5）', async () => {
    state.tables['race_entries_public'] = entries(18);
    const data = await loadRealRace(RACE_ID);
    expect(data.runners).toHaveLength(18);
  });

  /** ★2026-09-29（★0098）: ★止めるのは ★発走前（★確定前でも 発走時刻を過ぎた scheduled は ① の着順で走らせる） */
  it('🔴 ① 発走前は止める（★締切後の closed・★発走前の scheduled）', async () => {
    state.tables['races_public'] = [race({ status: 'closed' })];
    await expect(loadRealRace(RACE_ID)).rejects.toThrow(RaceNotPlayableError);
    await expect(loadRealRace(RACE_ID)).rejects.toThrow(/まだ発走していません/);
    state.tables['races_public'] = [race({ status: 'scheduled', scheduled_at: new Date(Date.now() + 60_000).toISOString() })];
    await expect(loadRealRace(RACE_ID)).rejects.toThrow(/まだ発走していません/);
  });

  it('✅ ①′ 確定前でも 発走時刻を過ぎた scheduled は 走らせる（★① 決めた着順・0098）', async () => {
    state.tables['races_public'] = [race({ status: 'scheduled', scheduled_at: new Date(Date.now() - 5_000).toISOString() })];
    const data = await loadRealRace(RACE_ID);
    expect(data.runners.length).toBeGreaterThan(0);
  });

  /**
   * ★2026-09-28（観戦・オーナー許可）: ★自分の馬が出ていないレースも ★出します。
   *   ★ただし ★`ownGate` は `null`（★どれかの馬を自馬と偽らない）・★カメラの主役は ★1 着。
   *   ★1 着を ★8 番にして ★「既定の 1 番がたまたま 1 着」で通らないようにしています。
   */
  it('🔴 ② 自分の馬が出ていないレースは ★自馬なし・★主役は 1 着（★どれかの馬を自馬と偽らない）', async () => {
    state.tables['race_entries_public'] = entries(8, (i) => ({
      is_mine: false, finish_pos: 8 - i, finish_time: 95 + (7 - i) * 0.3,
    }));
    const data = await loadRealRace(RACE_ID);
    expect(data.ownGate).toBeNull();
    expect(data.focusGate, '★主役は 1 着の馬').toBe(8);
  });

  it('🔴 ③ 取消で欠けた枠があるレースは止める（★詰めて並べない）', async () => {
    state.tables['race_entries_public'] = entries(8, (i) => (i === 4 ? { finish_pos: null, finish_time: null } : {}))
      .map((r) => (Number(r['finish_pos']) > 5 ? { ...r, finish_pos: Number(r['finish_pos']) - 1 } : r));
    await expect(loadRealRace(RACE_ID)).rejects.toThrow(/取消で欠けた枠/);
  });

  it('🔴 ④ 知らない格は既定へ落とさず止める', async () => {
    state.tables['races_public'] = [race({ grade: 'OP' })];
    await expect(loadRealRace(RACE_ID)).rejects.toThrow(/条件が読めません/);
  });

  it('🔴 ⑤ ログインしていなければ止める（★`is_mine` はサーバーが判定する）', async () => {
    state.loggedIn = false;
    await expect(loadRealRace(RACE_ID)).rejects.toThrow(/ログイン/);
  });

  it('🔴 ★斤量が欠けた馬がいれば止める（★出馬表に出る・★埋めない）', async () => {
    state.tables['race_entries_public'] = entries(8, (i) => (i === 7 ? { weight: null } : {}));
    await expect(loadRealRace(RACE_ID)).rejects.toThrow(/斤量/);
  });
});

/**
 * 🔴 ★**③ 番人（D-059）が鳴いたら ★止まる**（★裁定 Q-RACE-10 §9・★機械で確かめる）。
 *   ★実データでは ★境界時刻も同じ記録から作るので ★食い違いは起きません（★手で開いても鳴らない）。
 *   → ★**境界時刻をずらした入力**で ★番人が鳴き、★画面の道が ★「出せません」に落ちることを見ます。
 *   ★画面（`/race`）も ★この 3 つの部品（`settledResultOf` / `assertReplayOrder` / `replayStopMessage`）を通ります（★下の最後の検査）。
 */
describe('🔴 ③ 番人が鳴いたら止まる', () => {
  const STRATEGIES = ['nige', 'senko', 'sashi', 'oikomi'] as const;
  const runners = Array.from({ length: 8 }, (_, i) => ({
    gate: i + 1, finishPosition: i + 1, finishSec: 95 + i * 0.3,
    strategy: STRATEGIES[i % 4] ?? 'senko',
  }));
  const result = settledResultOf(runners, 1600);
  const strategyOf = (g: number): 'nige' | 'senko' | 'sashi' | 'oikomi' => runners[g - 1]!.strategy;

  it('✅ ★対照: 記録どおりの境界時刻は ★番人を通る', () => {
    const boundaries = replayOf(result, strategyOf, 'middle');
    expect(() => assertReplayOrder(result, boundaries)).not.toThrow();
    /** ★着順・馬番・タイムは ★記録のまま（★作っていない） */
    expect(result.order.map((r) => r.horseId)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(result.order[0]!.timeSec).toBe(95);
  });

  it('🔴 ★1 着と 2 着の境界時刻を入れ替えると ★番人が鳴き、★「出せません」の文になる', () => {
    const boundaries = replayOf(result, strategyOf, 'middle');
    const shifted = boundaries.map((b) => (b.gate === 1 ? { ...b, finishSec: boundaries[1]!.finishSec + 0.5 } : b));
    let caught: unknown;
    try { assertReplayOrder(result, shifted); } catch (e) { caught = e; }
    expect(caught, '🔴 ★番人が鳴きません（★ずらした境界を通しています）').toBeInstanceOf(ReplayOrderMismatchError);
    const text = replayStopMessage(caught);
    expect(text).toMatch(/^この中継は出せません（映像の着順が確定した着順と合いませんでした）/);
    /** ★番人以外の失敗も ★「出せません」で止める（★見本に落とさない） */
    expect(replayStopMessage(new Error('走路を組めません'))).toBe('この中継は出せません: 走路を組めません');
  });

  it('🔴 ★画面の道: 実レースの失敗は ★replayStopMessage を出して止め、★見本に落とさない', () => {
    const src = readFileSync(path.resolve(__dirname, '../../web/src/app/race/page.tsx'), 'utf8');
    expect(src, '★画面が 番人の部品を通っていない').toContain('assertReplayOrder(result, boundaries);');
    expect(src, '★画面が 実レースの着順を 読む層の部品で組んでいない').toContain(': settledResultOf(real.runners, DIST);');
    const m = src.match(/if \(real !== null\) \{\s*const stop = replayStopMessage\(e\);[\s\S]*?\n\s*\} else \{/);
    expect(m, '🔴 ★実レースの失敗を ★`replayStopMessage` で止めていない').not.toBeNull();
    expect(m![0], '🔴 ★止めたあと ★映像を消していない（★古い映像や見本が残る）').toContain('setBuilt(null);');
    expect(m![0], '🔴 ★止めた文を ★画面に出していない').toContain('setErr(stop);');
    expect(/build\(setup, seed, ownGate, surface, trackCondition,[^;]*\breal\)/.test(src),
      '🔴 ★`build()` に実レースを渡していない（★見本で組んでしまう）').toBe(true);
  });
});

/**
 * 🔴 ⑥ ★**入口を作らない**（★裁定 Q-RACE-6 の条件・D-122「空の店に客を送らない」）。
 *   ★録画へのリンクは ★**自分の馬の記録からだけ**張ります。★いまは ★どこにも張っていません（★`ALLOWED` は空）。
 *   ★張るときは ★自分の馬の記録の画面だけを ★`ALLOWED` に足すこと（★他人のレースの一覧を足さない）。
 */
describe('🔴 ⑥ 録画への入口', () => {
  const ROOT = path.resolve(__dirname, '../..');
  /**
   * ★2026-09-27（裁定 Q-RACE-10）: ★`/records` の出走の行（★`my_runs` ＝ 自分の馬の確定した出走だけ）を足しました。
   *   ⚠️ ★他人のレースの一覧（★番組表・結果一覧）は ★足さないこと。
   */
  /**
   * ★2026-09-28（★オーナー許可・小窓でパドックからリプレイまで）: ★帯が本編を iframe で開く URL の ★出どころ 1 つを足しました。
   *   ★リンク（★人を送る入口）ではなく ★帯の中で流すだけ。★自分の馬が出ていないレースも ★「あなたの馬」を描かずに開けるようになった
   *   （★網 `race-own-optional.test.ts`）ので ★「空の店に客を送る」にはなりません。★帯は ★`stripEmbedUrl` だけを使う（★網 `race-strip-embed.test.ts`）。
   */
  const ALLOWED: readonly string[] = ['web/src/app/records/records-view.tsx', 'web/src/components/uma/race-strip-embed.ts'];
  /** ★`/race?race=` と ★`/race?…&race=` を捕まえる（★`?venue=` や `/races` は捕まえない） */
  const LINK = /\/race\?(?:[^'"`\s]*&)?race=/;

  it('★網が空振りしていない（★対照）', () => {
    expect(LINK.test('href={`/race?race=${id}`}')).toBe(true);
    expect(LINK.test("router.push('/race?return=/home&race=' + id)")).toBe(true);
    expect(LINK.test('href="/race?venue=sakura"'), '★鞍の口を捕まえない').toBe(false);
    expect(LINK.test('href="/races?race=1"'), '★番組表を捕まえない').toBe(false);
  });

  it('🔴 ★許した画面の外に `/race?race=` のリンクが無い', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.(tsx?|mjs)$/.test(e.name)) files.push(rel);
      }
    };
    walk('web/src');
    expect(files.length, '★走査が空振り').toBeGreaterThan(50);
    const hits = files.filter((f) => !ALLOWED.includes(f) && LINK.test(readFileSync(path.join(ROOT, f), 'utf8')));
    expect(hits, '🔴 ★録画への入口が ★許した画面の外にあります（★自分の馬の記録からだけ張る・裁定 Q-RACE-6）').toEqual([]);
  });

  /** ★許した画面は ★本当に入口を持ち、★出口（`?return=`）を名簿に載せている（★D-122 入口を作ったら出口も） */
  it('★許した画面に入口が在り、戻り先が名簿に在る', () => {
    for (const f of ALLOWED) {
      expect(LINK.test(readFileSync(path.join(ROOT, f), 'utf8')), `★${f} に入口が無い（★許可だけ残っている）`).toBe(true);
    }
    const records = readFileSync(path.join(ROOT, 'web/src/app/records/records-view.tsx'), 'utf8');
    expect(records, '★入口が `my_runs` の行（`r.raceId`）から張られていない').toContain('/race?race=${encodeURIComponent(r.raceId)}&return=/records');
    const race = readFileSync(path.join(ROOT, 'web/src/app/race/page.tsx'), 'utf8');
    expect(race, '★出口の名簿に `/records` が無い（★記録へ戻れない）').toContain("'/records': '記録へ戻る',");
  });
});
