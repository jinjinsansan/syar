/**
 * ★**騎手と馬市場の配線**（★D12-4・D12-5・2026-09-16・正典 **D-102**・**D-105**）
 *
 * 【★見ている壊れ方】
 *   ① ★**`calm`（暴走の抑え）を画面に出す** — ★出せば「強さの差」に読める（★この便では着順に効かない）
 *   ② ★**勝率・得意距離など着順に効くと読める数値**を出す（★D-105 ③）
 *   ③ ★**名簿・値段・戻り額を画面に直書き**する（★D-052。★正典を直した日に画面だけ古くなる）
 *   ④ ★**引き直しを煽る**（★「もう一度探す」等・D-102 ③）
 *   ⑤ 🔴 ★**素質が出る**（★2026-09-18・**D-114 ②**・T-10・AL-2。
 *     ★旧は「数値は出さず★だけ出す」でしたが、★**段も出しません**）
 *   ⑥ ★**「購入」「円」**の語を使う（★依頼書の指定。★「迎える」で統一）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JOCKEYS, JOCKEY_BOND_MAX, LISTINGS_PER_TIER, sellBackEP } from '@star/scheduler';
import { DEMO_MARKET_PRICES_EP } from '../../web/src/lib/game-demo.js';

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
  /**
   * 🔴 ★**2026-09-26 に ★綴りの釘付けを 要求の水準へ直しました**（★オーナー指示「b で進めて」）。
   *
   * 【★なぜ直したか】★この検査は ★**見本の定数そのもの**を要求していました:
   *   ★`toMatch(/DEMO_MARKET_PRICES_EP\.map/)` ／ `toMatch(/DEMO_MARKET_STOCK_BY_BAND/)`
   *   ★`toMatch(/length:\s*LISTINGS_PER_TIER/)` ／ `toMatch(/sellBackEP\(/)` ／ `toMatch(/back\.toLocaleString\(\)/)`
   *   🔴 ★**実データに繋ぐと 原理的に満たせません。**
   *   ⚠️ ★意図は ★「値段を画面に直書きしない」でした。★実装として ★見本の表を釘付けしていただけです
   *      （★同じ形を ★`first-pass-time-of-day` ⑧ でも直しました・2026-09-26）。
   *
   * 【★実データは 帯に収まりません（★本番で実測・2026-09-26）】
   *   ★出品 15 頭 ／ 値段の種類 ★**14 通り**（★3,000 EP が 2 頭・他 13 通りは 1 頭ずつ）。
   *   → ★「同じ値段の中ならどの 1 頭でも同じ」も ★「3 口のうち残り 1」も ★表すものがありません。
   *   ⚠️ ★帯を作るために 14 通りを 3 つに丸めるのは ★**画面で値付けすること**なのでやりません
   *      （★下の「値付けしていない」で落とします）。
   *
   * 【★残した要求（★正典）】★① 煽らない ★② 数えさせない ★③ 素質を出さない
   *   ★④「迎える」の語 ★⑤ 戻り額を数字で。★**並べ方と文言は意匠**なので見ません（★R-17）。
   */
  it('③ 🔴 ★値段と戻り額を画面で作っていない（★サーバーの値を出すだけ）', () => {
    expect(MARKET, '★段を画面で回している').not.toMatch(/LISTED_BANDS/);
    expect(MARKET, '★画面で値付けしている').not.toMatch(/priceOfStars/);
    /**
     * 🔴 ★**画面で戻り額を計算していない**こと（★D-052）。
     *   ★サーバーが書いた `sell_back_ep` を出します（★実測で式と 14/14 一致しますが、
     *   ★式を画面に置くと ★2 か所になります）。
     */
    expect(MARKET, '🔴 ★画面で戻り額を計算している（★`sell_back_ep` を読むこと）')
      .not.toMatch(/sellBackEP\s*\(/);
    /** 🔴 ★値段・戻り額の ★**数を画面に写していない**（★本番の 14 通りを含む） */
    const literals = num(MARKET);
    for (const price of DEMO_MARKET_PRICES_EP) {
      expect(literals, `★値段が画面に写っている: ${price}`).not.toContain(price);
      expect(literals, `★戻り額が画面に写っている: ${sellBackEP(price)}`).not.toContain(sellBackEP(price));
    }
    /** ★実データの層を通していること（★見本に戻っていない） */
    expect(MARKET, '🔴 ★実データの層を読んでいない').toMatch(/loadMarketScreen/);
    for (const demo of ['DEMO_MARKET_PRICES_EP', 'DEMO_MARKET_STOCK_BY_BAND', 'game-demo']) {
      expect(MARKET, `🔴 ★見本に戻っています: ${demo}`).not.toContain(demo);
    }
    /** ★参考: 名簿の側の値（★走査が空振りでないことの確認） */
    expect(LISTINGS_PER_TIER).toBeGreaterThan(0);
    expect(DEMO_MARKET_PRICES_EP.length).toBeGreaterThan(1);
  });

  /** 🔴 ★**買う口を実際に呼んでいる**（★D-119 を作らない） */
  it('③-2 🔴 ★buy_horse を呼んでいる', () => {
    expect(MARKET, '🔴 ★画面が買う関数を呼んでいない').toMatch(/buyHorse\(/);
    const lib = readFileSync(path.join(ROOT, 'apps/web/src/lib/market-screen.ts'), 'utf8');
    expect(lib, "🔴 ★`rpc('buy_horse'` を呼んでいない").toContain("rpc('buy_horse'");
    expect(lib, '🔴 ★買う前にセッションを見ていない').toContain('getSession()');
  });

  it('④ ★引き直しを煽っていない（★「もう一度探す」を置かない）', () => {
    for (const bad of ['もう一度探す', '引き直', 'リロール', '再抽選', '更新する']) {
      expect(MARKET, `★引き直しの語がある: ${bad}`).not.toContain(bad);
    }
    /**
     * ⚠️ 🔴 ★**文言そのものは見ません**（★2026-09-26 に釘付けを外しました）。
     *    ★旧: ★`toContain('違う値段は出ません')`。
     *    🔴 ★実データでは ★**出品が入れ替わります**（★ワーカーが書く）。★入れ替わりの周期を
     *      ★**誰も測っていない**ので、★あの文を強制すると ★**画面に嘘を書かせます**。
     *    → ★見るのは ★**煽る語が無いこと**だけ。★言い換えは ★意匠なので ★R-17 で依頼済みです。
     * ⚠️ ★**測っていないことを画面に書かせない**（★「時間をおくと入れ替わります」も禁じます）。
     */
    for (const bad of ['入れ替わります', '入れ替わり', '補充されます']) {
      expect(MARKET, `★測っていない約束がある: ${bad}`).not.toContain(bad);
    }
  });

  it('🔴 ⑤ ★素質を一切出していない（★数値も段も・D-114 ②）', () => {
    for (const bad of ['potential', '素質の数値', '上限まで']) {
      expect(MARKET, `★素質が漏れている: ${bad}`).not.toContain(bad);
    }
    /**
     * 🔴 ★**★の部品を使っていない**（★2026-09-18・D-114 ②。★旧は逆に `<Stars` を**要求**していました）。
     * ⚠️ ★部品そのものも `components/ui.tsx` から削除済みです（★置き場が無い形にする・R-29）。
     */
    expect(MARKET, '★★の部品が戻っている').not.toMatch(/<Stars/);
    /**
     * ★**段を出す口そのものが無い**ことを、★**入力の形**で見ます（D-108 ③ の作法）。
     * ⚠️ ★**「band」という語で見てはいけません** — ★`className="a-band"`（見出しの帯）に当たります
     *    （★禁止語の一覧で書かない・D-108 ③。★ここで 1 度踏みました）。
     * → ★**段がある層（`@star/sim-engine`）を引いていないか**と、
     *   ★**段を返す・受け取る名前を呼んでいないか**で見ます。
     */
    for (const gate of ['@star/sim-engine', 'LISTED_BANDS', 'priceOfStars', 'starScaleOfBand', 'bandOfPotential', 'bandOf', 'STAR_']) {
      expect(MARKET, `★段を出す口を引いている: ${gate}`).not.toContain(gate);
    }
  });

  it('⑥ ★「購入」「円」を使わず「迎える」で統一している', () => {
    for (const bad of ['購入', '円', 'チャージ', '換金', '所持金']) {
      expect(MARKET, `★金銭を想起させる語がある: ${bad}`).not.toContain(bad);
    }
    expect(MARKET).toContain('迎える');
  });

  it('★手放すと戻る額を数字で出している（★誤って手放す事故を防ぐ）', () => {
    expect(MARKET).toContain('手放すと戻るのは');
    /**
     * ⚠️ ★旧: ★`toMatch(/back\.toLocaleString\(\)/)` ＝ ★**変数名の釘付け**でした。
     *    → ★見るのは ★**サーバーの戻り額を数字で出していること**です。
     */
    expect(MARKET, '🔴 ★戻り額を数字で出していない').toMatch(/sellBackEP\.toLocaleString\(/);
  });

  it('🔴 ★★残りを数えさせない（★「残り 0」を出さない・D-102 ⑤）', () => {
    /**
     * 🔴 ★**2026-09-26 に 綴りの釘付けを外しました。**
     *   ★旧は ★`toContain('いません')` ／ `toMatch(/length:\s*LISTINGS_PER_TIER/)` ／
     *     ★`toMatch(/DEMO_MARKET_STOCK_BY_BAND/)` ／ `toMatch(/slot\s*>=\s*stock/)` を要求し、
     *     ★★**帯 × 枠という並べ方そのもの**を固定していました。
     *   🔴 ★実データは ★値段 14 通り × ほぼ 1 頭なので、★その形に ★**収まりません**（★本番で実測）。
     *   → ★残す要求は ★**「残りを数えさせない」**（★D-102 ⑤ の趣旨）だけ。
     *     ★点線グレーの「今は　いません」は ★**その実現方法の 1 つ**なので ★意匠（★R-17）。
     */
    for (const bad of ['残り0', '残り 0', '残り{0}', '売り切れ', '完売', '補充']) {
      expect(MARKET, `★0 を数えさせる語がある: ${bad}`).not.toContain(bad);
    }
    /** 🔴 ★出品が無いときに ★**黙らない**こと（★R-16・★空の一覧で「無い」に見せない） */
    expect(MARKET, '🔴 ★出品 0 のときに何も言っていない').toMatch(/listings\.length === 0/);
  });
});
