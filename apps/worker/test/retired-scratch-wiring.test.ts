/**
 * ★**登録の後に引退した馬を、組成の前に取消にする**（★**D-111 ③**・★**DS-5 ③**・2026-09-19）
 *
 * 【🔴 ★何が起きていたか — ★D-111 ③ は一度も動いていませんでした】
 *   ★引退を見ていたのは ★**`entry-freeze.ts` の 1 か所だけ**。★その掃き出しの `where` は
 *   ★`e.entrant_snapshot is null` **かつ** `r.status = 'scheduled'`。
 *   ★登録された馬は ★**2 つの理由で、両方の時点で外れます**:
 *     ★**組成の前** … `status` は `'announced'` ≠ `'scheduled'` → 外れる
 *     ★**組成の後** … `fillRace` が `entrant_snapshot` を書く → 外れる
 *   → ★★**掛かる瞬間が存在しません。**
 *   ✔ ★実 DB で確かめました（`tools/verify-ds5-retire-scratch.mjs --env staging`）:
 *     ★④ 0 件 ／ ★⑥ 0 件 ／ ★**⑦ 対照 1 件**（★`where` 自体は生きている）。
 *
 * 【⚠️ ★DS-5 ② で常態になりました】
 *   ★G1 の登録の窓は **3 時間 48 分 ＝ 1 ゲーム内週の 95%**（★12 分のときは 10%）。
 *
 * 【★見ている壊れ方】
 *   ① ★取消が ★**組成より後**に動く（★1 頭 少ないまま走る。★NPC が埋められない）
 *   ② ★取消が ★**抽選より後**に動く（★走らない馬が 1 枠 使い、★走れる馬を落とす）
 *   ③ ★取消と返金が ★**`scratch.ts` を通らない**（★2 通りの取消ができる・D-052）
 *   ④ ★取消のあと、★その馬が ★**まだ「必ず入れる馬」に残っている**
 *   ⑤ ★黙って落とす（★本人に理由が届かない・D-111 ⑤）
 *   ⑥ 🔴 ★**`entry-freeze` を触って「直した」つもりになる**（★直す場所はそこではない）
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { blockBodyAfter, functionBodyAfter, isInOwnTry, stripComments } from '../../cli/test/lib/ts-blocks.js';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string): string => stripComments(readFileSync(path.join(ROOT, rel), 'utf8'));
const MAIN = read('apps/worker/src/main.ts');
const SCRATCH = read('apps/worker/src/scratch.ts');
const FREEZE = read('apps/worker/src/entry-freeze.ts');

describe('DS-5 ③ 引退した登録馬を、組成の前に取消にする', () => {
  it('★切り出しが成立している（R-21）', () => {
    expect(MAIN.length).toBeGreaterThan(2_000);
    expect(SCRATCH, '★`scratchRetiredEntries` が無い').toContain('export async function scratchRetiredEntries');
  });

  it('🔴 ★★ワーカーが本当に呼んでいる（★作っただけで終わらせない・LR-9）', () => {
    expect(MAIN, '★`scratchRetiredEntries` を呼んでいない').toContain('scratchRetiredEntries(client');
  });

  it('② ★★抽選より**前**に動く（★走らない馬が枠を使わない）', () => {
    const scratchAt = MAIN.indexOf('scratchRetiredEntries(client');
    const lotteryAt = MAIN.indexOf('drawEntryLottery(');
    expect(scratchAt, '★取消の呼び出しが無い').toBeGreaterThan(0);
    expect(lotteryAt, '★抽選の呼び出しが無い').toBeGreaterThan(0);
    expect(scratchAt, '🔴 ★取消が抽選より後にある（★走らない馬が 1 枠 使う）').toBeLessThan(lotteryAt);
  });

  it('① ★★組成より**前**に動く（★空いた枠は NPC が埋める・§10.4）', () => {
    const scratchAt = MAIN.indexOf('scratchRetiredEntries(client');
    const buildAt = MAIN.indexOf('buildRace(pool');
    expect(buildAt, '★組成の呼び出しが無い').toBeGreaterThan(0);
    expect(scratchAt, '🔴 ★取消が組成より後にある（★1 頭 少ないまま走る）').toBeLessThan(buildAt);
  });

  it('★抽選に渡すのは、取消のあとの一覧（★引退した馬を渡していない）', () => {
    /**
     * 🔴 ★`drawEntryLottery(registered, …)` のままだと、★取消にしたのに
     *    ★**抽選には残った**ままになります（★`registered` は取消の前に読んだもの）。
     */
    expect(MAIN, '🔴 ★抽選に、取消の前の一覧を渡している')
      .not.toMatch(/drawEntryLottery\(\s*registered\s*,/);
    expect(MAIN).toMatch(/drawEntryLottery\(\s*registeredNow\s*,/);
  });

  it('③ ★★取消と返金は `scratch.ts` の 1 か所を通る（★2 通りの取消を作らない・D-052）', () => {
    /** ★`scratchRetiredEntries` は `scratchEntry` を呼ぶ（★自前で update / ledger を書かない） */
    const body = functionBodyAfter(SCRATCH, 'export async function scratchRetiredEntries');
    expect(body, '★`scratchEntry` を通していない').toContain('scratchEntry(');
    expect(body, '🔴 ★自前で取消の update を書いている').not.toMatch(/update race_entries set scratched_at/);
    expect(body, '🔴 ★自前で台帳に書いている').not.toContain('ep_ledger');
    expect(body, '🔴 ★自前で残高を動かしている').not.toMatch(/update users set entry_points/);
  });

  it('★★`entrant_snapshot` を見ない（★そこが欠陥の原因だった）', () => {
    const body = functionBodyAfter(SCRATCH, 'export async function scratchRetiredEntries');
    expect(body, '🔴 ★`entrant_snapshot` で絞ると、組成後の行をまた見落とす')
      .not.toContain('entrant_snapshot');
    /** ★見るのは「引退しているか」と「まだ取消でないか」だけ */
    expect(body).toContain('h.retired_at_week is not null');
    expect(body).toContain('e.scratched_at is null');
  });

  it('⑤ ★★黙って落とさない（★理由に引退の週が入る・D-111 ⑤）', () => {
    const body = functionBodyAfter(SCRATCH, 'export async function scratchRetiredEntries');
    expect(body, '★理由に週を入れていない').toMatch(/retired_at_week\}\s*週で引退/);
    /** ★ワーカー側も、取消が起きたことを黙らせない */
    expect(MAIN).toMatch(/登録の後に引退した.*頭を取消/);
    expect(MAIN, '★返した EP を言っていない').toMatch(/refundedEp\.toLocaleString/);
  });

  it('★落ちても周を止めない／取引の中で動く（★A-1・落選の返金と同じ形）', () => {
    expect(isInOwnTry(MAIN, 'scratchRetiredEntries(client'),
      '★`scratchRetiredEntries` が try/catch の中にない').toBe(true);
    const block = blockBodyAfter(MAIN, "ret = await scratchRetiredEntries");
    expect(MAIN, '★取引を張っていない').toMatch(/begin[\s\S]{0,400}?scratchRetiredEntries[\s\S]{0,200}?commit/);
    expect(block.length).toBeGreaterThanOrEqual(0);
  });

  /**
   * ★**CK-9**（★2026-09-19・レビュー側）: ★**意味は註記ではなく「名前」に入れます。**
   *   ★今日ずっと「註記は読まれない」を見てきました（★`horse-repo.ts:238` がまさにそれ）。
   *   ★**落ちたときも通ったときも、名前は必ず読まれます**（★`rows_written` を列にしたのと同じ形・DL-3）。
   */
  it('⑥ 🔴 欠陥の記録: entry-freeze は組成後の引退を拾えない（★これは正しい状態ではない・DS-5 ⑤ で直す）／ここを触って直したつもりにならない', () => {
    /**
     * 🔴 ★`entrant_snapshot is null` を外すと、★**毎周 全行を舐めます**。
     *    ★あの条件は「まだ凍結していない行を選ぶ」ためのもので、★欠陥ではありません。
     *    ★欠陥は「引退を見る場所が、そこ **しか** 無かった」ことでした。
     */
    expect(FREEZE, '🔴 ★`entrant_snapshot is null` を外している（★毎周 全行を舐める）')
      .toContain('e.entrant_snapshot is null');
    expect(FREEZE, '★`status = scheduled` の条件も残っている').toContain("r.status = 'scheduled'");
    /** ★引退の判定は `entry-freeze` にも残す（★凍結が要る経路では今も正しい） */
    expect(FREEZE).toContain('retired_at_week');
  });

  it('🔴 ★★実 DB の対が在る（★FK-5）', () => {
    const { existsSync } = require('node:fs') as typeof import('node:fs');
    const tool = 'tools/verify-ds5-retire-scratch.mjs';
    expect(existsSync(path.join(ROOT, tool)), `★${tool} が無い`).toBe(true);
    const src = readFileSync(path.join(ROOT, tool), 'utf8');
    expect(src, '★実 DB に繋いでいない').toContain("from 'pg'");
    expect(src, '★rollback していない').toContain('rollback');
    expect(src, '★`assertNotProduction` を呼んでいない').toContain('assertNotProduction');
    /** 🔴 ★**対照が在る**（★「0 件」の理由が 2 つあることを分ける） */
    expect(src, '★対照（組成していない行は拾える）が無い').toContain('sweepControl');
    /** ★道具の分類簿に載っている（R-24） */
    const reg = readFileSync(path.join(ROOT, 'tools/lib/classification.mjs'), 'utf8');
    expect(reg, '★分類簿に載っていない').toContain('verify-ds5-retire-scratch.mjs');
  });

  it('🔴 欠陥の記録: 組成 → 発走の 12 分はまだ塞がっていない（★DS-5 ④・塞いだのは 95% であって 100% ではない）', () => {
    /**
     * 🔴 ★この便が塞ぐのは ★**登録 → 組成**（★G1 なら 3 時間 48 分）だけです。
     *    ★**組成 → 発走（12 分）は残ります** — ★その馬は凍結を持っているので、
     *    ★掃き出しは相変わらず外します。★D-111 ④（D-056 の安全網）も
     *    ★**「凍結が無い」を見る**ので拾いません。
     * ⚠️ ★**実装は人を迎える前に**（★DS-5 ⑤）。★ここでは ★**忘れないように残す**だけです。
     */
    const src = readFileSync(path.join(ROOT, 'apps/worker/src/scratch.ts'), 'utf8');
    expect(src, '🔴 ★残る窓（DS-5 ④）が註記に無い — ★塞いだつもりになる').toContain('DS-5 ④');
    expect(src, '★残る窓が「組成 → 発走」だと書いていない').toMatch(/組成 → 発走/);
    expect(src, '★D-111 ④ が拾わないことを書いていない').toContain('D-111 ④');
    /** ★実 DB の道具にも、残る窓が出る */
    const tool = readFileSync(path.join(ROOT, 'tools/verify-ds5-retire-scratch.mjs'), 'utf8');
    expect(tool, '★道具が「まだ残る窓」を言っていない').toContain('DS-5 ④');
  });
});
