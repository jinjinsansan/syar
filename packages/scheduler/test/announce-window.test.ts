/**
 * ★**告知をどこまで先に出すか**（★**DS-5 ②**・2026-09-19・オーナー決定）
 *
 * 【★見ている壊れ方】
 *   ① ★G1 の窓が延びていない（★「今度の G1 に合わせて仕上げる」が成立しない）
 *   ② ★G2・G3・重賞以外まで延びた（★「出走馬もオッズも無いレース」が画面に大量に並ぶ）
 *   ③ ★窓の長さが **2 か所**にある（★D-052）
 *   ④ ★告知が**飛ぶ**（★近い側を返し忘れて、12 分前に存在しないレースができる）
 *   ⑤ ★遠い先の G1 を **組成しようとする**（★締切前に出走表を締めてしまう）
 *   ⑥ ★時刻が進んでも同じ番号が返り続ける／番号が重複する（★A-2）
 */
import { describe, expect, it } from 'vitest';
import {
  ANNOUNCE_AHEAD_BY_GRADE,
  ANNOUNCE_AHEAD_RACES,
  CYCLES_PER_WEEK,
  CYCLE_MS,
  LOOKAHEAD_RACES,
  WEEK_MS,
  announceAheadFor,
  cycleStartMs,
  entryDeadlineMs,
  gradeOf,
  racesToAnnounce,
} from '../src/index.js';

const EPOCH = 1_700_000_000_000;
/** ★サイクル `i` の途中の時刻（★境目ちょうどを避ける） */
const at = (i: number): number => cycleStartMs(i, EPOCH) + 1000;

/** ★最初に見つかる、その格のサイクル番号 */
function firstCycleOfGrade(grade: 'G1' | 'G2' | 'G3', from = 0): number {
  for (let i = from; i < from + 20_000; i += 1) if (gradeOf(i) === grade) return i;
  throw new Error(`${grade} のサイクルが 20,000 本 探しても見つかりません`);
}

describe('DS-5 ② 重賞だけ告知を先に出す', () => {
  it('★前提: ★G1・G2・G3 が実在する（★0 件を「該当なし」と読まない・R-21）', () => {
    for (const g of ['G1', 'G2', 'G3'] as const) {
      expect(typeof firstCycleOfGrade(g), `${g} が番組表に無い`).toBe('number');
    }
  });

  it('① ★★G1 の窓は 1 ゲーム内週（★4 時間）', () => {
    expect(ANNOUNCE_AHEAD_BY_GRADE.G1).toBe(CYCLES_PER_WEEK);
    /** ★実時間でも 4 時間ちょうど（★数で書いていないことの確認） */
    expect(ANNOUNCE_AHEAD_BY_GRADE.G1 * CYCLE_MS).toBe(WEEK_MS);
    expect(WEEK_MS).toBe(4 * 60 * 60 * 1000);
  });

  it('② ✅ ★G2 は 1 週の半分・G3 は 4 分の 1（★2026-09-20 オーナー決定・案 1）', () => {
    /**
     * 🔴 ★**数で書かないこと**を見ます（★`20` / `10` と直接 書いたら、
     *   ★`CYCLES_PER_WEEK` が動いた日に意味が変わります）。
     * ⚠️ ★旧は「G2・G3 は 12 分のまま（狭いほうへ倒す・R-27）」でした。
     *   ★照会に出して**決まった**ので延ばしました。★倒していた判断自体は正しかったです。
     */
    expect(ANNOUNCE_AHEAD_BY_GRADE.G2).toBe(CYCLES_PER_WEEK / 2);
    expect(ANNOUNCE_AHEAD_BY_GRADE.G3).toBe(CYCLES_PER_WEEK / 4);
    /** ★実時間: ★G2 = 2 時間 ／ G3 = 1 時間 */
    expect(ANNOUNCE_AHEAD_BY_GRADE.G2 * CYCLE_MS).toBe(WEEK_MS / 2);
    expect(ANNOUNCE_AHEAD_BY_GRADE.G3 * CYCLE_MS).toBe(WEEK_MS / 4);
    expect(ANNOUNCE_AHEAD_BY_GRADE.G2 * CYCLE_MS).toBe(2 * 60 * 60 * 1000);
    expect(ANNOUNCE_AHEAD_BY_GRADE.G3 * CYCLE_MS).toBe(1 * 60 * 60 * 1000);
    /** ★重賞以外は**据え置き**（★延ばしたのは重賞だけ・★対照） */
    let plainC = -1;
    for (let i = 0; i < 1000; i += 1) if (gradeOf(i) === null) { plainC = i; break; }
    expect(plainC, '★重賞でないサイクルが無い').toBeGreaterThan(-1);
    expect(announceAheadFor(plainC)).toBe(ANNOUNCE_AHEAD_RACES);
    expect((ANNOUNCE_AHEAD_RACES - LOOKAHEAD_RACES) * CYCLE_MS).toBe(12 * 60 * 1000);
  });

  it('🔴 ★D-111 ③⑥: ★**告知だけで組成前**の窓が、★格ごとにどれだけ在るか', async () => {
    /**
     * 🔴 ★レビュー側の条件: ★「★延ばすと `D-111 ③⑥`（取消と返金）が G2/G3 でも
     *   ★**常用の経路**になる。★その経路が本当に動くかを検査で示せ」。
     *
     * ⚠️ 🔴 ★**調べた結果、★言い方を 1 つ直します**:
     *   ✔ ★取消の経路（`cycle-runner.ts:356` / `:372`）には ★**格の条件が 1 つもありません**。
     *     ★`UnfrozenRaceError` / `InvalidFrozenCourseError` / `overdueRaces` で動きます。
     *   ✔ ★`announced` のレースを取消せることは ★**既に検査が在ります**
     *     （`apps/worker/test/cancel-accepts-announced.test.ts`・★実物の SQL を見る形）。
     *   → ★★**「新しく通る道」ではありません。★道は同じです。**
     *   → ★★**新しいのは「その道に乗りうる時間」**です。★そこを数で留めます。
     *
     * ★**告知だけで組成前の窓** ＝ `announceAheadFor(g) − LOOKAHEAD_RACES`:
     *   ★G1 38 サイクル ／ ★G2 **18** ／ ★G3 **8** ／ ★重賞以外 2
     *   ⚠️ ★延ばす前は ★**G2・G3 とも 2** でした → ★**G2 は 9 倍、G3 は 4 倍**。
     */
    for (const g of ['G1', 'G2', 'G3'] as const) {
      const onlyAnnounced = ANNOUNCE_AHEAD_BY_GRADE[g] - LOOKAHEAD_RACES;
      expect(onlyAnnounced, `★${g} に「告知だけ」の窓が無い`).toBeGreaterThan(0);
    }
    expect(ANNOUNCE_AHEAD_BY_GRADE.G2 - LOOKAHEAD_RACES).toBe(18);
    expect(ANNOUNCE_AHEAD_BY_GRADE.G3 - LOOKAHEAD_RACES).toBe(8);
    /** ★重賞以外は据え置きの 2（★対照） */
    expect(ANNOUNCE_AHEAD_RACES - LOOKAHEAD_RACES).toBe(2);

    /** 🔴 ★取消の経路に**格の条件が無い**ことを、★製品の文面で見る（★FK-6） */
    const { readFileSync } = await import('node:fs');
    const { default: nodePath } = await import('node:path');
    const root = nodePath.resolve(__dirname, '../../..');
    const runner = readFileSync(nodePath.join(root, 'apps/worker/src/cycle-runner.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    /**
     * 🔴 ★**番人**（★**CK-3 / CK-4**）: ★切り出しが空だと、★否定の表明は**素通しで緑**になります。
     *   ★`indexOf` が −1 を返したら、★`slice` は別の場所を切り出します。
     */
    const cancelAt = runner.indexOf('cancelRace(idx)');
    expect(cancelAt, '★取消の呼び出しが見つかりません').toBeGreaterThan(-1);
    const cancelPart = runner.slice(Math.max(0, cancelAt - 800), cancelAt + 400);
    expect(cancelPart.length, '★切り出しが空です').toBeGreaterThan(0);
    expect(cancelPart, '🔴 ★取消の経路に格の条件が入っています').not.toMatch(/gradeOf|G1|G2|G3/);
  });

  it('🔴 ★割り切れなければ落ちる（★黙って切り捨てない・AL-9）', async () => {
    /**
     * 🔴 ★`CYCLES_PER_WEEK` は D-007 で動いてきました（★10 分 → 3 分 → 6 分）。
     *   ★4 の倍数でない日に ★**黙って切り捨てられると、★誰も気づきません**。
     * ⚠️ ★ここでは**式そのもの**を見ます（★実装が割り切れを見ているか）。
     */
    expect(CYCLES_PER_WEEK % 4, '★いまの CYCLES_PER_WEEK が 4 で割り切れない').toBe(0);
    const { readFileSync } = await import('node:fs');
    const { default: nodePath } = await import('node:path');
    const src = readFileSync(
      nodePath.join(nodePath.resolve(__dirname, '..'), 'src/announce-window.ts'), 'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(src, '★割り切れの検査が無い').toMatch(/CYCLES_PER_WEEK % denominator !== 0/);
    expect(src, '★投げていない').toMatch(/throw new Error/);
    /** 🔴 ★数を直接 書いていないこと（★`G2: 20` のような形が戻っていない） */
    expect(src, '🔴 ★G2 に数が直接 書かれています').not.toMatch(/G2:\s*\d/);
    expect(src, '🔴 ★G3 に数が直接 書かれています').not.toMatch(/G3:\s*\d/);
  });

  it('★`announceAheadFor` が格で分かれる（★対照つき）', () => {
    expect(announceAheadFor(firstCycleOfGrade('G1'))).toBe(CYCLES_PER_WEEK);
    expect(announceAheadFor(firstCycleOfGrade('G2'))).toBe(CYCLES_PER_WEEK / 2);
    expect(announceAheadFor(firstCycleOfGrade('G3'))).toBe(CYCLES_PER_WEEK / 4);
    /** ★重賞でないサイクルを 1 本 探して、既定であること */
    let plain = -1;
    for (let i = 0; i < 1000; i += 1) if (gradeOf(i) === null) { plain = i; break; }
    expect(plain, '★重賞でないサイクルが 1,000 本 探しても無い').toBeGreaterThan(-1);
    expect(announceAheadFor(plain)).toBe(ANNOUNCE_AHEAD_RACES);
  });

  it('④ ★★近い 4 本は必ず入る（★告知が飛ばない）', () => {
    for (const now of [0, 37, 1234]) {
      const out = racesToAnnounce(at(now), EPOCH);
      for (let i = 1; i <= ANNOUNCE_AHEAD_RACES; i += 1) {
        expect(out, `★now=${now}: ${i} 本先が抜けている`).toContain(now + i);
      }
    }
  });

  it('⑥ ★番号が重複しない／昇順（★A-2 の前提）', () => {
    for (const now of [0, 37, 1234, 99_999]) {
      const out = racesToAnnounce(at(now), EPOCH);
      expect(new Set(out).size, `★now=${now}: 重複がある`).toBe(out.length);
      expect([...out].sort((a, b) => a - b), `★now=${now}: 昇順でない`).toEqual(out);
      /** ★自分より先だけ（★過ぎたレースを告知しない） */
      expect(Math.min(...out)).toBeGreaterThan(now);
    }
  });

  it('★同じ時刻からは必ず同じ答え（★再起動しても変わらない）', () => {
    const t = at(500);
    expect(racesToAnnounce(t, EPOCH)).toEqual(racesToAnnounce(t, EPOCH));
    /** ★サイクルの途中のどこで呼んでも同じ */
    expect(racesToAnnounce(cycleStartMs(500, EPOCH), EPOCH))
      .toEqual(racesToAnnounce(cycleStartMs(500, EPOCH) + CYCLE_MS - 1, EPOCH));
  });

  it('① ★★G1 は、その 40 サイクル前から返り始める（★境界の両側・R-2）', () => {
    const g1 = firstCycleOfGrade('G1', 100);
    /** ★40 本 前 → 入る */
    expect(racesToAnnounce(at(g1 - CYCLES_PER_WEEK), EPOCH), '★40 本前に入っていない').toContain(g1);
    /** ★41 本 前 → まだ入らない（★境界の外側） */
    expect(racesToAnnounce(at(g1 - CYCLES_PER_WEEK - 1), EPOCH), '★41 本前から入っている').not.toContain(g1);
    /** ★直前 → まだ入っている（★間で消えない） */
    expect(racesToAnnounce(at(g1 - 1), EPOCH), '★直前で消えた').toContain(g1);
  });

  it('② ✅ ★G3 は 10 本前から返り、★11 本前には返らない（★境界）', () => {
    /**
     * ⚠️ ★旧は「5 本前には**まだ**返らない（延びていないことの対照）」でした。
     *   ★延ばしたので、★**境界が動いた**ことをここで留めます。
     */
    const g3 = firstCycleOfGrade('G3', 100);
    const w = CYCLES_PER_WEEK / 4;
    expect(racesToAnnounce(at(g3 - w), EPOCH), '★10 本前で入っていない').toContain(g3);
    expect(racesToAnnounce(at(g3 - w - 1), EPOCH), '★11 本前から入っている').not.toContain(g3);
    /** ★直前まで消えない */
    expect(racesToAnnounce(at(g3 - 1), EPOCH), '★直前で消えた').toContain(g3);
  });

  it('② ✅ ★G2 は 20 本前から返り、★21 本前には返らない（★境界）', () => {
    const g2 = firstCycleOfGrade('G2', 100);
    const w = CYCLES_PER_WEEK / 2;
    expect(racesToAnnounce(at(g2 - w), EPOCH), '★20 本前で入っていない').toContain(g2);
    expect(racesToAnnounce(at(g2 - w - 1), EPOCH), '★21 本前から入っている').not.toContain(g2);
  });

  it('★★並ぶ本数が増えすぎない（★「出走馬もオッズも無いレース」が画面に何本 並ぶか）', () => {
    /**
     * ⚠️ ★DS-5 の ②③ に付いていた但し書きが、ここです。
     *   ★1,000 周 まわして、★1 周あたりに返る本数の最大を数えます。
     */
    let worst = 0;
    let five = 0;
    const N = 5_000;
    for (let i = 0; i < N; i += 1) {
      const n = racesToAnnounce(at(i), EPOCH).length;
      worst = Math.max(worst, n);
      if (n > ANNOUNCE_AHEAD_RACES) five += 1;
    }
    /**
     * ✔ ★**実測（2026-09-20・20,000 サイクル・★G2/G3 を延ばした後）**:
     *   ★**最大 6 本**（★4 本 45.4% ／ 5 本 47.4% ／ ★**6 本 7.1%**）。
     *
     * ⚠️ 🔴 ★**延ばした代償が、ここに出ています。**
     *   ★延ばす前（★2026-09-19・G2/G3 が 12 分だった頃）は
     *   ★**最大 5 本**（★4 本 93.5% ／ 5 本 6.5%）でした。
     *   → ★★**「出走馬もオッズも無いレース」が画面に並ぶ本数が、★ほぼ倍になりました。**
     *   → ★★**これは欠陥ではなく、★オーナー決定（案 1）の代償**です。★数として残します。
     *
     * 🔴 ★実測の **6** で押さえます（★緩い上限は「通るだけの検査」です・R-16）。
     */
    expect(worst, `★1 周に ${worst} 本 並びます（★延ばした後の実測は 6 本）`)
      .toBe(ANNOUNCE_AHEAD_RACES + 2);
    expect(five / N, '★4 本より多い周が増えすぎています').toBeLessThan(0.60);
    expect(five, '★対照: 5 本の周が 1 つも無い（★G1 の窓が効いていない）').toBeGreaterThan(0);
  });

  it('⑤ ★★遠い先の G1 は、まだ組成できない（★締切が先にある）', () => {
    /**
     * 🔴 ★告知を延ばしても、★**締切は動きません**（`entryDeadlineMs` ＝ `cycleStart(N − 2)`）。
     *    ★`cycle-runner` は `nowMs < entryDeadlineMs(idx)` の間 飛ばすので、
     *    ★遠い先の G1 を掴んで出走表を締めることはありません。
     */
    const g1 = firstCycleOfGrade('G1', 100);
    const announcedAt = at(g1 - CYCLES_PER_WEEK);
    expect(racesToAnnounce(announcedAt, EPOCH)).toContain(g1);
    expect(announcedAt, '🔴 ★告知した時点で、もう締切を過ぎている').toBeLessThan(entryDeadlineMs(g1, EPOCH));
    /** ★登録できる長さ ＝ 38 サイクル ＝ 3 時間 48 分 */
    const window = entryDeadlineMs(g1, EPOCH) - cycleStartMs(g1 - CYCLES_PER_WEEK, EPOCH);
    expect(window).toBe((CYCLES_PER_WEEK - LOOKAHEAD_RACES) * CYCLE_MS);
    expect(window).toBe((3 * 60 + 48) * 60 * 1000);
  });

  it('③ ★★窓の長さを持つのは 1 か所だけ（★D-052）', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '../../..');
    /** ★`cycle.ts` に写しを置いていない */
    const cycle = readFileSync(path.join(root, 'packages/scheduler/src/cycle.ts'), 'utf8');
    expect(cycle, '🔴 ★`cycle.ts` に `racesToAnnounce` の写しが戻っている')
      .not.toMatch(/export function racesToAnnounce/);
    /** ★SQL にも画面にも窓の長さを書いていない */
    const win = readFileSync(path.join(root, 'packages/scheduler/src/announce-window.ts'), 'utf8');
    expect(win, '★G1 の窓を数で書いている（★`CYCLES_PER_WEEK` から引くこと）')
      .toMatch(/G1: CYCLES_PER_WEEK/);
    expect(win, '★4 時間をミリ秒で書いている').not.toMatch(/G1:\s*\d/);
  });
});
