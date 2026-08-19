import { createHash, createHmac } from 'node:crypto';
import { verifyReveal } from '@star/race-engine';
import {
  CONDITION_LABEL, SURFACE_LABEL, formatDistance, formatOdds, formatRaceTitle, formatClock, formatRaceTime,
} from '../../../lib/format';
import { readClient } from '../../../lib/supabase';
import { FrameBadge, GradeBadge, ReadError, StatusBadge, StyleChip } from '../../../components/ui';
import { Countdown } from '../../../components/clock';

export const revalidate = 0;

type Row = Record<string, string | number | boolean | null | number[]>;

/** 出走表の固定列幅（固定列は flex: 0 0 <幅>） */
const COL = { gate: 44, owner: 104, style: 76, odds: 92, pop: 86, result: 120 } as const;
const MONO = 'ui-monospace, Menlo, monospace';

/**
 * ★レース詳細＋公正性の検証 — 正本 design/hud-ds/components/race-detail［アーケード］
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
  const scheduled = r['status'] === 'scheduled';
  const oddsOf = new Map(((odds.data ?? []) as Row[]).map((o) => [Number((o['selection'] as number[])[0]), o]));
  // 人気は popularity 列（モンテカルロ勝率順位）。3 番人気以内を赤にする（金は使わない）
  const gradeLabel = formatRaceTitle(Number(r['class_rank']), r['grade'] as string | null);
  const winner = settled ? rows.find((e) => Number(e['finish_pos']) === 1) : undefined;

  // 公正性: seed_reveal が出ていれば SHA-256 で照合（誰でも同じ結果になる）
  const commit = String(r['seed_commit'] ?? '');
  const reveal = r['seed_reveal'] === null || r['seed_reveal'] === undefined ? null : String(r['seed_reveal']);
  const verified = reveal === null ? null : verifyReveal(reveal, commit, {
    sha256: (m) => createHash('sha256').update(m, 'utf8').digest('hex'),
    hmacSha256: (k, m) => createHmac('sha256', k).update(m, 'utf8').digest('hex'),
  });

  // 締切箱の中身（発売中はカウントダウン。それ以外はサーバーの status を文字で）
  const deadlineText = r['status'] === 'closed' ? '締切' : r['status'] === 'cancelled' ? '中止' : '確定';

  // 照合箱（段 3）の見た目。未確定 / 一致 / 不一致 — ★不一致も必ず出す
  const stepBox: React.CSSProperties = verified === null
    ? { background: '#fff', border: '2px solid var(--a-edge-soft)' }
    : verified
      ? { background: '#eefaf1', border: '3px solid var(--a-green-d)' }
      : { background: '#ffeceb', border: '3px solid var(--a-red-d)' };
  const stepBand: React.CSSProperties = verified === null
    ? { backgroundImage: 'linear-gradient(#fff,#e9eff5)', color: 'var(--a-ink)', borderBottom: '2px solid var(--a-line)', boxShadow: 'none' }
    : verified
      ? { backgroundImage: 'var(--a-gloss-green)' }
      : { backgroundImage: 'var(--a-gloss-red)' };

  return (
    <div style={{ padding: '22px 0 40px' }}>
      {/* 見出し板 */}
      <div className="a-panel strong">
        <div className="a-band" style={{ height: 44, padding: '0 20px', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <GradeBadge label={gradeLabel} h={28} />
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: '.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(r['name'] ?? gradeLabel)}</h1>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><StatusBadge status={String(r['status'])} /></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '16px 20px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="a-lbl">発走</div>
            <div className="a-num" style={{ fontSize: 46, color: 'var(--a-num-time)', textShadow: '0 2px 0 #fff, 0 3px 0 var(--a-edge-soft)' }}>{formatClock(String(r['scheduled_at']))}</div>
          </div>
          <div style={{ width: 2, height: 60, background: 'var(--a-line)' }} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span className="a-chip" style={{ height: 30, padding: '0 14px', fontSize: 14 }}>{fieldSize} 頭</span>
            <span className="a-chip" style={{ height: 30, padding: '0 14px', fontSize: 14 }}>{SURFACE_LABEL[String(r['surface'])]} {formatDistance(Number(r['distance']))}</span>
            <span className="a-chip" style={{ height: 30, padding: '0 14px', fontSize: 14 }}>馬場 {CONDITION_LABEL[String(r['track_condition'])]}</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center', padding: '8px 16px', borderRadius: 10, backgroundImage: 'var(--a-gloss-gold)', border: '2px solid #8a5a06', boxShadow: 'var(--a-shadow-sm)' }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: '#4a3105' }}>1着賞金</div>
              <div><span className="a-num" style={{ fontSize: 32, color: '#4a3105' }}>{Number(r['purse']).toLocaleString('ja-JP')}</span> <span style={{ fontSize: 12, fontWeight: 900, color: '#4a3105' }}>PP</span></div>
            </div>
            <div style={{ textAlign: 'center', padding: '8px 16px', borderRadius: 10, backgroundImage: 'var(--a-gloss-red)', border: '2px solid var(--a-red-d)', boxShadow: 'var(--a-shadow-sm)', minWidth: 110 }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: '#fff' }}>締切まで</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 32 }}>
                {scheduled
                  ? <Countdown untilIso={String(r['scheduled_at'])} after="まもなく発走" size={32} color="#fff" />
                  : <span style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{deadlineText}</span>}
              </div>
            </div>
            <a className="a-btn" href={`/races/${id}/odds`} style={{ height: 52, padding: '0 20px', fontSize: 16, whiteSpace: 'nowrap' }}>オッズ</a>
            {scheduled && <a className="a-btn a-btn-gold" href={`/races/${id}/bet`} style={{ height: 52, padding: '0 24px', fontSize: 17, whiteSpace: 'nowrap' }}>投票する</a>}
          </div>
        </div>
      </div>

      {/* 出走表 */}
      <div className="a-panel strong" style={{ marginTop: 16 }}>
        <div className="a-band" style={{ height: 38, padding: '0 18px', gap: 14 }}>
          <span className="a-lbl" style={{ width: COL.gate, flex: `0 0 ${COL.gate}px`, textAlign: 'center', color: '#fff' }}>枠</span>
          <span className="a-lbl" style={{ flex: 1, minWidth: 150, color: '#fff' }}>馬名</span>
          <span className="a-lbl hide-narrow" style={{ width: COL.owner, flex: `0 0 ${COL.owner}px`, color: '#fff' }}>厩舎</span>
          <span className="a-lbl" style={{ width: COL.style, flex: `0 0 ${COL.style}px`, color: '#fff' }}>脚質</span>
          <span className="a-lbl" style={{ width: COL.odds, flex: `0 0 ${COL.odds}px`, textAlign: 'right', color: '#fff' }}>単勝</span>
          <span className="a-lbl" style={{ width: COL.pop, flex: `0 0 ${COL.pop}px`, textAlign: 'right', color: '#fff' }}>人気</span>
          {settled && <span className="a-lbl" style={{ width: COL.result, flex: `0 0 ${COL.result}px`, textAlign: 'right', color: '#fff' }}>着順 / タイム</span>}
        </div>
        {rows.map((e, i) => {
          const gate = Number(e['gate']);
          const o = oddsOf.get(gate);
          const pop = e['popularity'] === null || e['popularity'] === undefined ? null : Number(e['popularity']);
          const top3 = pop !== null && pop <= 3;
          const place = settled ? Number(e['finish_pos']) : null;
          const won = place === 1;
          const finishTime = e['finish_time'] === null || e['finish_time'] === undefined ? null : Number(e['finish_time']);
          const capped = o ? Boolean(o['capped']) : false;
          return (
            <div key={gate} style={{
              display: 'flex', alignItems: 'center', height: 52, padding: '0 18px', gap: 14, borderTop: '1px solid var(--a-line)',
              background: i % 2 === 1 ? 'var(--a-panel-2)' : '#fff',
              boxShadow: won ? 'inset 5px 0 0 #f2b012' : undefined,
            }}>
              <span style={{ width: COL.gate, flex: `0 0 ${COL.gate}px`, display: 'flex', justifyContent: 'center' }}><FrameBadge gate={gate} fieldSize={fieldSize} w={38} h={28} font={19} /></span>
              <span style={{ flex: 1, minWidth: 150, display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 900, color: 'var(--a-ink)' }}>{String(e['horse_name'])}</span>
              <span className="hide-narrow" style={{ width: COL.owner, flex: `0 0 ${COL.owner}px`, fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(e['owner_label'] ?? '')}</span>
              <span style={{ width: COL.style, flex: `0 0 ${COL.style}px` }}><StyleChip strategy={String(e['strategy'])} /></span>
              <span className="a-num" style={{ width: COL.odds, flex: `0 0 ${COL.odds}px`, textAlign: 'right', whiteSpace: 'nowrap', fontSize: capped ? 16 : top3 ? 30 : 24, color: top3 ? 'var(--a-num-rank)' : 'var(--a-num-time)' }}>
                {o ? formatOdds(Number(o['odds']), capped) : '—'}
              </span>
              <span style={{ width: COL.pop, flex: `0 0 ${COL.pop}px`, textAlign: 'right', fontSize: 13, fontWeight: 900, color: top3 ? 'var(--a-num-rank)' : 'var(--a-ink-3)' }}>{pop === null ? '—' : `${pop}番人気`}</span>
              {settled && (
                <span style={{ width: COL.result, flex: `0 0 ${COL.result}px`, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span className="a-num" style={{ fontSize: won ? 24 : 18, color: won ? 'var(--a-num-rank)' : 'var(--a-ink)' }}>{place === null || Number.isNaN(place) ? '—' : place}</span>
                  <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)', marginLeft: 2 }}>着</span>
                  {finishTime !== null && <span className="a-num" style={{ fontSize: 14, color: 'var(--a-ink-2)', marginLeft: 8 }}>{formatRaceTime(finishTime)}</span>}
                </span>
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <p style={{ margin: 0, padding: '16px 18px', fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)', borderTop: '1px solid var(--a-line)' }}>出馬表は発走 10 分前に確定します</p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, height: 42, padding: '0 18px', borderTop: '2px solid var(--a-line)', background: 'var(--a-ivory)', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>
          <span>オッズは投票の締切で確定します</span><span>上限に達した場合は「99.9（上限）」と表示</span>
          {winner !== undefined && <span style={{ marginLeft: 'auto', color: 'var(--a-ink)' }}>1着 {String(winner['horse_name'])}</span>}
        </div>
      </div>

      {/* ★§8.6 Provably Fair — 公開する画面が無ければ「誰でも検証できる」は主張にならない */}
      <div className="a-panel strong" style={{ marginTop: 16 }}>
        <div className="a-band" style={{ height: 44, padding: '0 20px', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: '.08em' }}>公正性の検証</span>
          <span style={{ fontSize: 13, fontWeight: 900 }}>運営が結果を見てから乱数を選んでいないことを、誰でも確かめられます</span>
        </div>
        <div style={{ padding: '16px 20px 18px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)' }}>
          <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap' }}>
            {/* 1 */}
            <div style={{ flex: 1, minWidth: 240, borderRadius: 10, background: '#fff', border: '2px solid var(--a-edge)', boxShadow: 'var(--a-shadow-sm)', overflow: 'hidden' }}>
              <div className="a-band" style={{ height: 34, padding: '0 12px', gap: 10 }}><span className="a-num" style={{ fontSize: 20 }}>1</span><span style={{ fontSize: 14, fontWeight: 900 }}>発走前に公開</span></div>
              <div style={{ padding: '12px 14px 14px' }}>
                <div className="a-lbl">seed_commit</div>
                <div style={{ fontFamily: MONO, fontWeight: 400, fontSize: 12, color: 'var(--a-ink)', wordBreak: 'break-all', lineHeight: 1.7, marginTop: 5 }}>{commit}</div>
              </div>
            </div>
            <div style={{ width: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 26, fontWeight: 900, color: 'var(--a-blue-d)' }}>→</span></div>
            {/* 2 */}
            <div style={{ flex: 1, minWidth: 240, borderRadius: 10, background: '#fff', border: '2px solid var(--a-edge)', boxShadow: 'var(--a-shadow-sm)', overflow: 'hidden' }}>
              <div className="a-band" style={{ height: 34, padding: '0 12px', gap: 10 }}><span className="a-num" style={{ fontSize: 20 }}>2</span><span style={{ fontSize: 14, fontWeight: 900 }}>確定後に公開</span></div>
              <div style={{ padding: '12px 14px 14px' }}>
                <div className="a-lbl">seed_reveal</div>
                <div style={{ fontFamily: MONO, fontWeight: 400, fontSize: 12, color: reveal === null ? 'var(--a-ink-3)' : 'var(--a-ink)', wordBreak: 'break-all', lineHeight: 1.7, marginTop: 5 }}>
                  {reveal ?? '確定後に公開されます'}
                </div>
              </div>
            </div>
            <div style={{ width: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 26, fontWeight: 900, color: 'var(--a-blue-d)' }}>→</span></div>
            {/* 3 照合 */}
            <div style={{ flex: 1, minWidth: 240, borderRadius: 10, boxShadow: 'var(--a-shadow-sm)', overflow: 'hidden', ...stepBox }}>
              <div className="a-band" style={{ height: 34, padding: '0 12px', gap: 10, ...stepBand }}><span className="a-num" style={{ fontSize: 20 }}>3</span><span style={{ fontSize: 14, fontWeight: 900 }}>照合</span></div>
              <div style={{ padding: '12px 14px 14px' }}>
                <div style={{ fontFamily: MONO, fontWeight: 400, fontSize: 12, color: 'var(--a-ink)', lineHeight: 1.8 }}>SHA-256(seed_reveal)<br />＝ seed_commit</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
                  {verified === null
                    ? <>
                      <span style={{ width: 26, height: 26, borderRadius: 6, backgroundImage: 'linear-gradient(#fff,#e6edf4)', border: '2px solid var(--a-edge-soft)', color: 'var(--a-ink-3)', fontSize: 15, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>—</span>
                      <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--a-ink-2)' }}>確定後に検証できます</span>
                    </>
                    : verified
                      ? <>
                        <span style={{ width: 26, height: 26, borderRadius: 6, backgroundImage: 'var(--a-gloss-green)', border: '2px solid var(--a-green-d)', color: '#fff', fontSize: 15, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
                        <span style={{ fontSize: 17, fontWeight: 900, color: 'var(--a-green-d)' }}>一致しました</span>
                      </>
                      : <>
                        <span style={{ width: 26, height: 26, borderRadius: 6, backgroundImage: 'var(--a-gloss-red)', border: '2px solid var(--a-red-d)', color: '#fff', fontSize: 15, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</span>
                        <span style={{ fontSize: 17, fontWeight: 900, color: 'var(--a-red-d)' }}>一致しません（要調査）</span>
                      </>}
                </div>
              </div>
            </div>
          </div>
          {reveal !== null && (
            <div style={{ marginTop: 14, borderRadius: 10, background: '#f2f7fb', border: '2px solid var(--a-edge-soft)', padding: '12px 14px' }}>
              <div className="a-lbl" style={{ marginBottom: 6 }}>自分で確かめる</div>
              <div style={{ fontFamily: MONO, fontWeight: 400, fontSize: 13, color: 'var(--a-ink)', lineHeight: 1.9, wordBreak: 'break-all' }}>
                $ echo -n &quot;{reveal}&quot; | shasum -a 256<br />
                <span style={{ color: 'var(--a-ink-2)' }}>{commit}  -</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
