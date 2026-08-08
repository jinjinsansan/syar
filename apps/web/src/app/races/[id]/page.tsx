import {
  CONDITION_LABEL, SURFACE_LABEL, formatDistance, formatOdds, formatRaceTitle,
} from '../../../lib/format';
import { readClient } from '../../../lib/supabase';

export const revalidate = 0;

type Row = Record<string, string | number | boolean | null | number[]>;

export default async function RacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = readClient();

  const [race, entries, odds] = await Promise.all([
    c.from('races_public').select('*').eq('id', id).single(),
    c.from('race_entries_public').select('*').eq('race_id', id).order('gate'),
    c.from('race_odds_public').select('*').eq('race_id', id).eq('bet_type', 'win').order('odds'),
  ]);
  if (race.error) return <p style={{ color: '#ff8a8a' }}>読み取りに失敗: {race.error.message}</p>;

  const r = race.data as Row;
  const settled = r['status'] === 'settled';
  const oddsOf = new Map(
    ((odds.data ?? []) as Row[]).map((o) => [Number((o['selection'] as number[])[0]), o]),
  );

  return (
    <>
      <h1 style={{ fontSize: 20, marginBottom: 2 }}>
        {formatRaceTitle(Number(r['class_rank']), r['grade'] as string | null)}
      </h1>
      <p style={{ color: '#9aa3b2', fontSize: 13, marginTop: 0 }}>
        {SURFACE_LABEL[String(r['surface'])]} {formatDistance(Number(r['distance']))}{' '}
        {CONDITION_LABEL[String(r['track_condition'])]} ／ 賞金{' '}
        {Number(r['purse']).toLocaleString('ja-JP')} PP ／ {settled ? '確定' : '発売中'}
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 12 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#9aa3b2', borderBottom: '1px solid #262b35' }}>
            <th style={{ padding: '8px 6px' }}>枠</th>
            <th>馬名</th>
            <th>厩舎</th>
            <th>脚質</th>
            <th style={{ textAlign: 'right' }}>単勝</th>
            <th style={{ textAlign: 'right' }}>人気</th>
            {settled && <th style={{ textAlign: 'right' }}>着順</th>}
          </tr>
        </thead>
        <tbody>
          {((entries.data ?? []) as Row[]).map((e) => {
            const o = oddsOf.get(Number(e['gate']));
            const won = settled && Number(e['finish_pos']) === 1;
            return (
              <tr key={String(e['gate'])} style={{ borderBottom: '1px solid #1a1e26', background: won ? '#17251c' : undefined }}>
                <td style={{ padding: '8px 6px' }}>{String(e['gate'])}</td>
                <td>{String(e['horse_name'])}</td>
                <td style={{ color: '#9aa3b2' }}>{String(e['owner_label'] ?? '')}</td>
                <td style={{ color: '#9aa3b2' }}>{String(e['strategy'])}</td>
                <td style={{ textAlign: 'right' }}>
                  {o ? formatOdds(Number(o['odds']), Boolean(o['capped'])) : '—'}
                </td>
                <td style={{ textAlign: 'right', color: '#9aa3b2' }}>{String(e['popularity'] ?? '—')}</td>
                {settled && <td style={{ textAlign: 'right', fontWeight: won ? 700 : 400 }}>{String(e['finish_pos'] ?? '—')}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ★§8.6 Provably Fair — 公開する画面が無ければ「誰でも検証できる」は主張にならない */}
      <section style={{ marginTop: 24, padding: 14, border: '1px solid #262b35', borderRadius: 6 }}>
        <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>公正性の検証（§8.6）</h2>
        <p style={{ color: '#9aa3b2', fontSize: 13, margin: '0 0 8px' }}>
          発走前に <code>seed_commit</code> を公開し、確定後に <code>seed_reveal</code> を公開します。
          <br />
          <strong>SHA-256(seed_reveal) が seed_commit と一致すれば</strong>、
          運営が結果を見てから乱数を選んでいないことを誰でも確かめられます。
        </p>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, lineHeight: 1.9, wordBreak: 'break-all' }}>
          <div><span style={{ color: '#9aa3b2' }}>seed_commit </span>{String(r['seed_commit'])}</div>
          <div>
            <span style={{ color: '#9aa3b2' }}>seed_reveal </span>
            {r['seed_reveal'] ? String(r['seed_reveal']) : <em style={{ color: '#9aa3b2' }}>確定後に公開されます</em>}
          </div>
        </div>
      </section>
    </>
  );
}
