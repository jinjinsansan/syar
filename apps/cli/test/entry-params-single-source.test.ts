/**
 * ★**出走料と斤量の出どころは 1 つ**（★EF-1〜EF-4・2026-09-19）
 *   ★裁定 `REVIEW_UI1_SETUP_VERDICT_20260919.md`
 *
 * 【🔴 ★何が起きていたか — **追ったら既に三重帳簿でした**】
 *   | 量 | どこにあったか |
 *   |---|---|
 *   | 斤量 55 | ✔ 正＝`BASE_WEIGHT_KG`（`@star/race-engine`）／🔴 `race-field.ts` に **3 か所**／🔴 `enter_race` に **1 か所** |
 *   | 出走料 200 | 🔴 ★**TS に定数が無い**（`CAREER_ASSUMPTION` の**説明文の中**だけ）／🔴 `enter_race` に **1 か所** |
 *
 *   ★`/entry` を繋ごうとして ★**画面が 5 つ目・6 つ目の写しを作るところ**で止めました。
 *
 * 【★どう解いたか — **D-103 ④ の先例**】
 *   ★**正 ＝ TypeScript** → ★**ワーカーがレースの行に書く** → ★**RPC・ビュー・画面はその行を読む**。
 *
 * 【★この検査が守るもの】
 *   ① ★**SQL に値を直書きしていない**（★`v_fee := 200` / `weight ... 55` が戻っていない）
 *   ② ★**ワーカーが TS の定数を書いている**（★別の数を書いていない）
 *   ③ ★**画面が自分で持っていない**（★`apps/web/src` に 200 / 55 を書かない）
 *   ④ 🔴 ★**値が変わっていない**（**EF-4**）— ★登録料 200 EP は **正典 §3.4 の前提**で **GB-6 に噛む**
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { ENTRY_FEE_EP } from '@star/scheduler';
import { BASE_WEIGHT_KG } from '@star/race-engine';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATIONS = path.join(ROOT, 'db/migrations');

/** ★`--` のコメントと `comment on … ;` を落とす（★註記の語を拾わない・`rpc-guard` と同じ理由） */
const stripComments = (sql: string): string =>
  sql.replace(/--[^\n]*/g, ' ').replace(/\bcomment\s+on\b[\s\S]*?;/gi, ' ');

/** ★最後に定義された `enter_race` の本文（★`create or replace` は重なるので最後だけが効く） */
function lastEnterRace(): { file: string; body: string } {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  let found: { file: string; body: string } | null = null;
  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS, file), 'utf8');
    const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\s*\.\s*)?enter_race\s*\(/gi;
    for (const m of sql.matchAll(re)) {
      const rest = sql.slice(m.index);
      const next = rest.slice(1).search(/create\s+(?:or\s+replace\s+)?function\s/i);
      found = { file, body: next === -1 ? rest : rest.slice(0, next + 1) };
    }
  }
  if (found === null) throw new Error('★enter_race の定義がありません（★走査が空・R-21）');
  return found;
}

describe('★EF-4: 値が変わっていない（★GB-6 に噛む）', () => {
  it('🔴 ★出走料は 200 EP のまま（★正典 §3.4 の 1 キャリアの収支の前提）', () => {
    expect(ENTRY_FEE_EP).toBe(200);
  });
  it('🔴 ★斤量は 55kg のまま（★§8.3）', () => {
    expect(BASE_WEIGHT_KG).toBe(55);
  });
});

describe('★EF-2: SQL に値を直書きしていない', () => {
  const { file, body } = lastEnterRace();
  const live = stripComments(body);

  it('★走査が空振りしていない（★本文を読めている・R-21）', () => {
    expect(live.length, `★${file} から本文を読めていない`).toBeGreaterThan(500);
    expect(live).toMatch(/insert into race_entries/i);
  });

  it('🔴 ① ★料金をレースの行から取っている（★`v_fee := 200` が戻っていない）', () => {
    expect(live, '★料金を直書きしている').not.toMatch(/v_fee\s*:=\s*\d/);
    expect(live, '★レースの行から取っていない').toMatch(/v_fee\s*:=\s*v_race\.entry_fee_ep/);
  });

  it('🔴 ② ★斤量をレースの行から取っている（★`55` が戻っていない）', () => {
    const insert = live.slice(live.search(/insert into race_entries/i));
    expect(insert, '★斤量を直書きしている').not.toMatch(/v_gate,\s*\d+\s*,/);
    expect(insert, '★レースの行から取っていない').toMatch(/v_race\.weight_kg/);
  });

  it('🔴 ③ ★値が無い行は通さない（★R-27・黙って「無料」にしない）', () => {
    expect(live).toMatch(/v_race\.entry_fee_ep\s+is\s+null[\s\S]{0,200}raise\s+exception/i);
    expect(live).toMatch(/v_race\.weight_kg\s+is\s+null[\s\S]{0,200}raise\s+exception/i);
  });

  it('🔴 ④ ★締切も行から取っている（★ED-1・★SQL に時間を直書きしない）', () => {
    /**
     * 🔴 ★旧: `scheduled_at <= now() + interval '60 minutes'`。
     *   ★レースの行が生まれるのは発走の 12 分前（`LOOKAHEAD_RACES` 2 × `CYCLE_MS` 6 分）なので、
     *   ★**どのレースも生まれた瞬間に「締切後」**でした（★照会 Q-ENTRY-1）。
     * ★新: ★**行に書かれた `entry_deadline_at`**（★正は TS の `PHASE_OFFSET_MS.publish`）。
     */
    expect(live, '★SQL に時間を直書きしている').not.toMatch(/interval\s*'[0-9]+\s*minutes?'/i);
    expect(live, '★行の締切を見ていない').toMatch(/now\(\)\s*>=\s*v_race\.entry_deadline_at/);
    expect(live).toMatch(/v_race\.entry_deadline_at\s+is\s+null[\s\S]{0,200}raise\s+exception/i);
  });
});

describe('★EF-2: ワーカーが TS の定数を書いている', () => {
  const src = readFileSync(path.join(ROOT, 'apps/worker/src/pg-store.ts'), 'utf8');

  it('★レースを作るとき、定数を渡している', () => {
    expect(src).toMatch(/ENTRY_FEE_EP/);
    expect(src).toMatch(/BASE_WEIGHT_KG/);
    expect(src).toMatch(/entry_fee_ep,\s*weight_kg/);
    /** ★締切も行に書く（★ED-1） */
    expect(src).toMatch(/entry_deadline_at/);
    expect(src).toMatch(/spec\.entryDeadlineAtMs/);
  });

  it('🔴 ★別の数を書いていない（★定数を通している）', () => {
    /**
     * ⚠️ ★**リテラル一致では見ません** — ★`55` は `substring(0, 55)` のような所にも出ます。
     *    ★「★定数を渡す行があるか」を見ます（★D-108 ③ の作法）。
     */
    // ⚠️ ★**引数の並びは `on conflict` の**後ろ**にあります**（★SQL の文字列の外）。
    //    ★旧版は `+ 800` で足りると思っていましたが、★註記が長くて届いていませんでした。
    const from = src.search(/insert into races \(/);
    const call = src.slice(from);   // ★引数の並びまで残らず見る
    expect(call, '★出走料の定数を渡していない').toContain('ENTRY_FEE_EP');
    expect(call, '★斤量の定数を渡していない').toContain('BASE_WEIGHT_KG');
  });
});

describe('★EF-3: 画面が自分で持っていない', () => {
  /** ★`apps/web/src` の全 `.ts` / `.tsx` */
  function webFiles(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir)) {
      const f = path.join(dir, e);
      if (statSync(f).isDirectory()) out.push(...webFiles(f));
      else if (/\.tsx?$/.test(e)) out.push(f);
    }
    return out;
  }

  it('🔴 ★画面が出走料・斤量の定数を引いていない（★公開ビューから読む）', () => {
    const files = webFiles(path.join(ROOT, 'apps/web/src'));
    expect(files.length, '★画面の走査が空（R-21）').toBeGreaterThan(20);
    /**
     * ★**「どの口を引いているか」**で見ます（★数のリテラルでは見ません — ★`200` も `55` も
     * ★`borderRadius` や `height` に普通に出ます。★2026-09-16 にそれで誤検出しました）。
     * ⚠️ ★画面が `ENTRY_FEE_EP` を import すると、★**サーバーが行に書いた値と食い違う日**が来ます
     *    （★レースごとに違う額にした瞬間）。★**行を読ませます。**
     */
    const offenders = files.filter((f) => {
      const s = readFileSync(f, 'utf8');
      return /\bENTRY_FEE_EP\b/.test(s) || /\bBASE_WEIGHT_KG\b/.test(s);
    });
    expect(offenders.map((f) => path.relative(ROOT, f)), '★画面が定数を引いている').toEqual([]);
  });
});

describe('★EF-1: TS 側の写しが 1 つになっている', () => {
  it('🔴 ★`race-field.ts` が斤量を直書きしていない（★旧は 3 か所）', () => {
    const src = readFileSync(path.join(ROOT, 'apps/cli/src/race-field.ts'), 'utf8');
    expect(src, '★定数を引いていない').toMatch(/BASE_WEIGHT_KG/);
    /** ★`weightKg` / `baseWeightKg` に数を直書きしていない */
    expect(src, '★weightKg に数を直書きしている').not.toMatch(/weightKg:\s*\d/i);
    expect(src, '★baseWeightKg に数を直書きしている').not.toMatch(/baseWeightKg:\s*\d/i);
  });
});


/**
 * ★**出走登録の門番**（★EN-1・EN-2・EN-3・2026-09-19）
 *   ★裁定 `REVIEW_ENTRY_GUARDS_VERDICT_20260919.md`
 */
describe('★EN-1: 所有馬は生成プールに入らない', () => {
  const repo = readFileSync(path.join(ROOT, 'apps/worker/src/horse-repo.ts'), 'utf8');

  it('🔴 ★`loadRaceablePool` が `owner_id is null` で絞っている', () => {
    /**
     * 🔴 ★旧は絞っておらず、★**登録していない自分の馬が窓に選ばれて勝手に出走**しました
     *    （★料金も脚質も騎手も無し）。★正典 1318「残りを **NPC 馬で充填**」。
     */
    /**
     * ⚠️ 🔴 ★**2026-09-19・PO-2 で述語を `RACEABLE_WHERE` に切り出しました**。
     *    ★SQL の文字列を直に見ると、★**切り出した日に黙って空振りします**。
     *    → ★**述語の定義の側**を見て、★**読む側がそれを引いていること**も併せて見ます。
     */
    /**
     * 🔴 ★**終わりは「次の定数の名前」で探さないこと**（★2026-09-19・PO-4 で踏みました）。
     *    ★`RACEABLE_POOL_LIMIT` を ★**上の註記の中に書いた**瞬間、★終わりが始まりより前に来て
     *    ★走査が空になりました。★`length > 50` の番人（R-21）が拾いましたが、
     *    ★**註記を書いただけでテストが落ちる**のは検査の側の弱さです。
     *    → ★**宣言そのものの終わり**（★テンプレート文字列を閉じる `` `; ``）まで取ります。
     */
    const start = repo.indexOf('const RACEABLE_WHERE');
    const where = repo.slice(start, repo.indexOf('`;', start) + 2);
    expect(where.length, '★述語の定義が読めていない（★走査が空・R-21）').toBeGreaterThan(50);
    expect(where, '★所有馬を除いていない').toContain('owner_id is null');
    const fnAt = repo.indexOf('export async function loadRaceablePool');
    expect(fnAt, '★`loadRaceablePool` の宣言が見つからない').toBeGreaterThan(-1);
    const fn = repo.slice(fnAt);
    /**
     * ⚠️ ★**下に否定の表明があります**（`not.toContain('where: string = RACEABLE_WHERE')`）。
     *    ★切り出しが空なら ★**素通しで緑**になるので、★先に空でないことを確かめます（★CK-4）。
     */
    expect(fn.length, '★切り出しが空（★下の否定の表明が素通しになる）').toBeGreaterThan(200);
    /**
     * ⚠️ ★**2026-09-19・AL-11 で述語に差し替え口を付け、★PO-4 ① で既定を差し替えました**。
     *    ★旧の既定 … `RACEABLE_WHERE`（`generation >= max-2` を含む）
     *    ✅ ★新の既定 … ★**`ACTIVE_WHERE`**（`retired_at_week is null and owner_id is null` だけ）
     *
     *    🔴 ★理由は V ではありません — ★**`generation` が「現役」を意味していなかった**（PO-4）。
     *      ✔ 差 2,944 頭はまるごと `generation` の 1 行／`birth_week` は全頭 −160。
     *      ✔ V-4 は入れた後（＝ D）で **31.006%・下限まで 6.9 SE・PASS**（VP-9）。
     *      ⚠️ ★**「V は動かない」とは言えません**（A→D は 2.04σ）。★「入れた結果 D になった」まで。
     *
     *    → ★見るのは 2 つ: ★① 引いているのは引数（★SQL の写しではない）
     *                      ★② ★**既定が意図した述語である**（★黙ってすり替わっていない）
     */
    expect(fn, '★読む側が述語を引いていない（★SQL を書き起こしている？）').toContain('${where}');
    expect(fn, '🔴 ★既定が `ACTIVE_WHERE` でない（★PO-4 ① が戻されている？）')
      .toContain('where: string = ACTIVE_WHERE');
    /** ★対照: ★旧の既定に戻っていない（★黙って `generation` の絞りが復活していない） */
    expect(fn, '🔴 ★既定が RACEABLE_WHERE に戻っている').not.toContain('where: string = RACEABLE_WHERE');
    /**
     * ★引退の除外（CL-3）は ★**どちらの述語にも**残っていること。
     * ⚠️ ★`where` は `RACEABLE_WHERE` の本文を切り出したもの（上）。★`ACTIVE_WHERE` も併せて見ます。
     */
    expect(where, '★引退馬を除いていない（RACEABLE_WHERE）').toContain('retired_at_week is null');
    const activeStart = repo.indexOf('export const ACTIVE_WHERE');
    expect(activeStart, '★`ACTIVE_WHERE` が見つからない').toBeGreaterThan(-1);
    const active = repo.slice(activeStart, repo.indexOf('`;', activeStart) + 2);
    expect(active.length, '★`ACTIVE_WHERE` の切り出しが空').toBeGreaterThan(20);
    expect(active, '★引退馬を除いていない（ACTIVE_WHERE）').toContain('retired_at_week is null');
    expect(active, '🔴 ★所有馬を除いていない（★プレイヤーの馬が NPC の充填に混ざる・EN-1）')
      .toContain('owner_id is null');
    expect(active, '🔴 ★`generation` の絞りが混ざっている（★PO-4 ① で外したもの）')
      .not.toContain('generation');
  });
});

describe('★EN-2: 権限の検査が冪等の検査より前にある', () => {
  const { body } = lastEnterRace();
  const live = stripComments(body);

  it('🔴 ★「自分の馬か」が、再送の早期 return より前にある', () => {
    /**
     * 🔴 ★旧は後ろにあり、★**他人の馬の id を渡すと例外なしでその行の id が返って**いました
     *    （★`security definer` なので RLS も効きません）。
     * ★**権限の検査は、何よりも先に。**
     */
    const owner = live.indexOf('自分の馬ではありません');
    const idempotent = live.indexOf('if found then return v_entry_id');
    expect(owner, '★所有の検査が見つからない').toBeGreaterThan(0);
    expect(idempotent, '★冪等の早期 return が見つからない').toBeGreaterThan(0);
    expect(owner, '★所有の検査が冪等の後ろにある').toBeLessThan(idempotent);
  });

  it('★引退の検査も前にある（★同じ理由）', () => {
    const retired = live.indexOf('引退した馬は登録できません');
    const idempotent = live.indexOf('if found then return v_entry_id');
    expect(retired).toBeGreaterThan(0);
    expect(retired).toBeLessThan(idempotent);
  });
});

describe('★EN-3: `client_token` を要求して捨てていない', () => {
  const { body } = lastEnterRace();
  const live = stripComments(body);

  it('🔴 ★記録している（★宣言している鍵と、効いている鍵を一致させる第一歩）', () => {
    /**
     * 🔴 ★旧は `p_client_token` が **2 か所**（宣言／null なら raise）にしか出ず、
     *    ★**どこにも保存されていません**でした。★効いていた鍵は `(race_id, horse_id)`。
     *    ★この食い違いが、★`0039` で**存在しない列を参照する書き換え**を招きました。
     */
    expect(live, '★client_token を保存していない').toMatch(/insert into race_entries[\s\S]{0,300}client_token/);
    expect(live, '★値を渡していない').toMatch(/p_client_token\s*\)/);
  });

  it('★列と一意索引がある（★`bets` と同じ形）', () => {
    const all = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
      .map((f) => stripComments(readFileSync(path.join(MIGRATIONS, f), 'utf8'))).join('\n');
    expect(all).toMatch(/alter table race_entries add column if not exists client_token uuid/i);
    expect(all, '★一意索引が無い').toMatch(/unique index[\s\S]{0,120}race_entries \(horse_id, client_token\)/i);
    /** ★生成が作った行（null）を縛らない */
    expect(all).toMatch(/race_entries \(horse_id, client_token\) where client_token is not null/i);
  });
});
