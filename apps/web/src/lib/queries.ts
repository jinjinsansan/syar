/**
 * 読み取り専用のデータ層（正典 §14.3・§15.2）
 *
 * 【★ここに置いてはいけないもの】
 *   §14.3 は Vercel について「**フロントと読み取り系だけ**」と定め、
 *   レース生成・確定・オッズのモンテカルロ・**ビジネスロジックの実装**を禁じています
 *   （§15 の理由でアプリ化時に全部書き直しになる）。
 *   → ここは**問い合わせと整形だけ**。計算も判定も持ちません。
 *
 * 【★anon キーで届く範囲だけを読む】
 *   `races` 実体テーブルは revoke 済みなので、**必ず `races_public` を使います**。
 *   実体を読もうとすると permission denied になります（A-4 で実証済み）。
 *   ⚠️ ここで service_role キーを使わないこと。RLS を素通りします。
 */

/** `races_public` の行（★`server_seed` は含まれない） */
export interface PublicRace {
  readonly id: string;
  readonly name: string;
  readonly grade: string | null;
  readonly class_rank: number;
  readonly surface: string;
  readonly distance: number;
  readonly track_condition: string;
  readonly course_id: string;
  readonly scheduled_at: string;
  /** 発走前に公開される（§8.6） */
  readonly seed_commit: string;
  /** ★確定後のみ非 null（§8.6・A-4） */
  readonly seed_reveal: string | null;
  readonly status: string;
  readonly purse: number;
}

export interface RaceEntryRow {
  readonly gate: number;
  readonly horse_name: string;
  readonly strategy: string;
  readonly weight: number;
  readonly popularity: number | null;
  readonly finish_pos: number | null;
}

export interface OddsRow {
  readonly bet_type: string;
  readonly selection: number[];
  readonly odds: number;
  readonly capped: boolean;
}

/** Supabase クライアントの最小インターフェース（注入する。ここで作らない） */
export interface ReadClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: unknown): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
      order(col: string, opts?: { ascending?: boolean }): {
        limit(n: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
  };
}

async function unwrap<T>(p: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const r = await p;
  // ★エラーを黙って空配列にしない。空と失敗を区別できなくなる（R-21 と同じ形）
  if (r.error !== null) throw new Error(`読み取りに失敗: ${r.error.message}`);
  return (r.data ?? []) as T[];
}

/** 発売中・発走待ちのレース一覧 */
export function upcomingRaces(client: ReadClient, limit = 12): Promise<PublicRace[]> {
  return unwrap<PublicRace>(
    client.from('races_public').select('*').order('scheduled_at', { ascending: true }).limit(limit),
  );
}

/** 出馬表 */
export function raceEntries(client: ReadClient, raceId: string): Promise<RaceEntryRow[]> {
  return unwrap<RaceEntryRow>(
    client.from('race_entries_public').select('*').eq('race_id', raceId),
  );
}

/** オッズ */
export function raceOdds(client: ReadClient, raceId: string): Promise<OddsRow[]> {
  return unwrap<OddsRow>(client.from('race_odds_public').select('*').eq('race_id', raceId));
}
