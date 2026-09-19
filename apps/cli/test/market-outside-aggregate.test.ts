/**
 * ★**日次集計が落ちた日に、一緒に止まる枝を作らない**（★**T11-1 ④** ＋ その掃き出し・2026-09-19）
 *
 * 【🔴 ★何が起きていたか】
 *   ★`refreshMarketListings` は `if (today !== lastAggregated)` の**中**にあり、
 *   ★`lastAggregated = today` は `aggregateDay` の**後ろ**に置かれていました。
 *   ★`runDailyStep` は失敗を**投げ直す**ので、★`aggregateDay` が落ちた日は
 *   ★★**出品の更新まで一度も到達しません**。
 *   ✔ ★実測（DL-1・2026-09-19）: ★`point_flow_daily` は **1 か月 0 行**。
 *     → ★★その 1 か月、★**店は一度も開いていなかった**ことになります。
 *   ⚠️ ★「開店初日に 1 頭も買えない」は ★**初日だけの話ではありませんでした**。
 *
 * 【🔴 ★1 か所 直して終わりにしない】
 *   ★出品を外へ出した便で、★**まったく同じ形が 1 つ残っていました**（★レビュー側が数えました）:
 *   ★`syncStableGradePrices` も枠の中（深さ 2）で、★しかも ★**`runDailyStep` に包まれておらず**、
 *   ★理由が標準出力にしか残りませんでした（★**DL-2 が塞いだはずの穴**）。
 *   → ★**この検査は「枝の一覧」で見ます**。★新しい枝が増えたら、★ここに載るまで通れません。
 *
 * 【★見ている壊れ方】
 *   ① ★枝が、また日次集計の枠の中へ戻る
 *   ② ★日付を他の枝と**共有**する（★共有した相手が落ちたら、こちらも止まる）
 *   ③ ★日付を引けなかった周に、★**空の日付**で走らせる
 *   ④ ★毎周やる（★DB を無駄に叩く）／★`runDailyStep` に包み忘れる（★理由が DB に残らない）
 *   ⑤ ★日付を引く問い合わせが `try` の外に出る（★DB が一瞬落ちるとワーカーが死ぬ）
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { blockBodyAfter, isInOwnTry, stripComments } from './lib/ts-blocks.js';

const ROOT = path.resolve(__dirname, '../../..');
/** ★註記に書いた語で緑にしない（★註記には `lastAggregated` も枝の名前も出てくる） */
const MAIN = stripComments(readFileSync(path.join(ROOT, 'apps/worker/src/main.ts'), 'utf8'));
/** ★日次集計の枠の**中身**（★波括弧で切り出す・CK-7） */
const DAILY = blockBodyAfter(MAIN, 'today !== lastAggregated');

/**
 * ★**日次集計とは独立に動くべき枝**（★全数）。
 * ⚠️ ★枝を増やしたら、★ここに 1 行 足すこと。
 */
const INDEPENDENT = [
  { name: '出品の更新', call: 'refreshMarketListings(client', day: 'lastMarketDay', step: "'market'" },
  { name: '厩舎の格の値段', call: 'syncStableGradePrices(client', day: 'lastGradePriceDay', step: "'grade'" },
] as const;

/** ★**日次集計の枠の中に残ってよい枝**（★対照。★これが空になったら切り出しが壊れている） */
const INSIDE = ['aggregateDay(', 'recordUnlockDistribution(', 'recordStoryRows('] as const;

describe('★T11-1 ④ 日次集計が落ちても止まらない枝', () => {
  it('★切り出しが成立している（★0 件を「該当なし」と読まない・R-21）', () => {
    expect(DAILY.length, '★日次の枠の中身が空').toBeGreaterThan(200);
    for (const n of INSIDE) {
      expect(DAILY, `★対照: ${n} は日次の枠の中にあるはず（★切り出しが壊れている）`).toContain(n);
    }
    expect(INDEPENDENT.length).toBeGreaterThan(1);
  });

  for (const b of INDEPENDENT) {
    describe(`★${b.name}`, () => {
      it('① ★★日次集計の枠の**外**にある', () => {
        expect(MAIN, `★${b.call} の呼び出しが無い`).toContain(b.call);
        expect(DAILY, `🔴 ★${b.name}が日次集計の枠の中に戻っている（★aggregate が落ちると止まる）`)
          .not.toContain(b.call);
      });

      it('② ★★自分の日付を持っている（★他の枝と共有していない）', () => {
        expect(MAIN, `★${b.day} が無い`).toMatch(new RegExp(`let\\s+${b.day}\\s*=\\s*''`));
        /** ★その枝のブロックの中身に、他の枝の日付が出てこない */
        const own = blockBodyAfter(MAIN, `today !== ${b.day}`);
        for (const other of ['lastAggregated', ...INDEPENDENT.map((x) => x.day)]) {
          if (other === b.day) continue;
          expect(own, `🔴 ★${b.name}が ${other} を見ている（★共有すると一緒に止まる）`)
            .not.toContain(other);
        }
      });

      it('③ ★★日付を引けなかった周は走らせない（★空の日付で走らない）', () => {
        /**
         * 🔴 ★`today` は引けなければ `''` のままです。
         *    ★`${b.day}` が実日付なら `'' !== '2026-09-19'` は**真**になり、
         *    ★**空の日付で走ります**。★だから `dayIdx !== null` で守ります。
         */
        expect(MAIN).toMatch(new RegExp(`dayIdx\\s*!==\\s*null\\s*&&\\s*today\\s*!==\\s*${b.day}`));
      });

      it('④ ★1 日 1 回のまま ＋ `runDailyStep` に包まれている（★理由が DB に残る・DL-2）', () => {
        /** ★呼ぶ前に必ず日付を書き換えている */
        expect(MAIN).toMatch(new RegExp(`today\\s*!==\\s*${b.day}\\s*\\)\\s*\\{\\s*${b.day}\\s*=\\s*today;`));
        const own = blockBodyAfter(MAIN, `today !== ${b.day}`);
        expect(own, `🔴 ★${b.name}が runDailyStep に包まれていない（★落ちた理由が標準出力にしか残らない）`)
          .toContain('runDailyStep(');
        expect(own, '★枝の名前を渡していない').toContain(b.step);
        /** ★新しいタイマー・新しい常駐を作っていない */
        expect(MAIN).not.toMatch(/setInterval/);
      });

      it('★落ちても周を止めない（★自分専用の try/catch・A-1）', () => {
        expect(isInOwnTry(MAIN, b.call), `🔴 ★${b.name}が自分専用の try/catch に入っていない`).toBe(true);
      });
    });
  }

  it('⑤ ★★日付を引く問い合わせが `try` の外に出ていない（★DB が落ちてもワーカーが死なない）', () => {
    /**
     * ★この時刻取得は ★**周のループ本体の直下**にあります。
     *   ★裸で置くと投げた瞬間に `while` を突き抜けます（★A-1 が壊れる）。
     */
    const q = 'extract(epoch from now()) * 1000';
    expect(MAIN, '★時刻の問い合わせが見つからない').toContain(q);
    expect(isInOwnTry(MAIN, q), '🔴 ★時刻の問い合わせが try/catch の外にある').toBe(true);
    /** ★見送ったことが読める（★黙って飛ばさない） */
    expect(MAIN).toContain('日次の日付を引けませんでした');
  });

  it('🔴 ★枝を増やしたら、この簿に載るまで通れない（★全数分類）', () => {
    /**
     * ★`runDailyStep(` に渡している枝の名前を ★**機械に数えさせます**（★手で数えない）。
     *   ✔ ★2026-09-19、私が手で数えて 1 つ落とし、★レビュー側が数えて見つけました。
     */
    const steps = [...MAIN.matchAll(/runDailyStep\(\s*[\s\S]{0,80}?,\s*('[a-z-]+')/g)].map((m) => m[1]!);
    expect(steps.length, '★runDailyStep の呼び出しが拾えていない（R-21）').toBeGreaterThan(3);
    const known = new Set<string>([
      "'aggregate'", "'unlock'", "'story'",            // ★枠の中に残る枝
      ...INDEPENDENT.map((b) => b.step),               // ★外へ出した枝
    ]);
    for (const s of steps) {
      expect(known.has(s), `🔴 ★枝 ${s} が簿にありません（★外に出すべきか判断してから載せること）`).toBe(true);
    }
    /** ★外へ出した枝は、★本当に `runDailyStep` に渡されている */
    for (const b of INDEPENDENT) expect(steps, `★${b.name}の枝名が拾えていない`).toContain(b.step);
  });
});
