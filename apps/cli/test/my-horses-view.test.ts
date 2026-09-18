/**
 * ★**自分の馬のビュー**（`0034`・UI-1 の前提・裁定 `REVIEW_UI_WIRING_VERDICT_20260918.md`）
 *
 * 【★見ている壊れ方】
 *   🔴 ★**素質が漏れる** — `potential` / `genotype` / ★**`stats`** / `unlock_rate` / 適性の生値 /
 *      ★`birth_snapshot`（★誕生時の potential の写し）が画面に出る。
 *      → ★**オッズは `stats` から作られる**ので（`build-race.ts` の `abilityOf`）、
 *        ★数値で出すと ★**D-114「強さの手がかりはオッズと戦績だけ」が無効**になります。
 *   🔴 ★**他人の馬が見える**（`owner_id = auth.uid()` の絞りが消える）
 *   🔴 ★**anon に開く**
 *   🔴 ★**`horses` に列を足したとき、黙ってビューに入る／黙って落ちる**
 *
 * 【★どう見るか】★**禁止語の一覧では書きません**（D-108 ③・★D-098 の検査で踏んだ穴）。
 *   ★**`horses` の全列を移行ファイルから組み立て**、★**1 列ずつ「出す」か「出さない」かに分類されていること**を要求します
 *   （★R-29「既定を閉じて、必要なものだけ開ける」。★列を足した人は、どちらかに入れるまで通れません）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const DIR = path.join(ROOT, 'db/migrations');
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const sqlOf = (f: string): string => readFileSync(path.join(DIR, f), 'utf8');
/** ★`--` のコメントを空白に（★コメントの中の語を拾わない） */
const blank = (s: string): string => s.replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));

const VIEW_FILE = '0034_my_horses_view.sql';

/** ★`horses` の全列（★`create table` ＋ 後から足した `alter table` を移行ファイルから集める） */
function horsesColumns(): Set<string> {
  const out = new Set<string>();
  for (const f of files) {
    const sql = blank(sqlOf(f));
    const create = /create table if not exists horses\s*\(([\s\S]*?)\n\);/i.exec(sql);
    if (create !== null) {
      for (const line of create[1]!.split('\n')) {
        const m = /^\s{2}([a-z0-9_]+)\s+[a-z]/.exec(line);
        if (m !== null && !/^(constraint|primary|unique|check|foreign)$/.test(m[1]!)) out.add(m[1]!);
      }
    }
    for (const m of sql.matchAll(/alter table horses\s+add column(?:\s+if not exists)?\s+([a-z0-9_]+)/gi)) {
      out.add(m[1]!);
    }
  }
  return out;
}

/** ★ビューが選んでいる列（★`h.<列>` の形で書く約束にしている） */
function viewColumns(): Set<string> {
  const sql = blank(sqlOf(VIEW_FILE));
  const body = /create or replace view my_horses as([\s\S]*?)from horses h/i.exec(sql);
  expect(body, '★ビューの本体が読めません（書き方を変えたら、この検査も直すこと）').not.toBeNull();
  return new Set([...body![1]!.matchAll(/\bh\.([a-z0-9_]+)/g)].map((m) => m[1]!));
}

/**
 * ★**出さないと決めた列**（★裁定の一覧 ＋ 開発側が実在を確かめて足したもの）。
 * ⚠️ ★これは「禁止語」ではなく ★**分類簿**です — ★下の検査が「全列がどちらかに入っていること」を要求します。
 */
const EXCLUDED: Readonly<Record<string, string>> = {
  genotype: '★遺伝子そのもの（§5.5）',
  potential: '★素質（D-114）',
  stats: '★現在能力。★オッズはここから作られる（build-race.ts の abilityOf）— 出すと D-114 が無効になる',
  unlock_rate: '★potential × unlock_rate = stats なので割り戻せる',
  birth_snapshot: '★誕生時の potential/stats/durability/temper の写し（0012 の註記）',
  surface_aptitude: '★適性の生値（★発見度 D-108 が「走って分かる」ものにしている）',
  distance_center: '★同上',
  distance_range: '★同上',
  strategy_aptitude: '★同上',
  heavy_aptitude: '★同上',
  growth: '★成長型（素質の一部）',
  temper: '★気性（§7.2 の内部状態）',
  durability: '★丈夫さ（素質の一部）',
  frail: '★虚弱（素質の一部）',
  skill_genes: '★スキル遺伝子（§5.5）',
  inbreed_coeff: '★近交係数（★配合の内部量）',
  nicks_multiplier: '★ニックス係数（★同上）',
  npc_stable_id: '★自分の馬では必ず null（★NPC 厩舎の識別子）',
};

describe('0034 自分の馬のビュー（UI-1 の前提）', () => {
  it('🔴 ★素質に類するものを 1 つも出していない', () => {
    const view = viewColumns();
    for (const col of Object.keys(EXCLUDED)) {
      expect(view.has(col), `★${col} がビューに出ています（${EXCLUDED[col]}）`).toBe(false);
    }
  });

  it('🔴 ★`horses` の全列が「出す」か「出さない」かに分類されている（★列を足したら止まる・R-29）', () => {
    const all = horsesColumns();
    const view = viewColumns();
    // ★検出器が空振りしていないこと（★0 件を「該当なし」と読まない・R-21）
    expect(all.size, '★horses の列が読めていません').toBeGreaterThan(20);
    expect(view.size, '★ビューの列が読めていません').toBeGreaterThan(10);

    const unclassified = [...all].filter((c) => !view.has(c) && EXCLUDED[c] === undefined);
    expect(
      unclassified,
      `★分類されていない列があります。★ビューに足すか、EXCLUDED に理由つきで載せてください:\n  ${unclassified.join('\n  ')}`,
    ).toEqual([]);
  });

  it('★自分の馬だけを返す（★他人の馬が見えない）', () => {
    const sql = blank(sqlOf(VIEW_FILE));
    expect(sql).toMatch(/where\s+h\.owner_id\s*=\s*auth\.uid\(\)/i);
  });

  it('★anon には出さない・authenticated にだけ select を与える', () => {
    const sql = blank(sqlOf(VIEW_FILE));
    expect(sql).toMatch(/revoke\s+all\s+on\s+my_horses\s+from\s+public,\s*anon/i);
    expect(sql).toMatch(/grant\s+select\s+on\s+my_horses\s+to\s+authenticated/i);
    // ★anon に grant していないこと
    expect(sql).not.toMatch(/grant[^;]*on\s+my_horses[^;]*anon/i);
  });

  it('★血統と戦績は出している（★D-114 が「手がかり」と名指ししたもの・§1.1 の中核）', () => {
    const view = viewColumns();
    for (const col of ['sire_line', 'dam_sire_line', 'pedigree_cache', 'g1_wins', 'condition', 'fatigue']) {
      expect(view.has(col), `★${col} が出ていません`).toBe(true);
    }
  });
});
