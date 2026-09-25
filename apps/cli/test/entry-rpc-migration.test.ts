/**
 * ★**出走登録の RPC・§9.5 の是正・生涯の記録の移行**（★ゲーム本体 第 3 便・2026-09-16・移行 `0024`）
 *
 * 【★見ている壊れ方】
 *   ① ★`place_bet` が「自馬のどれか 1 頭を含めばよい」に戻る（★2 頭出したときに**片方だけを含む買い目**が通る）
 *      → ★裁定 `REVIEW_GAME_BODY_1_VERDICT_20260916.md` §5: **八百長利得の遮断装置**が緩む
 *   ② ★出走登録が**同じレースに 3 頭目**を通す（D-104・T-7'）
 *   ③ ★騎手の凍結・料金の記帳が抜ける（D-105 ②④）
 *   ④ ★生涯の記録が**利用者から書ける**（LR-1「消さない」を、利用者の delete で破れる形にしない）
 *
 * 【★見方】★移行の SQL を**最後の定義**で見ます（★同じ関数が再定義されるため・`rpc-guard.test.ts` と同じ作法）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const DIR = path.join(ROOT, 'db/migrations');
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const sqlOf = (file: string): string => readFileSync(path.join(DIR, file), 'utf8');
/** ★`--` のコメントを空白に（★コメントの中の語を拾わない。位置は保つ） */
const blank = (sql: string): string => sql.replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));

/** ★その関数の「最後の定義」の本文 */
function lastDefinitionOf(name: string): { file: string; body: string } {
  let found: { file: string; body: string } | undefined;
  for (const file of files) {
    const sql = sqlOf(file);
    const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${name}\\s*\\(`, 'gi');
    const hits = [...blank(sql).matchAll(re)];
    for (let i = 0; i < hits.length; i += 1) {
      const start = hits[i]!.index!;
      const next = [...blank(sql).matchAll(/create\s+(?:or\s+replace\s+)?function\s/gi)]
        .map((m) => m.index!)
        .find((idx) => idx > start);
      found = { file, body: sql.slice(start, next ?? sql.length) };
    }
  }
  if (found === undefined) throw new Error(`${name} の定義が見つかりません`);
  return found;
}

const MIGRATION = '0024_entry_rpc_and_story.sql';

describe('★第 3 便の移行（0024）', () => {
  it('① ★place_bet の最後の定義は「自馬を全頭含む」になっている（§9.5-3）', () => {
    const def = lastDefinitionOf('place_bet');
    /**
     * ⚠️ 🔴 ★**ファイル名を名指しで固めていました**（★`toBe(MIGRATION)`・★2026-09-19 に改めました）。
     *    ★このファイルの `enter_race` 側で ★**同じ形を直したときに、★こちらを見落としました**。
     *    ★**「1 か所直した」は「その 1 か所を直した」だけ**です。
     *    → ★`place_bet` は `0002` → `0020` → `0024` と重なっています。
     *      ★見るべきは ★**`0020`（セットアップ判定を入れた便）より後にある**ことだけです。
     */
    expect(def.file.localeCompare('0020_rpc_setup_guard.sql') > 0, `★最後の定義が ${def.file}`).toBe(true);
    /** ★「含まない自馬が 1 頭でもあれば拒否」の形（★どれか 1 頭でよい形では無いこと） */
    expect(def.body).toMatch(/not\s*\(\s*p_selection\s*@>\s*to_jsonb\(e\.gate\)\s*\)/i);
    expect(def.body).toMatch(/自馬を全頭含む/);
    /** ★D-080: 先頭のセットアップ判定が残っている（★土台から写しているか） */
    expect(def.body).toMatch(/assert_setup_complete\(\)/);
    /**
     * 🔴 ★**2026-09-19・BT-1/BT-2 で上限の場所が変わりました**。
     *   ★旧: ★`place_bet` に 4 つの数が直書きされていることを**要求**していました。
     *   ★新: ★**数は `bet_limits`、規則は `bet_allowance()`** — ★直書きが**無いこと**を要求します。
     *   ★土台を写せずに書いてしまった場合は、★**`bet_allowance()` の呼び出しが消える**ので捕まえられます。
     */
    const live = def.body.replace(/--[^\n]*/g, ' ');
    for (const cap of ['30000', '50000', '500000']) {
      expect(live, `★上限 ${cap} が直書きに戻っている`).not.toContain(cap);
    }
    expect(live, '★bet_allowance() を呼んでいない').toMatch(/bet_allowance\(/);
  });

  it('② ★出走登録は同じレースに 2 頭まで（3 頭目を拒否）・引退馬と締切を見る', () => {
    const def = lastDefinitionOf('enter_race');
    /**
     * ★**最後の定義がどこにあるか**（★`create or replace` は重なるので、★最後だけが効きます）。
     *   ★`0024`（初版）→ `0033`（CL-4・出走資格）→ `0039`（EF-2・出走料と斤量の直書きをやめた）。
     *   ★既存のファイルは書き換えていません（`migrate.mjs` が適用済みファイルの改変を拒みます）。
     *
     * ⚠️ ★**ファイル名を名指しで固めません**（★2026-09-19 に改めました）。
     *    🔴 ★旧は `'0033_race_class_eligibility.sql'` と書いており、★**次の便で必ず落ちます**。
     *    ★落ちたときに★**数字を書き換えるだけ**になるので、★検査として働いていません。
     *    → ★**見るべきは「どのファイルか」ではなく「何を持っているか」**です（★下の各行）。
     *    ★ここでは ★**`0024` より後にある**（★資格の無い初版に戻っていない）ことだけを見ます。
     */
    expect(def.file.localeCompare('0024_entry_rpc_and_story.sql') > 0, `★最後の定義が ${def.file}`).toBe(true);
    expect(def.body).toMatch(/assert_setup_complete\(\)/);
    /** ★2 頭まで（★`>= 2` で 3 頭目を拒否） */
    expect(def.body).toMatch(/v_mine\s*>=\s*2/);
    expect(def.body).toMatch(/2 頭まで/);
    /** ★引退した馬は登録できない */
    expect(def.body).toMatch(/retired_at_week\s+is\s+not\s+null/i);
    /**
     * ★**締切を見ている**（§10.4）。
     *
     * 🔴 ★旧: `toMatch(/60 minutes/)`。★**2026-09-19・ED-1 で `interval '60 minutes'` は消えました**
     *    （★締切はレースの行に書かれた `entry_deadline_at`・移行 `0041`）。
     * ⚠️ 🔴 ★**それでも ED-1 の便では緑のままでした** —
     *    ★`0041` の★**註記に「旧は `interval '60 minutes'`」と書いた**ので、
     *    ★`def.body`（★註記を含む）に一致していました。
     *    ★**緑だったのは狙った機構ではなく、註記の文字列です**。
     *    → ★`0042` で註記が消えて初めて落ちました。
     * → ★**註記を落としてから、★いまの規則を見ます**。
     */
    const live = def.body.replace(/--[^\n]*/g, ' ');
    expect(live, '★締切を行から読んでいない').toMatch(/now\(\)\s*>=\s*v_race\.entry_deadline_at/);
    expect(live, '★SQL に時間を直書きしている').not.toMatch(/interval\s*'[0-9]+\s*minutes?'/i);
  });

  it('★② -b 出走資格を見る（★CL-4・2026-09-18）', () => {
    const def = lastDefinitionOf('enter_race');
    /**
     * ★レースに保存された範囲と、★**勝数**を比べる。
     *
     * ⚠️ ★2026-09-25 に ★**書き方を変えました**。
     *    ★旧は ★`finish_pos = 1` が本文に在ることを見ていました。
     *    ★`0088` で ★数え方を ★`horse_wins()`（`0086`）に寄せたので、★本文に式は在りません。
     *    → ★**関数を呼んでいること**を見ます。
     *    ★これは ★**CL-4 そのもの**の担保です（★画面 `my_horses` と ★同じ関数でなければ、
     *    ★画面が「出られる」と言った馬が ★ここで弾かれます）。
     *    ★両方が同じ関数を呼んでいることは ★`horse-record-one-place.test.ts` が見ます。
     */
    expect(def.body, '★勝数は horse_wins() を呼ぶこと（★0086 に寄せた）')
      .toMatch(/horse_wins\(p_horse_id\)/);
    expect(def.body).toMatch(/v_race\.min_wins/);
    expect(def.body).toMatch(/v_race\.max_wins/);
    /** 🔴 ★資格の情報が無いレースは**通さない**（★R-27: 分からないなら狭い側） */
    expect(def.body).toMatch(/min_wins\s+is\s+null/i);
    expect(def.body).toMatch(/出走資格の情報がありません/);
    /** ★画面が区別できるよう、資格の拒否には専用の errcode を付ける */
    expect(def.body).toMatch(/errcode\s*=\s*'ST002'/);
    /**
     * 🔴 ★**段の定義（勝利数 → クラス）を SQL に写していないこと**（★D-052）。
     *   ★`class_rank = 2 なら 1 勝` のような表がここに現れたら、★二重帳簿になっています。
     */
    expect(def.body).not.toMatch(/class_rank/);
    expect(def.body).not.toMatch(/maiden|win1|win2|win3/);
  });

  it('③ ★騎手は凍結して保存し、料金は EP の台帳の語で記帳する（D-105 ②④）', () => {
    const def = lastDefinitionOf('enter_race');
    /** ★凍結をそのまま列へ */
    expect(def.body).toMatch(/jockey_frozen/);
    /** ★料金は登録料 ＋ 騎手の料金 */
    expect(def.body).toMatch(/feeEP/);
    /** ★記帳は EP の台帳の閉じた語（`0001` の CHECK にある語） */
    expect(def.body).toMatch(/'entry_fee'/);
    /** ★PP に触れない（★賞金からの差し引きにしない） */
    expect(def.body).not.toMatch(/pp_ledger|prize_points/);
  });

  it('④ ★生涯の記録は利用者から書けない（読み取りだけ・LR-1/LR-6）', () => {
    const sql = sqlOf(MIGRATION);
    expect(sql).toMatch(/create table if not exists horse_story_event/i);
    /** ★書き込みは剥がす（★利用者の delete で記録が消えない） */
    expect(sql).toMatch(/revoke\s+insert,\s*update,\s*delete,\s*truncate\s+on\s+horse_story_event\s+from\s+anon,\s*authenticated/i);
    /**
     * 🔴 ★**2026-09-18 に反転しました**（裁定 `REVIEW_ANON_EXPOSURE_VERDICT_20260918.md` AE-3）。
     *
     * ★以前ここは `grant select on horse_story_event to anon, authenticated` を**要求**していました
     *   （★「読み取りは誰でも・LR-6『他人の馬の物語も見える』」という理由で）。
     *
     * ★**要求してはいけません。** 理由:
     *   ① ★`0018_lock_public_grants.sql:52` が「**実体テーブルには一切 grant しない**」と宣言している
     *   ② ★V-20 ② の合格条件は「**公開ビューとして明示登録されたもの以外は anon から 0 行**」で、
     *      ★**中身の性質ではなく、ビューとして登録されているか**で書かれている（正典 1654 行）
     *   ③ ★`detail` は `jsonb` なので、★**列を足さなくても中身が増える**
     *
     * ★**LR-6 は取り下げていません** — ★公開が要るようになったら
     *   ★**`*_public` ビューを作ります**（正典 410 行・`races_public` と同じ形）。
     *   ★今は `apps/web` がこの表を 1 度も読んでいません（✔ 裁定 §1 の実測）。
     *
     * ⚠️ ★**この検査が、書いた瞬間の誤りを 3 便続けて凍結していました**（裁定 §3）。
     *    ★移行ファイルの文字列を写す検査は「あるべき姿」を書くもので、「今そうなっている姿」ではありません。
     */
    expect(blank(sqlOf('0032_close_anon_table_grants.sql'))).toMatch(
      /revoke\s+all\s+on\s+horse_story_event\s+from\s+anon,\s*authenticated/i,
    );
    /** ★文章そのものは保存しない（★種類と値だけ。文は storyLineOf が組み立てる・LR-4） */
    expect(sql).not.toMatch(/\btext_ja\b|\bsentence\b|\bstory_text\b/i);
  });

  it('⑤ ★厩舎の格は既定がブロンズ（★格を入れる前と同じ振る舞い・D-103）', () => {
    const sql = sqlOf(MIGRATION);
    expect(sql).toMatch(/add column if not exists stable_grade text not null default 'bronze'/i);
    expect(sql).toMatch(/check \(stable_grade in \('bronze', 'silver', 'gold'\)\)/i);
    /** ★素質（potential）に触っていない */
    expect(sql).not.toMatch(/update horses set potential/i);
  });
});
