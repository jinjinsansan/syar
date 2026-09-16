/**
 * ★**騎手と馬市場の配線**（★D12-4・D12-5・2026-09-16・正典 **D-102**・**D-105**）
 *
 * 【★見ている壊れ方】
 *   ① ★**`calm`（暴走の抑え）を画面に出す** — ★出せば「強さの差」に読める（★この便では着順に効かない）
 *   ② ★**勝率・得意距離など着順に効くと読める数値**を出す（★D-105 ③）
 *   ③ ★**名簿・値段・戻り額を画面に直書き**する（★D-052。★正典を直した日に画面だけ古くなる）
 *   ④ ★**引き直しを煽る**（★「もう一度探す」等・D-102 ③）
 *   ⑤ ★**素質の数値**が出る（★§5.5。★出せるのは★だけ）
 *   ⑥ ★**「購入」「円」**の語を使う（★依頼書の指定。★「迎える」で統一）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  JOCKEYS, JOCKEY_BOND_MAX, LISTED_BANDS, LISTINGS_PER_BAND, priceOfStars, sellBackEP,
} from '@star/scheduler';

const ROOT = path.resolve(__dirname, '../../..');
const strip = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');
const PICKER = strip(readFileSync(path.join(ROOT, 'apps/web/src/components/jockey-picker.tsx'), 'utf8'));
const MARKET = strip(readFileSync(path.join(ROOT, 'apps/web/src/app/stable/market/page.tsx'), 'utf8'));
const num = (s: string): Set<number> => new Set((s.match(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g) ?? []).map(Number));

describe('★騎手を選ぶ（D12-4・D-105）', () => {
  it('① ★`calm`（抑えの強さ）を画面に出していない', () => {
    expect(PICKER, '★暴走の抑えが画面に出ている').not.toContain('calm');
    for (const j of JOCKEYS) {
      expect(num(PICKER), `★${j.name} の抑えの値が出ている`).not.toContain(j.calm);
    }
  });

  it('② ★着順に効くと読める語・数値を出していない', () => {
    for (const bad of ['勝率', '得意', '勝ちやすい', '成績', '実績', '上手']) {
      expect(PICKER, `★誤読を招く語がある: ${bad}`).not.toContain(bad);
    }
    /** ★「強さの差はありません」を明言している */
    expect(PICKER).toContain('騎手による強さの差はありません');
    expect(PICKER).toContain('着順への影響はありません');
  });

  it('③ ★名簿と料金を画面に直書きしていない', () => {
    expect(PICKER).toMatch(/JOCKEYS\.map/);
    for (const j of JOCKEYS) {
      expect(PICKER, `★騎手の名前が画面に写っている: ${j.name}`).not.toContain(j.name);
    }
    /**
     * ★親密度の上限も引く（★数を画面に持たない）。
     * ⚠️ ★**リテラル一致で見ないこと**（★2026-09-16 にこれで誤検出しました）。
     *    ★`JOCKEY_BOND_MAX` は **5** で、★`borderRadius: 5` のような**見た目の数**と一致します。
     *    → ★**「引く関数・定数を呼んでいるか」**で見ます（★値の一致では区別できません）。
     */
    expect(PICKER).toMatch(/JOCKEY_BOND_MAX/);
    expect(PICKER).toMatch(/jockeyBondAfterRides/);
    /** ★親密度を画面で数えていない（★`rides` を直接比較していない） */
    expect(PICKER).not.toMatch(/rides\[[^\]]+\]\s*>=/);
    expect(JOCKEY_BOND_MAX).toBeGreaterThan(0);
  });
});

describe('★馬を迎える（D12-5・D-102）', () => {
  it('③ ★帯・口数・値段・戻り額を画面に直書きしていない', () => {
    expect(MARKET).toMatch(/LISTED_BANDS\.map/);
    expect(MARKET).toMatch(/priceOfStars\(band\)/);
    expect(MARKET).toMatch(/sellBackEP\(/);
    expect(MARKET).toMatch(/LISTINGS_PER_BAND/);
    /**
     * ⚠️ ★**帯と口数はリテラル一致で見ません**（★2026-09-16 にこれで誤検出しました）。
     *    ★`LISTED_BANDS[0]` は **2.0**、`LISTINGS_PER_BAND` は **3** で、
     *    ★`gap: 2`・`borderWidth: 3` のような**見た目の数**と一致します。
     * ★**値段と戻り額**（4,000〜8,000・800〜1,600）は見た目の数と桁が違うので、★そちらは値で見ます。
     */
    const literals = num(MARKET);
    for (const b of LISTED_BANDS) {
      expect(literals, `★値段が画面に写っている: ${priceOfStars(b)}`).not.toContain(priceOfStars(b));
      expect(literals, `★戻り額が画面に写っている: ${sellBackEP(priceOfStars(b))}`).not.toContain(sellBackEP(priceOfStars(b)));
    }
    /**
     * ★帯と口数は「引いているか」で見る（★値では見分けられない）。
     * ★帯の並びを画面に書いていない／口数を画面の数で回していないことを、★形で見ます。
     */
    expect(MARKET).not.toMatch(/\[\s*2(\.0)?\s*,\s*2\.5\s*,/);
    expect(MARKET).toMatch(/length:\s*LISTINGS_PER_BAND/);
    /** ★参考: 名簿の側の値（★画面と食い違っていないことの確認） */
    expect(LISTINGS_PER_BAND).toBeGreaterThan(0);
    expect(LISTED_BANDS.length).toBeGreaterThan(1);
  });

  it('④ ★引き直しを煽っていない（★「もう一度探す」を置かない）', () => {
    for (const bad of ['もう一度探す', '引き直', 'リロール', '再抽選', '更新する']) {
      expect(MARKET, `★引き直しの語がある: ${bad}`).not.toContain(bad);
    }
    /** ★先回りして鎮める一文がある */
    expect(MARKET).toContain('違う★は出ません');
  });

  it('⑤ ★素質の数値を出していない（★★だけ）', () => {
    for (const bad of ['potential', '素質の数値', '上限まで']) {
      expect(MARKET, `★素質が漏れている: ${bad}`).not.toContain(bad);
    }
    expect(MARKET).toMatch(/<Stars/);
  });

  it('⑥ ★「購入」「円」を使わず「迎える」で統一している', () => {
    for (const bad of ['購入', '円', 'チャージ', '換金', '所持金']) {
      expect(MARKET, `★金銭を想起させる語がある: ${bad}`).not.toContain(bad);
    }
    expect(MARKET).toContain('迎える');
  });

  it('★手放すと戻る額を数字で出している（★誤って手放す事故を防ぐ）', () => {
    expect(MARKET).toContain('手放すと戻るのは');
    expect(MARKET).toMatch(/back\.toLocaleString\(\)/);
  });

  it('★★0 口になった枠は静かな空欄（★「残り 0」を出さず、帯も広げない・D-102 ⑤）', () => {
    /**
     * ★デザイナーの回答（2026-09-16）:
     *   ★「残り1」バッジは出す／★0 口の枠は ★**点線グレーの「今は　いません」**に置き換える／
     *   ★**「残り 0」の数字は出さない**／★帯そのものは広げない・消さない。
     */
    expect(MARKET).toContain('いません');
    expect(MARKET).toContain('残り');
    for (const bad of ['残り0', '残り 0', '残り{0}', '売り切れ', '完売', '補充']) {
      expect(MARKET, `★0 を数えさせる語がある: ${bad}`).not.toContain(bad);
    }
    /**
     * ★**枠を詰めていない**こと（★枡の数は `LISTINGS_PER_BAND` のまま・帯を広げない）。
     * ⚠️ ★在庫で `Array.from` の長さを変えると ★**帯が縮みます**（★D-102 ⑤ の「広げない」の裏側）。
     */
    expect(MARKET).toMatch(/length:\s*LISTINGS_PER_BAND/);
    expect(MARKET, '★在庫で枡の数を変えている').not.toMatch(/length:\s*stock/);
    /** ★在庫は引いてくる（★画面で数えない・本番はサーバーの値） */
    expect(MARKET).toMatch(/DEMO_MARKET_STOCK_BY_BAND/);
    /** ★空欄の判定は枠の番号と在庫の比較 1 か所だけ（★別の条件を増やさない） */
    expect(MARKET).toMatch(/slot\s*>=\s*stock/);
  });
});
