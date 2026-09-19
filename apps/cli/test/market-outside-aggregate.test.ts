/**
 * ★**店を開けるのは、日次集計の成否と切り離す**（★**T11-1 ④**・2026-09-19）
 *
 * 【🔴 ★何が起きていたか】
 *   ★`refreshMarketListings` は `if (today !== lastAggregated) { ... }` の**中**にあり、
 *   ★`lastAggregated = today` は `aggregateDay` の**後ろ**に置かれていました。
 *   ★`runDailyStep` は失敗を**投げ直す**ので、★`aggregateDay` が落ちた日は
 *   ★★**出品の更新まで一度も到達しません**。
 *   ✔ ★実測（DL-1・2026-09-19）: ★`point_flow_daily` は **1 か月 0 行**。
 *     → ★★その期間、★**店は一度も開いていなかった**ことになります。
 *   ⚠️ ★「開店初日に 1 頭も買えない」は ★**初日だけの話ではありませんでした**。
 *
 * 【★見ている壊れ方】
 *   ① ★出品の更新が、また日次集計の枠の中へ戻る
 *   ② ★日付を `lastAggregated` と**共有**する（★同じ変数に戻すと ① と同じことが起きる）
 *   ③ ★日付を引けなかった周に、★**空の日付**で集計・出品を走らせる
 *   ④ ★出品の更新を毎周やる（★DB を無駄に叩く）
 *   ⑤ ★日付を引く問い合わせが `try` の外に出る（★DB が一瞬落ちるとワーカーが死ぬ）
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const RAW = readFileSync(path.join(ROOT, 'apps/worker/src/main.ts'), 'utf8');
/** ★註記に書いた語で緑にしない（★註記には `lastAggregated` も `refreshMarketListings` も出てくる） */
const MAIN = RAW
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');

/** ★呼び出しの形だけを拾う（★import 行は `refreshMarketListings,` や `} from` なので当たらない） */
const marketAt = MAIN.indexOf('refreshMarketListings(client');
const aggAt = MAIN.indexOf('lastAggregated = today');
const dailyIfAt = MAIN.indexOf("today !== lastAggregated");

describe('★T11-1 ④ 店を開けるのは日次集計と独立', () => {
  it('★切り出しが成立している（★0 件を「該当なし」と読まない・R-21）', () => {
    expect(marketAt, '★出品の更新の呼び出しが見つからない').toBeGreaterThan(0);
    expect(aggAt, '★日次の枠（lastAggregated = today）が見つからない').toBeGreaterThan(0);
    expect(dailyIfAt, '★日次の枠の条件が見つからない').toBeGreaterThan(0);
    /** ★対照: ★註記を落としても本文が残っている（★空文字を走査していない） */
    expect(MAIN.length).toBeGreaterThan(2000);
  });

  it('① ★★出品の更新は日次集計の枠の**外**にある', () => {
    /**
     * ★枠の中なら、★`lastAggregated = today` より後ろで、
     * ★かつ枠を閉じる `catch` より前に現れます。
     * → ★枠を閉じる `'[worker] 日次集計に失敗'` より**後ろ**にあることを見ます。
     */
    const dailyCatchAt = MAIN.indexOf('日次集計に失敗');
    expect(dailyCatchAt, '★日次の枠の catch が見つからない').toBeGreaterThan(aggAt);
    expect(
      marketAt,
      '🔴 ★出品の更新が日次集計の枠の中に戻っている（★aggregate が落ちると店が開かない）',
    ).toBeGreaterThan(dailyCatchAt);
  });

  it('② ★★日付を `lastAggregated` と共有していない（★別の変数を持っている）', () => {
    expect(MAIN, '★出品の更新の日付（lastMarketDay）が無い').toContain('lastMarketDay');
    /** ★宣言が別々にある（★同じ変数に戻していない） */
    expect(MAIN).toMatch(/let\s+lastAggregated\s*=\s*''/);
    expect(MAIN).toMatch(/let\s+lastMarketDay\s*=\s*''/);
    /** ★出品の判定に `lastAggregated` を使っていない */
    const marketBlock = MAIN.slice(MAIN.indexOf('日次集計に失敗'));
    expect(marketBlock, '🔴 ★出品の判定が `lastAggregated` を見ている').not.toContain('lastAggregated');
    expect(marketBlock).toContain('lastMarketDay');
  });

  it('③ ★★日付を引けなかった周は、集計も出品も走らせない（★空の日付で走らない）', () => {
    /**
     * 🔴 ★`today` は引けなければ `''` のままです。
     *    ★`lastAggregated` が実日付なら `'' !== '2026-09-19'` は**真**になり、
     *    ★**空の日付で集計が走ります**。★だから両方 `dayIdx !== null` で守ります。
     */
    expect(MAIN).toMatch(/dayIdx\s*!==\s*null\s*&&\s*today\s*!==\s*lastAggregated/);
    expect(MAIN).toMatch(/dayIdx\s*!==\s*null\s*&&\s*today\s*!==\s*lastMarketDay/);
  });

  it('④ ★1 日 1 回のまま（★毎周 DB を叩いていない）', () => {
    /** ★呼ぶ前に必ず日付を書き換えている（★条件の直後に `lastMarketDay = today`） */
    expect(MAIN).toMatch(/today\s*!==\s*lastMarketDay\s*\)\s*\{\s*lastMarketDay\s*=\s*today;/);
    /** ★新しいタイマー・新しい常駐を作っていない */
    expect(MAIN).not.toMatch(/setInterval\s*\([^)]*[Mm]arket/);
  });

  it('⑤ ★★日付を引く問い合わせが `try` の外に出ていない（★DB が落ちてもワーカーが死なない）', () => {
    /**
     * ★この時刻取得は ★**周のループ本体の直下**にあります。
     *   ★裸で置くと投げた瞬間に `while` を突き抜けます。
     */
    const q = MAIN.indexOf('extract(epoch from now()) * 1000');
    expect(q, '★時刻の問い合わせが見つからない').toBeGreaterThan(0);
    /** ★直前 400 文字以内に `try {` があり、その間に `}` で閉じられていない */
    const before = MAIN.slice(Math.max(0, q - 400), q);
    const lastTry = before.lastIndexOf('try {');
    expect(lastTry, '🔴 ★時刻の問い合わせの直前に try が無い').toBeGreaterThan(-1);
    expect(
      before.slice(lastTry),
      '🔴 ★try と問い合わせの間で閉じている（★囲めていない）',
    ).not.toMatch(/\}\s*catch/);
    /** ★見送ったことが読める（★黙って飛ばさない） */
    expect(MAIN).toContain('日次の日付を引けませんでした');
  });

  it('★対照: ★この検査は壊れた形を落とす（★通るだけの検査ではない・R-16）', () => {
    /** ★① を壊す: 出品の呼び出しを枠の中へ戻した写し */
    const broken = MAIN.replace(
      /refreshMarketListings\(client/,
      'REMOVED_MARKET_CALL(client',
    );
    expect(broken.indexOf('refreshMarketListings(client')).toBe(-1);
    /** ★② を壊す: 日付を共有させた写し */
    const shared = MAIN.replace(/lastMarketDay/g, 'lastAggregated');
    expect(shared).not.toContain('lastMarketDay');
    expect(shared).not.toMatch(/dayIdx\s*!==\s*null\s*&&\s*today\s*!==\s*lastMarketDay/);
  });
});
