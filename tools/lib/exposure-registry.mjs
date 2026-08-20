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
