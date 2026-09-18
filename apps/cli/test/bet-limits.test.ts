/**
 * ★**投票の上限は 1 か所**（★BT-1〜BT-6・2026-09-19）
 *   ★裁定 `REVIEW_BET_LIMITS_VERDICT_20260919.md` / `REVIEW_BET_ALLOWANCE_VERDICT_20260919.md`
 *
 * 【★BT-0 — この便の原理】
 *   > ★**画面に渡すのは「判断の材料」ではなく「判断の結果」にする。**
 *   > ★材料を渡すと、画面が判断を組み立て、★そこに第 2 の規則ができる。
 *
 * 【★見ている壊れ方】
 *   ① 🔴 ★**SQL に上限が直書きで戻る**（★4 つ・D-052）
 *   ② 🔴 ★**規則が 2 か所になる**（★RPC とビューが別々に比較する・BT-2）
 *      ★ずれると「押してから弾かれる」か「買えるのに買えないと出る」。★後者は**誰も気づかない**
 *   ③ 🔴 ★**内訳が外に出る**（★呼ぶ側が `min` を取れると、優先順位が外に漏れる）
 *   ④ 🔴 ★**画面が馬名で自馬を突き合わせる**（★`horses.name` に一意制約は無い・BT-3）
 *   ⑤ 🔴 ★**券種を省ける**（★省くと「全券種の合計を 1 券種とみなす」答えになる・**BT-5**）
 *
 * ⚠️ ★**註記は `stripSqlComments()` が落とします**（★CK-1）。★生の SQL をここで読みません。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BET_CAP_PER_KIND_EP, BET_CAP_PER_RACE_EP, BET_CAP_PER_DAY_EP, BET_CAP_OWN_RACE_EP, BET_CAP_LABEL,
} from '@star/betting';
import { lastFunctionBody, allMigrationsBody, liveFunctionsMatching } from './lib/sql-source.js';

const ROOT = path.resolve(__dirname, '../../..');

describe('★BT-4 ④: 値が 1 ビットも変わっていない（§9.4・§9.5）', () => {
  it('🔴 ★§9.4 の 3 つと §9.5 の 1 つ', () => {
    /** ⚠️ ★これは**賭博性の分水嶺に関わる数**です。★動かすなら正典の改訂 */
    expect(BET_CAP_PER_KIND_EP).toBe(30_000);
    expect(BET_CAP_PER_RACE_EP).toBe(50_000);
    expect(BET_CAP_PER_DAY_EP).toBe(500_000);
    expect(BET_CAP_OWN_RACE_EP).toBe(5_000);
  });

  it('★自馬レースの上限は「1 レース合計」より厳しい（★上書きになっている）', () => {
    expect(BET_CAP_OWN_RACE_EP).toBeLessThan(BET_CAP_PER_RACE_EP);
  });
});

describe('★BT-1 ①: SQL に上限が直書きで戻っていない', () => {
  const pb = lastFunctionBody('place_bet').body;

  it('🔴 ★`place_bet` に 4 つの数が無い', () => {
    for (const cap of ['30000', '50000', '500000', '5000']) {
      expect(pb, `★上限が直書きに戻っている: ${cap}`).not.toContain(cap);
    }
  });

  it('🔴 ★`place_bet` が `bet_allowance()` を呼び、★戻りで判定している', () => {
    expect(pb, '★規則を自分で持っている').toMatch(/bet_allowance\(/);
    /** ⚠️ ★「呼ぶ」だけでは足りない — ★**使っている**ことを見る */
    expect(pb, '★戻りを使っていない').toMatch(/v_allow\.remaining_ep\s*<\s*p_amount/);
  });

  it('★§9.5 の「自馬を全頭含む」は `place_bet` に残っている（★金額の話ではない）', () => {
    expect(pb, '★買い目の形の判定が消えている').toMatch(/p_selection\s*@>\s*to_jsonb/);
  });
});

describe('★BT-2: 規則は 1 本だけが持つ', () => {
  const alw = lastFunctionBody('bet_allowance').body;
  const mine = lastFunctionBody('my_bet_allowance').body;

  it('★走査が空振りしていない（R-21）', () => {
    expect(alw.length, '★本文が読めていない').toBeGreaterThan(500);
  });

  it('🔴 ★`bet_limits` を読むのは 1 本だけ', () => {
    /**
     * 🔴 ★**2026-09-19・裁定 §1 の指摘で作り直しました。**
     *    ★旧: 「`least(` を持つのは 1 本だけ」— ★**形**で見る検査で、
     *    ★`case when a < b …` と書けば通ってしまいます。
     *    ★新: ★**「上限の数に触れるのは 1 本だけ」**を見ます。★これは意味に近い。
     */
    /**
     * ⚠️ ★**全移行を繋いで数えてはいけません** — ★`0044`・`0045`・`0047` が
     *    ★同じ関数を 3 回定義しており、★**同じ 1 行が 3 回数えられます**（R-19）。
     *    ★`liveFunctionsMatching()` は ★**いま生きている定義だけ**を見ます。
     */
    const readers = liveFunctionsMatching(/\bfrom\s+bet_limits\b/i);
    expect(readers, `★bet_limits を読む関数: ${readers.join(', ')}`).toEqual(['bet_allowance']);
  });

  it('🔴 ★呼ぶ側は自分で最小を取らない', () => {
    expect(alw, '★最小を取る所が無い').toMatch(/least\(/);
    expect(mine, '★画面向けの口が自分で最小を取っている').not.toMatch(/least\(/);
    expect(lastFunctionBody('place_bet').body, '★RPC が自分で最小を取っている').not.toMatch(/least\(/);
  });

  it('🔴 ★画面向けの口も RPC も、同じ 1 本を呼んでいる', () => {
    expect(mine, '★my_bet_allowance が bet_allowance を呼んでいない').toMatch(/bet_allowance\(/);
    expect(lastFunctionBody('place_bet').body).toMatch(/bet_allowance\(/);
  });

  it('🔴 ★BT-1 ③: 内訳（4 つの残り）を返していない', () => {
    /**
     * ★返す列は ★**残り 1 つ ＋ 効いている上限の名前**だけ。
     * ⚠️ ★内訳を返すと、★**呼ぶ側が `min` を取れてしまい**、
     *    ★「どれが優先か」という第 5 の知識が外に出ます（R-29）。
     */
    const sig = /returns table \(([^)]*)\)/i.exec(alw);
    expect(sig, '★戻りの型が読めない').not.toBeNull();
    const cols = sig![1]!.split(',').map((c) => c.trim().split(/\s+/)[0]!);
    expect(cols.sort()).toEqual(['binding', 'binding_label', 'remaining_ep']);
  });

  it('★関数は数を持たない', () => {
    for (const cap of ['30000', '50000', '500000', '5000']) {
      expect(alw, `★関数が数を持っている: ${cap}`).not.toContain(cap);
    }
  });

  it('🔴 ★BT-4 ②: 行が無ければ通さない（R-27）', () => {
    expect(alw).toMatch(/not found then[\s\S]{0,200}raise exception/i);
  });
});

describe('★BT-5: 券種を省けない', () => {
  const alw = lastFunctionBody('bet_allowance').body;
  const mine = lastFunctionBody('my_bet_allowance').body;
  const ALL = allMigrationsBody();

  it('🔴 ★`p_bet_type` に既定値が無い（★2 引数の呼び方が存在しない）', () => {
    /**
     * 🔴 ★`0044` は `p_bet_type text default null` でした。
     *    ★null のとき `(p_bet_type is null or bet_type = p_bet_type)` が
     *    ★**全券種を 1 券種とみなし**、★残りを 30,000 で頭打ちにしていました。
     * ✔ ★staging で実測（2026-09-19・rollback 付き）:
     *    ★単勝 10,000 ＋ 複勝 10,000 の人に対し
     *      ★旧 … 残り **10,000** ／ `binding = kind`（★**券種はまだ選ばれていない**）
     *      ★新 … 残り **30,000** ／ `binding = race`
     */
    const sig = /create\s+or\s+replace\s+function\s+bet_allowance\s*\(([\s\S]*?)\)\s*returns/i.exec(alw);
    expect(sig, '★宣言が読めない').not.toBeNull();
    expect(sig![1]!, '★既定値が戻っている').not.toMatch(/default/i);
  });

  it('🔴 ★`null` を明示で渡しても止まる', () => {
    expect(alw, '★null を拒んでいない').toMatch(/p_bet_type is null[\s\S]{0,120}raise exception/i);
  });

  it('🔴 ★券種の合計を「全券種」で数えていない', () => {
    expect(alw, '★券種を跨いで数えている（★BT-5 の再発）').not.toMatch(/p_bet_type is null or bet_type/i);
    expect(alw, '★券種で絞っていない').toMatch(/and bet_type = p_bet_type/);
  });

  it('🔴 ★ビュー `my_bet_allowance` は落ちている（★引数を取れないため）', () => {
    expect(ALL, '★ビューを落としていない').toMatch(/drop view if exists my_bet_allowance/i);
    /** ★最後に来るのは**関数**の定義 */
    const lastView = ALL.lastIndexOf('create or replace view my_bet_allowance');
    const lastFn = ALL.lastIndexOf('create or replace function my_bet_allowance');
    expect(lastFn, '★関数が定義されていない').toBeGreaterThan(-1);
    expect(lastFn, '★ビューの定義が関数より後にある').toBeGreaterThan(lastView);
  });

  it('🔴 ★画面向けの口も券種を受け取る', () => {
    expect(mine, '★券種を受け取っていない').toMatch(/my_bet_allowance\s*\(\s*p_race_id uuid,\s*p_bet_type text\s*\)/);
    expect(mine, '★未認証を通している').toMatch(/未認証/);
  });

  it('★画面が券種ごとに聞き直している', () => {
    const screen = readFileSync(path.join(ROOT, 'apps/web/src/lib/bet-screen.ts'), 'utf8');
    const page = readFileSync(path.join(ROOT, 'apps/web/src/app/races/[id]/bet/page.tsx'), 'utf8');
    expect(screen, '★RPC を呼んでいない').toMatch(/rpc\('my_bet_allowance'/);
    expect(screen, '★券種を渡していない').toMatch(/p_bet_type: betType/);
    /** 🔴 ★券種が変わったら聞き直す（★依存配列に `typeKey` が要る） */
    expect(page, '★券種が変わっても聞き直していない').toMatch(/\[data\?\.race\?\.id, typeKey, placed\]/);
  });
});

describe('★BT-4 ①: ワーカーが毎周書く', () => {
  const worker = readFileSync(path.join(ROOT, 'apps/worker/src/main.ts'), 'utf8');

  it('🔴 ★TypeScript の定数を渡している（★数を写していない）', () => {
    expect(worker).toMatch(/BET_CAP_PER_KIND_EP/);
    expect(worker).toMatch(/insert into bet_limits/);
  });

  it('🔴 ★「変わったときだけ」になっていない（★止まったのと区別できなくなる）', () => {
    /**
     * ★`world_state` と同じ形（★毎周 `insert … on conflict do update`）。
     * ⚠️ ★`if (changed)` のような分岐で囲まれていないこと。
     */
    const at = worker.indexOf('insert into bet_limits');
    const before = worker.slice(Math.max(0, at - 400), at);
    expect(before, '★条件付きで書いている').not.toMatch(/if\s*\([^)]*chang/i);
    expect(worker.slice(at, at + 600)).toMatch(/on conflict \(id\) do update/);
  });
});

describe('★BT-3: 馬名で突き合わせない', () => {
  const ALL = allMigrationsBody();

  it('🔴 ★`horses.name` に一意制約が無いことを、実物で確かめる', () => {
    /**
     * 🔴 ★開発側は「馬名は一意（`0001` の一意制約）」と書きました — ★**存在しません**。
     *    ★**測っていない前提**でした（★R-21 の家族）。
     * ⚠️ ★staging では 7,370 / 7,370 で**たまたま**一致しています — ★だから危ないのです。
     */
    expect(ALL, '★馬名に一意索引ができている（★前提が変わったので検査を見直すこと）')
      .not.toMatch(/unique[^;]*\bhorses\b[^;]*\(name\)/i);
  });

  it('🔴 ★出走表が「これは自分の馬か」を返す', () => {
    const hits = [...ALL.matchAll(/create or replace view race_entries_public as([\s\S]*?);/gi)];
    expect(hits.length, '★出走表のビューが無い').toBeGreaterThan(0);
    const last = hits[hits.length - 1]![1]!;
    expect(last, '★is_mine が無い').toMatch(/\bis_mine\b/);
    expect(last, '★auth.uid() で判定していない').toMatch(/auth\.uid\(\)/);
  });

  it('🔴 ★`owner_id` は出していない（★`0006` の註記のまま）', () => {
    const hits = [...ALL.matchAll(/create or replace view race_entries_public as([\s\S]*?);/gi)];
    const last = hits[hits.length - 1]![1]!;
    /** ★`h.owner_id` は **判定の中**でだけ使い、★**列としては出さない** */
    expect(last, '★owner_id を列として出している').not.toMatch(/owner_id\s+as\b|,\s*h\.owner_id\s*,/);
  });

  it('★画面が馬名で突き合わせていない', () => {
    const screen = readFileSync(path.join(ROOT, 'apps/web/src/lib/bet-screen.ts'), 'utf8');
    const live = screen.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    expect(live, '★馬名の集合で突き合わせている').not.toMatch(/myNames/);
    expect(live, '★is_mine を使っていない').toMatch(/is_mine/);
  });
});

describe('★言葉（★「達しています」と書かない）', () => {
  it('🔴 ★上限の名前であって、達したかどうかではない', () => {
    for (const [k, label] of Object.entries(BET_CAP_LABEL)) {
      expect(label, `★${k} が「達した」と言っている`).not.toContain('達し');
    }
    /** ★名前が空でないこと（`none` を除く） */
    for (const k of ['kind', 'race', 'day', 'own_race', 'balance'] as const) {
      expect(BET_CAP_LABEL[k].length, `★${k} の言葉が空`).toBeGreaterThan(0);
    }
  });

  it('🔴 ★SQL の側も同じ（★`bet_allowance` が返す言葉）', () => {
    /** ⚠️ ★註記は `stripSqlComments()` が落としています（★CK-1・★これが 4 例目の原因でした） */
    const alw = lastFunctionBody('bet_allowance').body;
    const labels = [...alw.matchAll(/binding_label\s*:=[^;]*?'([^']+)'/g)].map((m) => m[1]!);
    expect(labels.length, '★言葉が読めていない').toBeGreaterThan(2);
    for (const l of labels) expect(l, `★SQL が「達した」と言っている: ${l}`).not.toContain('達し');
  });
});

describe('★BT-6 ①: 「1 日」の境目（★測定の記録）', () => {
  /**
   * 🔴 ★**SQL と TS で「1 日」の定義が別々**です。
   *   ★SQL … `date_trunc('day', now())`（★DB の TimeZone にしたがう暦日）
   *   ★TS  … `dayIndex(cycleIndex)`（★`epochMs` から 24 時間ごと）
   *
   * ✔ ★**測定（2026-09-19・staging）**:
   *     ★DB の TimeZone = `UTC`（★サーバー既定。★role/db ごとの上書きは **0 件**）
   *     ★`STAR_EPOCH_ISO` = `2026-08-08T00:00:00Z`（★staging・production とも同じ文字列）
   *     → ★**ずれ 0.0 分**。★いまは同じ時刻に切れています。
   *
   * ⚠️ 🔴 ★**「たまたま」です**（★BT-3 の 7,370/7,370 と同じ）。
   *     ★epoch が 00:00Z ちょうどで、★DB の TimeZone が UTC だから一致しているだけで、
   *     ★**どちらも「そうである」と宣言した場所がありません**。
   *     ★さらに `date_trunc('day', now())` は ★**セッションの TimeZone** にしたがうので、
   *     ★接続の仕方で変わりえます。
   * → ★**BT-6 ② は AL-11 に合流**（★裁定 §6 の順）。★ここは ★**前提が動いたら落ちる**ようにします。
   */
  it('🔴 ★前提が動いたら気づく（★epoch が 00:00Z ちょうどであること）', () => {
    const ALL = allMigrationsBody();
    expect(ALL, '★SQL 側の「1 日」が date_trunc でなくなった（★BT-6 ② が入ったなら、この検査を消すこと）')
      .toMatch(/date_trunc\('day', now\(\)\)/);
  });

  it('🔴 ★移行のどこにもタイムゾーンの宣言が無いことを、実物で確かめる', () => {
    const ALL = allMigrationsBody();
    expect(ALL, '★タイムゾーンの宣言が入った（★BT-6 の前提が変わった）')
      .not.toMatch(/Asia\/Tokyo|set\s+timezone/i);
  });
});
