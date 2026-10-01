/**
 * ★**小窓テレビの番組に使う 出走馬の詳しい形**（★2026-10-01・R-28）。
 *
 *   ★読むのは ★公開のビューと関数だけ（★`race_entries_public`・`races_public`・`horse_starts`・`horse_wins`）。
 *   ★戦績（出走・勝ち）は ★**数え方の 1 か所**（`horse_starts` / `horse_wins`・D-052・網 `horse-record-one-place`）を呼ぶ。★ここで数えない。
 *   ★最近の着順は ★確定した出走の着順を ★新しい順に 5 つ並べるだけ。
 *   ⚠️ ★1 レースにつき 1 回だけ読む（★帯の 15 秒ごとの読み直しでは読まない・`race-strip.tsx` が レース ID で覚える）。
 *   ⚠️ ★性齢・騎手・父母は ★公開のビューに無い（★他人の馬）→ ★読まない・出さない。
 */
import { readClient } from '../../lib/supabase';

export interface FieldProfile {
  readonly gate: number;
  readonly horseId: string | null;
  readonly strategy: string | null;
  readonly weight: number | null;
  readonly popularity: number | null;
  readonly isMine: boolean;
  readonly starts: number | null;
  readonly wins: number | null;
  readonly recent: readonly number[] | null;
}

const RECENT_MAX = 5;

const num = (v: unknown): number | null => {
  const x = Number(v);
  return v === null || v === undefined || !Number.isFinite(x) ? null : x;
};

/**
 * ★**出走馬ごとの 詳しい形**（★馬番で引く）。★読めない項目は `null`（★埋めない）。
 *   ★`authClient` でなく `readClient`（★未ログインでも番組は流す）。
 */
export async function fetchFieldProfiles(raceId: string, client = readClient()): Promise<ReadonlyMap<number, FieldProfile>> {
  const entries = await client.from('race_entries_public')
    .select('gate,strategy,weight,popularity,horse_id').eq('race_id', raceId).order('gate');
  if (entries.error !== null) throw new Error(entries.error.message);
  const rows = ((entries.data ?? []) as Record<string, unknown>[])
    .map((e) => ({
      gate: Number(e['gate']),
      horseId: typeof e['horse_id'] === 'string' && e['horse_id'] !== '' ? e['horse_id'] : null,
      strategy: typeof e['strategy'] === 'string' ? e['strategy'] : null,
      weight: num(e['weight']),
      popularity: num(e['popularity']),
      /** ⚠️ ★誰の馬かは読まない（★裁定 §6-2・段 3 は照会中） */
      isMine: false,
    }))
    .filter((e) => Number.isInteger(e.gate) && e.gate >= 1);
  const ids = rows.map((r) => r.horseId).filter((id): id is string => id !== null);
  const [record, recent] = await Promise.all([fetchRecords(client, ids), fetchRecent(client, ids, raceId)]);
  const out = new Map<number, FieldProfile>();
  for (const r of rows) {
    const rec = r.horseId === null ? null : record.get(r.horseId) ?? null;
    out.set(r.gate, {
      ...r,
      starts: rec?.starts ?? null,
      wins: rec?.wins ?? null,
      recent: r.horseId === null ? null : recent.get(r.horseId) ?? [],
    });
  }
  return out;
}

/** ★戦績（★1 頭 2 回の関数呼び出し・★1 レース 1 回だけ） */
async function fetchRecords(client: ReturnType<typeof readClient>, ids: readonly string[]): Promise<ReadonlyMap<string, { readonly starts: number | null; readonly wins: number | null }>> {
  const out = new Map<string, { readonly starts: number | null; readonly wins: number | null }>();
  await Promise.all(ids.map(async (id) => {
    const [s, w] = await Promise.all([
      client.rpc('horse_starts', { p_horse_id: id }),
      client.rpc('horse_wins', { p_horse_id: id }),
    ]);
    out.set(id, { starts: s.error === null ? num(s.data) : null, wins: w.error === null ? num(w.data) : null });
  }));
  return out;
}

/**
 * ★最近の着順（★新しい順に 5 つ）。★確定した出走だけ（★`race_entries_public` は 確定のときだけ着順を出す）。
 *   ★今のレースは除く（★まだ走っていない）。
 */
async function fetchRecent(client: ReturnType<typeof readClient>, ids: readonly string[], currentRaceId: string): Promise<ReadonlyMap<string, readonly number[]>> {
  const out = new Map<string, number[]>();
  if (ids.length === 0) return out;
  const runs = await client.from('race_entries_public')
    .select('race_id,horse_id,finish_pos').in('horse_id', ids as string[]).not('finish_pos', 'is', null);
  if (runs.error !== null) return out;
  const rows = ((runs.data ?? []) as Record<string, unknown>[])
    .filter((r) => r['race_id'] !== currentRaceId && Number.isInteger(Number(r['finish_pos'])));
  const raceIds = [...new Set(rows.map((r) => String(r['race_id'])))];
  if (raceIds.length === 0) return out;
  /** ★レース ID は 100 件ずつ（★URL が長くなりすぎない） */
  const at = new Map<string, number>();
  for (let i = 0; i < raceIds.length; i += 100) {
    const races = await client.from('races_public').select('id,scheduled_at,status').in('id', raceIds.slice(i, i + 100));
    if (races.error !== null) return out;
    for (const r of (races.data ?? []) as Record<string, unknown>[]) {
      if (r['status'] === 'settled') at.set(String(r['id']), new Date(String(r['scheduled_at'])).getTime());
    }
  }
  const byHorse = new Map<string, { readonly t: number; readonly pos: number }[]>();
  for (const r of rows) {
    const t = at.get(String(r['race_id']));
    if (t === undefined) continue;
    const id = String(r['horse_id']);
    const list = byHorse.get(id) ?? [];
    list.push({ t, pos: Number(r['finish_pos']) });
    byHorse.set(id, list);
  }
  for (const [id, list] of byHorse) out.set(id, list.sort((a, b) => b.t - a.t).slice(0, RECENT_MAX).map((x) => x.pos));
  return out;
}
