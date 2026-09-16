/**
 * ★V-20 の登録簿 — public スキーマの全オブジェクトの「期待される姿」
 *
 * 【なぜ登録簿なのか（V-20 ③・これが本体）】
 *   手書きの「危ないテーブル一覧」は**必ず漏れます**。そして漏れたものは
 *   **「守りが無い」ことが「まだデータが無い」ことに隠れて**、何も鳴らないまま開きます
 *   （`users` がまさにそれでした — 0行なので安全に見えていた）。
 *
 *   → **`information_schema` を全走査し、この登録簿と突き合わせる。**
 *     **ここに無いテーブルが現れたら落ちる。** 新しいテーブルを黙って足せなくする。
 *
 *   ★同じ結論に `tools/lib/classification.mjs`（ツールの分類）が先に到達しています。
 *     あちらは「ツールを足したら分類を書け」、こちらは「テーブルを足したら姿を書け」。
 *
 * 【区分】
 *   public_view  … 公開ビュー。anon が select できてよい（§14.3「読み取りはビュー経由に一本化」）
 *   owner_scoped … authenticated に select のみ。RLS のポリシーが「自分の行だけ」に絞る
 *   closed       … anon / authenticated に一切の権限を与えない
 *
 * 【★どの区分でも共通の不変条件】
 *   **anon / authenticated に insert / update / delete / truncate を付与しない。**
 *   書き込みは例外なく `security definer` の RPC 経由（憲法 §0.2-4 サーバー権威）。
 *   ⚠️ **truncate は RLS の対象外**です。ポリシーがあっても止まりません
 *      （`0002` が `insert, update, delete` だけを revoke し、**truncate が残っていた**）。
 */

export const PUBLIC_VIEW = 'public_view';
export const OWNER_SCOPED = 'owner_scoped';
export const CLOSED = 'closed';

/** @type {Readonly<Record<string, 'public_view'|'owner_scoped'|'closed'>>} */
export const EXPECTED_EXPOSURE = {
  // ── 公開ビュー（未ログインでも見える。§12.2 の番組表・出馬表・オッズ） ──
  races_public: PUBLIC_VIEW,
  race_entries_public: PUBLIC_VIEW,
  race_odds_public: PUBLIC_VIEW,
  prize_catalog_public: PUBLIC_VIEW,

  // ── 本人スコープ（RLS のポリシーで自分の行だけ。select のみ） ──
  // ★users は revoke all にしない（S-2: revoke が勝ってポリシーが打ち消され、
  //   利用者が自分の履歴を永久に見られなくなった事故と同型を避ける）
  users: OWNER_SCOPED,
  bets: OWNER_SCOPED,
  ep_ledger: OWNER_SCOPED,
  pp_ledger: OWNER_SCOPED,
  prize_exchanges: OWNER_SCOPED,

  // ── 閉鎖（クライアントが直接読む理由がない） ──
  // 実体テーブルは公開ビュー経由でのみ読ませる
  races: CLOSED,
  race_entries: CLOSED,
  race_odds: CLOSED,
  prize_catalog: CLOSED,
  // ★horses は potential / genotype を持つ（§12.4「本人にも数値を見せない」・§5.5）
  horses: CLOSED,
  // ★どの LINE アカウントがどの口座かの対応表（D-078）。本人にも見せる理由がない
  user_identities: CLOSED,
  // レース生成の入力。書き換えられると §8.6 の証明の前提が崩れる
  npc_stables: CLOSED,
  // 育成の内部状態（gain / fatigue / condition / injury_prob）
  horse_week_log: CLOSED,
  // V-11 の経済監視データ
  point_flow_daily: CLOSED,
  unlock_daily: CLOSED,
  // 運用のメタ情報
  app_environment: CLOSED,
  schema_migrations: CLOSED,
};

/** 登録簿に無いものを返す（V-20 ③） */
export function unregistered(objectNames) {
  return objectNames.filter((n) => EXPECTED_EXPOSURE[n] === undefined);
}

/** 登録簿にあるが DB に無いもの（消したのに登録簿を直し忘れた形） */
export function stale(objectNames) {
  const present = new Set(objectNames);
  return Object.keys(EXPECTED_EXPOSURE).filter((n) => !present.has(n));
}

/**
 * ★書き込みとみなす権限（V-20 ①）
 *
 * ⚠️ **`TRUNCATE` を必ず含めること。** `0002` は `insert, update, delete` だけを剥奪し、
 *    **`TRUNCATE` を残していました**。そして **`TRUNCATE` は RLS の対象外**なので、
 *    「自分の行だけ」のポリシーがあっても**台帳を全消しできる**状態でした（2026-08-20 実測）。
 *    ★「読み取りが守られている」ことは「破壊が守られている」ことを意味しません。
 */
export const WRITE_PRIVILEGES = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'];

/**
 * V-20 ① — 書き込み権限の付与を探す。
 *
 * @param {ReadonlyArray<{table_name: string, grantee: string, privilege_type: string}>} grants
 * @returns 違反の一覧（空なら合格）
 */
export function judgeGrants(grants) {
  const write = new Set(WRITE_PRIVILEGES);
  return grants
    .filter((g) => write.has(String(g.privilege_type).toUpperCase()))
    .map((g) => `${g.table_name}.${g.privilege_type}(${g.grantee})`);
}

/**
 * V-20 ② — 「anon から何行返ったか」を登録簿と突き合わせる。
 *
 * ★行数が0でも合格とは限りません（無防備でたまたま空なだけかもしれない）が、
 *   ここは**振る舞い側の確認**です。権限側は `judgeGrants` が見ます。**両方要ります。**
 *
 * @param {ReadonlyArray<{name: string, rows: number}>} reads `rows` は -1 なら拒否された
 * @returns {{leaked: string[], viewsUnreadable: string[]}}
 */
export function judgeReads(reads) {
  const leaked = [];
  const viewsUnreadable = [];
  for (const r of reads) {
    const expected = EXPECTED_EXPOSURE[r.name];
    if (expected === PUBLIC_VIEW) {
      // ★公開ビューが読めないのも不合格にする — 守りは閉じる方向に倒れても気づきにくい
      if (r.rows < 0) viewsUnreadable.push(r.name);
    } else if (r.rows > 0) {
      leaked.push(`${r.name}(${r.rows}行)`);
    }
  }
  return { leaked, viewsUnreadable };
}

/**
 * ★V-20 ④ — public の関数の EXECUTE（監査 H-4・指示書 AF-3 §4-1-4・2026-09-14）
 *
 * 【なぜ軸を足すか】
 *   ①〜③はテーブルしか見ていませんでした。**関数の実行権限はテーブルと別に付きます。**
 *   `spend_training_ep` は `0013`・`0014` が public と authenticated だけを剥がし、**anon が抜けていました**。
 *   ①が入ったときと同じく、「全数」と名乗る検査が軸の一つしか走査していなかった形です（D-012）。
 *
 * 【登録簿の形】
 *   key は `pg_proc.oid::regprocedure::text`（例 `spend_training_ep(uuid,bigint,integer)`）。
 *   値は anon / authenticated が EXECUTE を**持つべきか**。
 *   ★**登録簿に無い関数が現れたら落ちます**（③と同じ形。新しい関数を黙って足せない）。
 *
 * 【期待値の出どころ】（指示書 AF-3 §4-1-4。手で推測して書かない）
 *   2026-09-14 **staging の実測**（`0021` 適用後・`pg_proc` の走査・`has_function_privilege`）。
 *   ★`place_bet`・`exchange_prize` の anon は、`0022` で剥がす指示（AUDIT_FIX2 BF-2）に合わせて false にした。
 *     **`0022` を当てるまでは staging でも④が落ちます**。当てた後の実測で確かめる。
 *   ⚠️ 本番は `0021`・`0022` が未適用なので、**本番で回すと④が落ちます**
 *      （それが正しい。適用はオーナーの指示で別に行う）。
 */
/** @type {Readonly<Record<string, {anon: boolean, authenticated: boolean}>>} */
export const EXPECTED_FUNCTION_EXECUTE = {
  // ★ガード自身。利用者の RPC から呼ばれるので authenticated だけ（`0019` が anon を明示的に外している）
  'assert_setup_complete()': { anon: false, authenticated: true },
  // ★利用者が呼ぶ RPC。authenticated だけに実行させる（`0022` で anon を剥がす・照会 Q2・2026-09-14）。
  //   以前は anon に EXECUTE が残っており（`0002`・`0008` は public だけを剥がしていた）、
  //   先頭の `assert_setup_complete()` の検査だけで閉じていた
  'exchange_prize(bigint,uuid)': { anon: false, authenticated: true },
  'place_bet(uuid,text,jsonb,integer,uuid)': { anon: false, authenticated: true },
  // ★出走登録（`0024`・D-104 の「同じレースに 1 人 2 頭まで」と D-105 の騎手の凍結）。
  //   利用者が呼ぶ RPC なので authenticated だけ（`0024` で public・anon を剥がしている）
  'enter_race(uuid,uuid,text,jsonb,uuid)': { anon: false, authenticated: true },
  // ★ワーカー専用（`0021`・D-095 候補）。利用者のロールには実行させない（監査 H-4）
  'spend_training_ep(uuid,bigint,integer)': { anon: false, authenticated: false },
};

/** 登録簿に無い関数を返す（V-20 ④） */
export function unregisteredFunctions(signatures, registry = EXPECTED_FUNCTION_EXECUTE) {
  return signatures.filter((s) => registry[s] === undefined);
}

/** 登録簿にあるが DB に無い関数（消したのに登録簿を直し忘れた形） */
export function staleFunctions(signatures, registry = EXPECTED_FUNCTION_EXECUTE) {
  const present = new Set(signatures);
  return Object.keys(registry).filter((s) => !present.has(s));
}

/**
 * V-20 ④ — 実測の EXECUTE を登録簿と突き合わせる。
 *
 * ★開きすぎ（anon に残っている）も、塞ぎすぎ（利用者の RPC から authenticated を剥がした）も数えます。
 *   守りは閉じる方向に倒れても気づきにくい（`judgeReads` の viewsUnreadable と同じ考え方）。
 *
 * @param {ReadonlyArray<{fn: string, anon: boolean, authenticated: boolean}>} rows
 * @returns 食い違いの一覧（空なら合格）。★未登録の関数はここでは数えない（`unregisteredFunctions` が見る）
 */
export function judgeFunctionExecute(rows, registry = EXPECTED_FUNCTION_EXECUTE) {
  const out = [];
  for (const r of rows) {
    const want = registry[r.fn];
    if (want === undefined) continue;
    for (const role of ['anon', 'authenticated']) {
      const got = Boolean(r[role]);
      if (got !== want[role]) out.push(`${r.fn}.EXECUTE(${role}) 実測=${got} 期待=${want[role]}`);
    }
  }
  return out;
}
