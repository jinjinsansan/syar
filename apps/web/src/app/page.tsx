import { formatDistance, formatRaceTitle, SURFACE_LABEL, CONDITION_LABEL } from '../lib/format';
import { readClient } from '../lib/supabase';

/** ★毎回サーバーで取り直す（10分ごとに番組が変わるため） */
export const revalidate = 0;

export default async function Home() {
  const c = readClient();
  const { data, error } = await c
    .from('races_public')
    .select('*')
    .order('scheduled_at', { ascending: true })
    .limit(20);
  // ★エラーを空リストにしない。障害が「レースが無い」に見えてしまう
  if (error) return <p style={{ color: '#ff8a8a' }}>読み取りに失敗しました: {error.message}</p>;
  const races = data ?? [];

  return (
    <>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>番組表</h1>
      <p style={{ color: '#9aa3b2', fontSize: 13, marginTop: 0 }}>
        10分ごとに1レース。{/* ★正典 §10.2・D-007 */}
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#9aa3b2', borderBottom: '1px solid #262b35' }}>
            <th style={{ padding: '8px 6px' }}>発走</th>
            <th>格</th>
            <th>コース</th>
            <th style={{ textAlign: 'right' }}>賞金</th>
            <th>状態</th>
          </tr>
        </thead>
        <tbody>
          {races.map((r: Record<string, string | number | null>) => (
            <tr key={String(r['id'])} style={{ borderBottom: '1px solid #1a1e26' }}>
              <td style={{ padding: '8px 6px' }}>
                {new Date(String(r['scheduled_at'])).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
              </td>
              <td>
                <a href={`/races/${String(r['id'])}`} style={{ color: '#8ab4ff' }}>
                  {formatRaceTitle(Number(r['class_rank']), r['grade'] as string | null)}
                </a>
              </td>
              <td>
                {SURFACE_LABEL[String(r['surface'])]} {formatDistance(Number(r['distance']))}{' '}
                <span style={{ color: '#9aa3b2' }}>{CONDITION_LABEL[String(r['track_condition'])]}</span>
              </td>
              <td style={{ textAlign: 'right' }}>{Number(r['purse']).toLocaleString('ja-JP')} PP</td>
              <td style={{ color: r['status'] === 'settled' ? '#9aa3b2' : '#7ee2a8' }}>
                {r['status'] === 'settled' ? '確定' : '発売中'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {races.length === 0 && <p style={{ color: '#9aa3b2' }}>レースがありません。</p>}
    </>
  );
}
