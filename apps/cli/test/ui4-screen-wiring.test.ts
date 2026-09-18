/**
 * ★**景品交換と記録の結線**（★UI-4・2026-09-19）
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**画面が在庫・PP 不足を判定する**（★`exchange_prize` が持っています）
 *   ② 🔴 ★**画面が時計を持つ**（★`Date.now()` / epoch / 1 週の長さ・憲法 4）
 *   ③ 🔴 ★**台帳の理由の一覧が SQL とずれる**（★足りなければ英語が出る・余れば死んだ語を持つ）
 *   ④ 🔴 ★**増減を「理由の語」から決める**（★`delta` が符号を持っているのに）
 *   ⑤ 🔴 ★**冪等キーを押すたびに作り直す**（★二重交換）
 *   ⑥ 🔴 ★**源の無い列を画面が作る**（★`category` / `until` / `tag` / 1 走あたりの賞金）
 *
 * ⚠️ ★**見た目は見ません**（★UI1-8 と同じ扱い）。★「あるか無いか」だけです。
 * ⚠️ ★註記は `stripSqlComments()` が落とします（★CK-1）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { lastFunctionBody, lastViewBody, allMigrationsBody } from './lib/sql-source.js';
import { EP_REASON_LABEL, PP_REASON_LABEL, PERIOD_LABEL } from '../../web/src/lib/records-screen.js';
import { PRIZE_STATUS_LABEL } from '../../web/src/lib/prize-screen.js';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string): string => readFileSync(path.join(ROOT, p), 'utf8');
/** ★TypeScript の註記を落とす（★SQL 側は `stripSqlComments()`） */
const strip = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');

const PRIZE_SCREEN = strip(read('apps/web/src/lib/prize-screen.ts'));
const PRIZE_PAGE = strip(read('apps/web/src/app/prizes/page.tsx'));
const REC_SCREEN = strip(read('apps/web/src/lib/records-screen.ts'));
const REC_VIEW = strip(read('apps/web/src/app/records/records-view.tsx'));

/** ★SQL の CHECK が持つ語彙を取り出す（★これが正） */
function reasonsInCheck(constraint: string): readonly string[] {
  const ALL = allMigrationsBody();
  const hits = [...ALL.matchAll(new RegExp(`${constraint} check \\(\\s*reason in \\(([^)]*)\\)`, 'gi'))];
  if (hits.length === 0) throw new Error(`★${constraint} が見つかりません（★走査が空・R-21）`);
  /** ⚠️ ★**最後の 1 つ**（★`0025`・`0026`・`0027` が足している・R-19） */
  const last = hits[hits.length - 1]![1]!;
  return [...last.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!).sort();
}

describe('★③ 台帳の理由が SQL とずれていない', () => {
  it('🔴 ★EP の理由が、CHECK と過不足なく一致する', () => {
    /**
     * ⚠️ ★**両方向**を見ます。
     *   ★足りない → ★画面に生の英語が出る。
     *   ★余っている → ★もう無い理由を持ち続ける（★消し忘れに気づけない）。
     */
    expect(Object.keys(EP_REASON_LABEL).sort()).toEqual(reasonsInCheck('ep_ledger_reason_allowed'));
  });

  it('🔴 ★PP の理由が、CHECK と過不足なく一致する', () => {
    expect(Object.keys(PP_REASON_LABEL).sort()).toEqual(reasonsInCheck('pp_ledger_reason_allowed'));
  });

  it('🔴 ★PP 側に EP からの変換を表す語が無い（★構造 S-5・憲法 2）', () => {
    for (const bad of ['from_ep', 'convert', 'topup', 'purchase', 'buy']) {
      expect(Object.keys(PP_REASON_LABEL), `★PP に ${bad} がある`).not.toContain(bad);
    }
  });

  it('★交換の状態は 3 つ（★`0007` の CHECK と同じ）', () => {
    expect(Object.keys(PRIZE_STATUS_LABEL).sort()).toEqual(['cancelled', 'fulfilled', 'requested']);
  });
});

describe('★① 判定はサーバーが持つ（★画面が持たない）', () => {
  const rpc = lastFunctionBody('exchange_prize').body;

  it('★`exchange_prize` が在庫・掲載・PP を見ている（★走査が空振りしていない・R-21）', () => {
    expect(rpc, '★在庫を見ていない').toMatch(/stock <= 0/);
    expect(rpc, '★行ロックを取っていない').toMatch(/for update/);
    expect(rpc, '★PP を見ていない').toMatch(/v_pp < v_prize\.cost_pp/);
    expect(rpc, '★冪等キーを見ていない').toMatch(/client_token/);
  });

  it('🔴 ★画面が在庫で絞っていない（★`prize_catalog_public` が絞っている）', () => {
    /**
     * ★ビューが `active and stock > 0` を持っています。★画面が同じ条件を書くと
     * ★**在庫の規則が 2 か所**になります（D-052）。
     */
    expect(PRIZE_SCREEN, '★画面が在庫で絞っている').not.toMatch(/\bstock\b/);
    expect(PRIZE_SCREEN, '★画面が掲載中で絞っている').not.toMatch(/\.eq\('active'/);
    expect(PRIZE_SCREEN, '★公開ビューを読んでいない').toContain('prize_catalog_public');
  });

  it('🔴 ★画面が PP→EP の経路を作っていない（★憲法 2）', () => {
    for (const bad of ['entry_points', 'EP に', 'toEP', 'convert']) {
      expect(PRIZE_SCREEN, `★PP→EP の気配: ${bad}`).not.toContain(bad);
    }
  });

  it('🔴 ★失敗を握り潰さず、原文を出している（R-27・UI1-9）', () => {
    expect(PRIZE_PAGE, '★RPC の失敗を受け取っていない').toMatch(/setExchangeError\(r\.failure\.message\)/);
    expect(PRIZE_PAGE, '★失敗を画面に出していない').toMatch(/\{exchangeError\}/);
    expect(PRIZE_PAGE, '★読み込みの失敗を受け取っていない').toMatch(/\.catch\([\s\S]{0,200}setLoadError/);
    expect(PRIZE_PAGE, '★読み込みの失敗を出していない').toMatch(/\{loadError\}/);
  });
});

describe('★CK-2: 「持たせない」の対になる「出している」', () => {
  /**
   * 🔴 ★**「持たせない」は検査で固定できます。★「出す」は検査が無いと誰も気づきません**
   *    （★裁定 `REVIEW_UI4_PREP_VERDICT_20260919.md` §1）。
   *    ★`0044` で「あと何 EP」を読んでいたのに ★**どこにも表示していなかった**のが原形です。
   *    → ★**上の「〜を持っていない」と対で、★「〜を出している」を置きます。**
   */
  it('🔴 ★景品: ★名前・必要 PP・残高・履歴を出している', () => {
    expect(PRIZE_PAGE, '★景品の名前を出していない').toMatch(/\{p\.name\}/);
    expect(PRIZE_PAGE, '★必要 PP を出していない').toMatch(/\{p\.costPP\.toLocaleString/);
    expect(PRIZE_PAGE, '★残高を出していない').toMatch(/\{balance\.toLocaleString/);
    expect(PRIZE_PAGE, '★履歴を出していない').toMatch(/\{h\.prizeName\}/);
    expect(PRIZE_PAGE, '★状態の言葉を出していない').toMatch(/PRIZE_STATUS_LABEL\[h\.status\]/);
    expect(PRIZE_PAGE, '★交換のボタンが押せない（★見せているだけ）').toMatch(/onClick=\{\(\) => \{ void submit\(\); \}\}/);
  });

  it('🔴 ★記録: ★週・着順・頭数・理由の言葉・残高を出している', () => {
    expect(REC_VIEW, '★週を出していない').toMatch(/r\.gameWeek === null \? '—'/);
    expect(REC_VIEW, '★着順を出していない').toMatch(/\{r\.place\}/);
    expect(REC_VIEW, '★頭数を出していない').toMatch(/\{r\.fieldSize\}/);
    expect(REC_VIEW, '★理由の言葉を出していない').toMatch(/\{r\.reasonLabel\}/);
    expect(REC_VIEW, '★残高を出していない').toMatch(/fmt\(r\.balance\)/);
    /** ★合計は台帳から（★1 走あたりには割れないが、合計は出せる） */
    expect(REC_VIEW, '★獲得賞金の合計を出していない').toMatch(/fmt\(prizeTotal\)/);
  });

  it('🔴 ★出していない列を、黙って消さずに言っている', () => {
    /** ⚠️ ★「源が無いので出さない」を ★**画面にも書きます**（★読む人には消えたようにしか見えない） */
    expect(REC_VIEW, '★賞金列が無い理由を書いていない').toMatch(/1 走ごとの賞金は表示していません/);
  });
});

describe('★⑤ 冪等キー（★二重交換を作らない）', () => {
  it('🔴 ★1 回作って持ち続ける', () => {
    expect(PRIZE_PAGE, '★状態として持っていない').toMatch(/useState\(\(\) => crypto\.randomUUID\(\)\)/);
    expect(PRIZE_PAGE, '★呼び出しの中で作り直している').not.toMatch(/clientToken:\s*crypto\.randomUUID\(\)/);
  });

  it('★1 回通ったら作り直す（★連続して交換できる）', () => {
    expect(PRIZE_PAGE, '★成功の後に鍵を更新していない').toMatch(/setClientToken\(crypto\.randomUUID\(\)\)/);
  });
});

describe('★② 画面が時計を持たない（★憲法 4）', () => {
  it('🔴 ★`Date.now()` も epoch も 1 週の長さも使っていない', () => {
    for (const s of [REC_SCREEN, REC_VIEW]) {
      expect(s, '★Date.now() を使っている').not.toMatch(/Date\.now\(\)/);
      expect(s, '★epoch を持っている').not.toMatch(/epoch|EPOCH/);
      expect(s, '★1 週の長さを持っている').not.toMatch(/WEEK_MS|CYCLES_PER_WEEK/);
    }
  });

  it('🔴 ★「今週」の境目はサーバーが書いた実時刻', () => {
    expect(REC_SCREEN, '★week_started_at を読んでいない').toContain('week_started_at');
    expect(REC_SCREEN, '★台帳を絞っていない').toMatch(/\.gte\('created_at', weekStartedAt\)/);
  });

  it('🔴 ★境目が書かれていなければ、黙って全期間にしない（R-16）', () => {
    expect(REC_SCREEN, '★黙って全期間に落としている').toMatch(/weekStartedAt === null[\s\S]{0,200}throw new Error/);
  });

  it('★期間は「今週」と「全期間」だけ（★「今月」は正典に無い）', () => {
    /**
     * ⚠️ ★ゲーム内に「月」はありません（★1 週 ＝ 4 時間・D-007）。
     *    ★実時刻の暦月で切ると ★**BT-6 と同じ「どの暦か決まっていない境目」**になります。
     *    → ★照会中。★勝手に足さないこと。
     */
    expect(Object.keys(PERIOD_LABEL).sort()).toEqual(['all', 'week']);
  });
});

describe('★④ 増減は `delta` の符号で決める', () => {
  it('🔴 ★理由の語の一覧を画面が持っていない', () => {
    /**
     * 🔴 ★旧: `const INC_REASONS = new Set(['返還', '賞金', '払戻'])`。
     *    ★台帳が符号を持っているのに、★**画面が理由の語で色を決めて**いました。
     *    ★理由が 1 つ増えるたびに画面も直さないとずれます（D-052）。
     */
    expect(REC_VIEW, '★理由の語の一覧が戻っている').not.toMatch(/INC_REASONS/);
    expect(REC_VIEW, '★符号で決めていない').toMatch(/const inc = r\.delta > 0/);
  });
});

describe('★⑥ 源の無いものを画面が作っていない', () => {
  it('🔴 ★`prize_catalog` に無い列を画面が持っていない', () => {
    /**
     * ⚠️ ★`prize_catalog` の列は `id, name, cost_pp, stock, active, created_at` だけです。
     *    ★デモの `category` / `until` / `tag` は ★**サーバーに存在しません**（★UI1-8 の「毛色」と同じ形）。
     */
    for (const bad of ['category', 'until', "tag"]) {
      expect(PRIZE_SCREEN, `★源の無い列を持っている: ${bad}`).not.toMatch(new RegExp(`\\b${bad}\\b`));
    }
    expect(PRIZE_PAGE, '★分類タブが戻っている').not.toMatch(/CATEGORIES/);
  });

  it('🔴 ★1 走あたりの賞金 PP を出していない（★源が未確定・PR-1）', () => {
    /**
     * ⚠️ ★`pp_ledger.ref_id` は `race_id` で、★同じレースに 2 頭出すと分けられません。
     *    ★さらに ★**NPC 馬には `pp_ledger` の行が立ちません**（`user_id not null`）。
     *    → ★**PR-1 で `race_entries` に一次資料を置くまで出しません。**
     */
    expect(REC_SCREEN, '★賞金の列を作っている').toMatch(/prizeColumnAvailable: false/);
    const runsView = lastViewBody('my_runs').body;
    expect(runsView, '★ビューに賞金の列がある（★PR-1 が入ったならこの検査を更新すること）')
      .not.toMatch(/prize_pp/);
  });

  it('🔴 ★`my_runs` は素質・現在能力の生値を出していない（D-114）', () => {
    const runsView = lastViewBody('my_runs').body;
    for (const bad of ['potential', 'genotype', 'ability', 'aptitude']) {
      expect(runsView, `★生値が出ている: ${bad}`).not.toContain(bad);
    }
    expect(runsView, '★本人スコープになっていない').toMatch(/h\.owner_id = auth\.uid\(\)/);
    expect(runsView, '★確定した走りだけになっていない').toMatch(/finish_pos is not null/);
  });

  it('🔴 ★`my_runs` の出走数の数え方が `my_horses.starts` と同じ', () => {
    /** ⚠️ ★違う数え方だと「戦績 12 なのに 11 行」になります（★CL-4 の家族） */
    const mine = lastViewBody('my_horses').body;
    expect(mine, '★my_horses の数え方が変わった').toMatch(/finish_pos is not null/);
  });
});
