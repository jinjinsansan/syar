import { createHash, createHmac } from 'node:crypto';
import { verifyReveal } from '@star/race-engine';
import {
  CONDITION_LABEL, SURFACE_LABEL, formatDistance, formatRaceTitle, formatClock, formatRaceTime,
} from '../../../lib/format';
import { readClient } from '../../../lib/supabase';
import { ReadError } from '../../../components/ui';
import RaceDetailView, { type RaceDetailRow } from './race-detail-view';

export const revalidate = 0;

type Row = Record<string, string | number | boolean | null | number[]>;

/**
 * ★レース詳細＋公正性の検証（★入れ物・サーバー）。
 *   ★見た目は `race-detail-view.tsx`（★2026-09-30・デザイナー R-21 の引き渡し資料で作り直し・旧 arcade の部品は使わない）。
 *   ★ここは ★読むことと ★照合だけ（★見た目を持たない）。
 *   ⚠️ オッズの計算はサーバー側。画面側で式を作らない（正典 §14.3）。
 *   ⚠️ 照合の結果は必ず出す（不一致を隠さない）。判定は race-engine の `verifyReveal`（誰でも実行できる検証）。
 */
export default async function RacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = readClient();

  const [race, entries, odds] = await Promise.all([
    c.from('races_public').select('*').eq('id', id).single(),
    c.from('race_entries_public').select('*').eq('race_id', id).order('gate'),
    c.from('race_odds_public').select('*').eq('race_id', id).eq('bet_type', 'win').order('odds'),
  ]);
  if (race.error) return <ReadError message={race.error.message} />;
  if (entries.error) return <ReadError message={entries.error.message} />;

  const r = race.data as Row;
  const settled = r['status'] === 'settled';
  const oddsOf = new Map(((odds.data ?? []) as Row[]).map((o) => [Number((o['selection'] as number[])[0]), o]));
  const gradeLabel = formatRaceTitle(Number(r['class_rank']), r['grade'] as string | null);

  // 公正性: seed_reveal が出ていれば SHA-256 で照合（誰でも同じ結果になる）
  const commit = String(r['seed_commit'] ?? '');
  const reveal = r['seed_reveal'] === null || r['seed_reveal'] === undefined ? null : String(r['seed_reveal']);
  const verified = reveal === null ? null : verifyReveal(reveal, commit, {
    sha256: (m) => createHash('sha256').update(m, 'utf8').digest('hex'),
    hmacSha256: (k, m) => createHmac('sha256', k).update(m, 'utf8').digest('hex'),
  });

  const rows: RaceDetailRow[] = ((entries.data ?? []) as Row[]).map((e) => {
    const gate = Number(e['gate']);
    const o = oddsOf.get(gate);
    const place = settled && e['finish_pos'] !== null && e['finish_pos'] !== undefined ? Number(e['finish_pos']) : null;
    const t = e['finish_time'] === null || e['finish_time'] === undefined ? null : Number(e['finish_time']);
    return {
      gate,
      horseName: String(e['horse_name']),
      ownerLabel: String(e['owner_label'] ?? ''),
      strategy: String(e['strategy']),
      odds: o ? Number(o['odds']) : null,
      capped: o ? Boolean(o['capped']) : false,
      popularity: e['popularity'] === null || e['popularity'] === undefined ? null : Number(e['popularity']),
      place: place === null || Number.isNaN(place) ? null : place,
      finishTime: t === null ? null : formatRaceTime(t),
    };
  });

  return (
    <RaceDetailView
      id={id}
      status={String(r['status'])}
      title={String(r['name'] ?? gradeLabel)}
      gradeLabel={gradeLabel}
      scheduledAtIso={String(r['scheduled_at'])}
      startClock={formatClock(String(r['scheduled_at']))}
      distanceLabel={`${SURFACE_LABEL[String(r['surface'])] ?? ''}${formatDistance(Number(r['distance']))}`}
      conditionLabel={CONDITION_LABEL[String(r['track_condition'])] ?? ''}
      purse={Number(r['purse'])}
      rows={rows}
      commit={commit}
      reveal={reveal}
      verified={verified}
    />
  );
}
