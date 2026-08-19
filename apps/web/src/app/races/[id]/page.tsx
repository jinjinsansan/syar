import { createHash, createHmac } from 'node:crypto';
import { verifyReveal } from '@star/race-engine';
import {
  CONDITION_LABEL, SURFACE_LABEL, formatDistance, formatOdds, formatRaceTitle, formatClock, formatRaceTime,
} from '../../../lib/format';
import { readClient } from '../../../lib/supabase';
import { EdgePanel, FrameBadge, GradeBadge, ReadError, StatusBadge, StyleChip } from '../../../components/ui';
import { Countdown } from '../../../components/clock';

export const revalidate = 0;

type Row = Record<string, string | number | boolean | null | number[]>;

/**
 * ★レース詳細＋公正性の検証 — 正本 design/hud-ds/components/race-detail
 *   出走表（枠・馬名・厩舎・脚質・単勝・人気・確定後は着順）と、seed の照合を図で見せる。
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
  const rows = (entries.data ?? []) as Row[];
  const fieldSize = rows.length;
  const settled = r['status'] === 'settled';
  const oddsOf = new Map(((odds.data ?? []) as Row[]).map((o) => [Number((o['selection'] as number[])[0]), o]));
  // 人気は popularity 列（モンテカルロ勝率順位）。3 番人気以内を金にする
  const gradeLabel = formatRaceTitle(Number(r['class_rank']), r['grade'] as string | null);
  const winner = settled ? rows.find((e) => Number(e['finish_pos']) === 1) : undefined;

  // 公正性: seed_reveal が出ていれば SHA-256 で照合（誰でも同じ結果になる）
  const commit = String(r['seed_commit'] ?? '');
  const reveal = r['seed_reveal'] === null || r['seed_reveal'] === undefined ? null : String(r['seed_reveal']);
  const verified = reveal === null ? null : verifyReveal(reveal, commit, {
    sha256: (m) => createHash('sha256').update(m, 'utf8').digest('hex'),
    hmacSha256: (k, m) => createHmac('sha256', k).update(m, 'utf8').digest('hex'),
  });

  return (
    <div style={{ padding: '26px 40px 40px' }}>
      {/* レース見出し */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
        <GradeBadge label={gradeLabel} h={28} />
        <h1 style={{ fontSize: 36, fontWeight: 900, margin: 0 }}>{String(r['name'] ?? gradeLabel)}</h1>
        <span style={{ fontSize: 15, color: 'var(--paper-70)' }}>
          {SURFACE_LABEL[String(r['surface'])]} {formatDistance(Number(r['distance']))}　馬場 {CONDITION_LABEL[String(r['track_condition'])]}　発走 {formatClock(String(r['scheduled_at']))}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ fontSize: 14, color: 'var(--paper-70)' }}>賞金 <span className="num" style={{ fontSize: 22, color: 'var(--gold)' }}>{Number(r['purse']).toLocaleString('ja-JP')}</span> PP</span>
          <StatusBadge status={String(r['status'])} />
          {r['status'] === 'scheduled' && (
            <span style={{ fontSize: 13, color: 'var(--paper-70)' }}>発走まで <Countdown untilIso={String(r['scheduled_at'])} after="まもなく発走" /></span>
          )}
          <a className="chip-glass" href={`/races/${id}/odds`} style={{ height: 30, fontSize: 14 }}><span className="unskew">オッズ</span></a>
        </div>
      </div>

      {/* 出走表 */}
      <EdgePanel style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 36, padding: '0 20px', gap: 16 }}>
          <span className="lbl" style={{ width: 32 }}>枠</span>
          <span className="lbl" style={{ flex: 1 }}>馬名</span>
          <span className="lbl hide-narrow" style={{ width: 112 }}>厩舎</span>
          <span className="lbl" style={{ width: 74 }}>脚質</span>
          <span className="lbl" style={{ width: 82, textAlign: 'right' }}>単勝</span>
          <span className="lbl" style={{ width: 74, textAlign: 'right' }}>人気</span>
          {settled && <span className="lbl" style={{ width: 120, textAlign: 'right' }}>着順 / タイム</span>}
        </div>
        {rows.map((e, i) => {
          const gate = Number(e['gate']);
          const o = oddsOf.get(gate);
          const pop = e['popularity'] === null || e['popularity'] === undefined ? null : Number(e['popularity']);
          const top3 = pop !== null && pop <= 3;
          const place = settled ? Number(e['finish_pos']) : null;
          const won = place === 1;
          const finishTime = e['finish_time'] === null || e['finish_time'] === undefined ? null : Number(e['finish_time']);
          return (
            <div key={gate} style={{
              display: 'flex', alignItems: 'center', height: 46, padding: '0 20px', gap: 16, borderTop: '1px solid var(--rule)',
              background: won ? 'rgba(240,204,74,.12)' : i % 2 === 1 ? 'var(--row)' : 'transparent',
              boxShadow: won ? 'inset 3px 0 0 var(--gold)' : undefined,
            }}>
              <span style={{ width: 32, display: 'flex' }}><FrameBadge gate={gate} fieldSize={fieldSize} w={32} h={24} font={16} /></span>
              <span style={{ flex: 1, fontSize: 17, fontWeight: won ? 900 : 700 }}>{String(e['horse_name'])}</span>
              <span className="hide-narrow" style={{ width: 112, fontSize: 14, color: 'var(--paper-70)' }}>{String(e['owner_label'] ?? '')}</span>
              <span style={{ width: 74 }}><StyleChip strategy={String(e['strategy'])} /></span>
              <span className="num" style={{ width: 82, textAlign: 'right', fontSize: top3 ? 21 : 18, color: top3 ? 'var(--gold)' : 'var(--paper)' }}>
                {o ? formatOdds(Number(o['odds']), Boolean(o['capped'])) : '—'}
              </span>
              <span style={{ width: 74, textAlign: 'right', fontSize: 13, color: 'var(--paper-45)' }}>{pop === null ? '—' : `${pop}番人気`}</span>
              {settled && (
                <span style={{ width: 120, textAlign: 'right' }}>
                  <span className="num" style={{ fontSize: won ? 22 : 18, color: won ? 'var(--gold)' : 'var(--paper)' }}>{place === null || Number.isNaN(place) ? '—' : place}</span>
                  <span style={{ fontSize: 12, color: 'var(--paper-45)', marginLeft: 2 }}>着</span>
                  {finishTime !== null && <span className="num" style={{ fontSize: 14, color: 'var(--paper-70)', marginLeft: 8 }}>{formatRaceTime(finishTime)}</span>}
                </span>
              )}
            </div>
          );
        })}
        <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: 14, height: 40, padding: '0 20px', borderTop: '1px solid var(--rule)', fontSize: 12, color: 'var(--paper-45)' }}>
          <span>オッズは投票の締切で確定します</span><span>上限に達した場合は「（上限）」と表示</span>
          {winner !== undefined && <span style={{ marginLeft: 'auto', color: 'var(--paper-70)' }}>1着 {String(winner['horse_name'])}</span>}
        </div>
      </EdgePanel>

      {/* ★§8.6 Provably Fair — 公開する画面が無ければ「誰でも検証できる」は主張にならない */}
      <EdgePanel kind="board" style={{ marginTop: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 22px 0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 20, fontWeight: 900 }}>公正性の検証</span>
          <span style={{ fontSize: 13, color: 'var(--paper-70)' }}>運営が結果を見てから乱数を選んでいないことを、誰でも確かめられます</span>
          <span style={{ marginLeft: 'auto' }}>
            {verified === null
              ? <span className="badge off" style={{ height: 28 }}>確定後に検証できます</span>
              : verified
                ? <span style={{ display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 14px', background: 'var(--gold)', color: 'var(--ink)', fontSize: 13, fontWeight: 900 }}>一致を確認</span>
                : <span style={{ display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 14px', background: 'rgba(255,77,61,.2)', color: 'var(--bad)', fontSize: 13, fontWeight: 900 }}>一致しません（要調査）</span>}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch', padding: '16px 22px 20px', flexWrap: 'wrap', gap: 0 }}>
          <div style={{ flex: 1, minWidth: 260, background: 'rgba(255,255,255,.03)', border: '1px solid var(--rule)', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="num plate" style={{ fontSize: 22 }}>1</span><span style={{ fontSize: 15, fontWeight: 900 }}>発走前に公開</span></div>
            <div className="lbl" style={{ marginTop: 10 }}>seed_commit</div>
            <div className="mono" style={{ fontSize: 12, wordBreak: 'break-all', lineHeight: 1.7, marginTop: 4 }}>{commit}</div>
          </div>
          <div style={{ width: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)', fontSize: 22 }}>→</div>
          <div style={{ flex: 1, minWidth: 260, background: 'rgba(255,255,255,.03)', border: '1px solid var(--rule)', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="num plate" style={{ fontSize: 22 }}>2</span><span style={{ fontSize: 15, fontWeight: 900 }}>確定後に公開</span></div>
            <div className="lbl" style={{ marginTop: 10 }}>seed_reveal</div>
            <div className="mono" style={{ fontSize: 12, wordBreak: 'break-all', lineHeight: 1.7, marginTop: 4, color: reveal === null ? 'var(--paper-45)' : 'var(--paper)' }}>
              {reveal ?? '確定後に公開されます'}
            </div>
          </div>
          <div style={{ width: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)', fontSize: 22 }}>→</div>
          <div style={{
            flex: 1, minWidth: 260, padding: '14px 16px',
            background: verified === false ? 'rgba(255,77,61,.12)' : 'rgba(240,204,74,.1)',
            border: `1px solid ${verified === false ? 'rgba(255,77,61,.4)' : 'var(--gold-hair)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="num plate" style={{ fontSize: 22 }}>3</span><span style={{ fontSize: 15, fontWeight: 900 }}>照合</span></div>
            <div style={{ fontSize: 14, marginTop: 10, lineHeight: 1.7 }}>SHA-256(seed_reveal)<br />＝ seed_commit</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              {verified === null
                ? <span style={{ fontSize: 14, color: 'var(--paper-70)' }}>確定後に検証できます</span>
                : verified
                  ? <><span style={{ width: 20, height: 20, background: 'var(--gold)', color: 'var(--ink)', fontSize: 13, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span><span style={{ fontSize: 15, fontWeight: 900, color: 'var(--gold)' }}>一致しました</span></>
                  : <><span style={{ width: 20, height: 20, background: 'var(--bad)', color: '#fff', fontSize: 13, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</span><span style={{ fontSize: 15, fontWeight: 900, color: 'var(--bad)' }}>一致しません（要調査）</span></>}
            </div>
          </div>
        </div>
        {reveal !== null && (
          <div style={{ margin: '0 22px 20px', background: '#0b0f0c', border: '1px solid var(--rule)', padding: '12px 16px' }}>
            <div className="lbl" style={{ marginBottom: 6 }}>自分で確かめる</div>
            <div className="mono" style={{ fontSize: 13, lineHeight: 1.9 }}>
              $ echo -n &quot;{reveal}&quot; | shasum -a 256<br />
              <span style={{ color: 'var(--paper-45)' }}>{commit}  -</span>
            </div>
          </div>
        )}
      </EdgePanel>
    </div>
  );
}
