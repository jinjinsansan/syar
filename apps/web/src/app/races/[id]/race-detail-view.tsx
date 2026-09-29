'use client';

/**
 * ★**レース詳細（`/races/[id]`）の見た目**（★2026-09-30・デザイナー R-21 §1 の 1・引き渡し資料 `design_handoff_r21_races_training/README.md` §1〜§2）。
 *
 * ★データは ★入れ物（`page.tsx`・サーバー）が読んで ★計算済みの値だけ渡します（★照合の判定も サーバー側の `verifyReveal`）。
 * 🔴 ★**落としてはいけないもの**: ★締切まで・★着順・★照合（Provably Fair）。★照合が一致しないときは ★必ず赤の × を出す（★隠さない）。
 * 🔴 ★**1〜3 番人気の単勝を 赤く大きく出さない**（★資料 §2-5 ①・ストアの方針 L-8）→ ★全頭 同じ灰の 16px。
 *
 * ⚠️ ★資料と食い違うので 変えた所（★デザイナーへ返す）:
 *   ・★見出しの補足「（締切まで変わります）」と 注記「オッズは締切まで変わります／数字は投票の集まり方」は ★**使わない**。
 *     ★オッズは発売のときに決まり 変わらない（`CLAIM_ODDS_FIXED`・固定オッズ）ので ★嘘になる。★注記は claims.ts の文を出す。
 *   ・★下段の副題の「録画」は ★使わない（★オーナー「全て生中継であるべき」・網 user-visible-words）→ ★中継／過去のレース。
 */
import { Backdrop, BigButton, TopBar, useMotionPaused } from '../../../components/uma/uma-parts';
import { RaceStrip } from '../../../components/uma/race-strip';
import { FrameBadge, STYLE_LABEL } from '../../../components/ui';
import { Countdown } from '../../../components/clock';
import { CLAIM_CARD_PUBLISH, CLAIM_ODDS_FIXED, CLAIM_SALES_CLOSE } from '../../../lib/claims';
import { LABEL_SALES_CLOSE, salesCloseAtMs } from '../../../lib/sales-close';

import type { RaceDetailProps } from './race-detail-props';
export type { RaceDetailProps, RaceDetailRow } from './race-detail-props';

const MONO = 'ui-monospace, Menlo, monospace';
const PAPER_PANEL: React.CSSProperties = {
  border: '2px solid rgba(251,247,236,.28)', borderRadius: 12, background: 'var(--u-paper)', color: 'var(--u-ink-dark)', overflow: 'hidden',
};
const PAPER_HEAD: React.CSSProperties = {
  display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 12px', padding: '10px 14px',
  background: '#0a2340', color: 'var(--u-ink-light)', borderBottom: '3px solid #f6c21c',
};
const CHIP: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 2, background: '#061a33', border: '1px solid rgba(251,247,236,.22)', borderRadius: 8, padding: '6px 10px',
};
const CHIP_LABEL: React.CSSProperties = { fontSize: 10, color: '#cfe0ee' };

/** ★上限に当たった単勝は「150.0+」（★資料 §2-2） */
const oddsText = (odds: number | null, capped: boolean): string => odds === null ? '—' : capped ? `${odds.toFixed(1)}+` : odds.toFixed(1);

export default function RaceDetailView(p: RaceDetailProps): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const settled = p.status === 'settled';
  const scheduled = p.status === 'scheduled';
  const deadlineText = p.status === 'closed' ? '締切' : p.status === 'cancelled' ? '中止' : '確定';
  const rows = settled
    ? [...p.rows].sort((a, b) => (a.place ?? 99) - (b.place ?? 99))
    : p.rows;

  return (
    <div data-theme="uma" data-page-body className={paused ? 'u-paused' : undefined} style={{
      position: 'relative', width: '100%', minHeight: '100dvh', background: 'var(--u-navy)', display: 'flex', flexDirection: 'column',
    }}>
      <Backdrop variant="screen" />
      <TopBar title="レース詳細" backHref="/vote" paused={paused} onToggle={toggle} />
      <RaceStrip />

      <div style={{
        position: 'relative', flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 12,
        padding: '10px 14px 0', width: '100%', maxWidth: 1220, margin: '0 auto', overflow: 'auto',
      }}>
        {/* ★見出し板（§2-1） */}
        <section aria-label="レースの見出し" style={{
          display: 'flex', flexDirection: 'column', gap: 10, padding: 12,
          background: 'rgba(10,35,64,.9)', border: '2px solid rgba(251,247,236,.28)', borderRadius: 12, color: 'var(--u-ink-light)',
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: '#0a2340', border: '1px solid #f6c21c', color: '#ffe483' }}>{p.gradeLabel}</span>
            {/* ★省略記号で切らない */}
            <h1 style={{ margin: 0, fontSize: 17, lineHeight: 1.3 }}>{p.title}</h1>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span style={CHIP}><span style={CHIP_LABEL}>発走</span><span className="u-num" style={{ fontSize: 17 }}>{p.startClock}</span></span>
            <span style={CHIP}><span style={CHIP_LABEL}>距離</span><span className="u-num" style={{ fontSize: 17 }}>{p.distanceLabel}</span></span>
            <span style={CHIP}><span style={CHIP_LABEL}>頭数</span><span className="u-num" style={{ fontSize: 17 }}>{p.rows.length}頭</span></span>
            <span style={CHIP}><span style={CHIP_LABEL}>馬場</span><span className="u-num" style={{ fontSize: 17 }}>{p.conditionLabel}</span></span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span style={{
              flex: '1 1 150px', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 10,
              border: '2px solid #f6c21c', background: 'rgba(30,22,4,.82)',
            }}>
              <span aria-hidden style={{ width: 12, height: 12, transform: 'rotate(45deg)', background: '#f6c21c', flex: '0 0 auto' }} />
              <span style={{ fontSize: 11, color: '#fff3cd' }}>1着賞金</span>
              <span className="u-num" style={{ fontSize: 20, color: '#fff3cd' }}>{p.purse.toLocaleString('ja-JP')}</span>
              <span style={{ fontSize: 11, color: '#fff3cd' }}>PP</span>
            </span>
            <span style={{
              flex: '1 1 150px', display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 10,
              border: `2px solid ${settled ? '#57c8a8' : '#f08219'}`, background: '#061a33',
            }}>
              <span style={{ fontSize: 11, color: '#cfe0ee' }}>{settled ? 'このレースは' : `${LABEL_SALES_CLOSE}まで`}</span>
              {scheduled
                ? <Countdown untilIso={new Date(salesCloseAtMs(Date.parse(p.scheduledAtIso))).toISOString()} after="締め切りました" size={20} color="#fbf7ec" />
                : <span className="u-num" style={{ fontSize: 20 }}>{deadlineText}</span>}
            </span>
          </div>
        </section>

        {/* ★出走表（§2-2・紙パネル） */}
        <section aria-label="出走表" style={PAPER_PANEL}>
          <div style={PAPER_HEAD}>
            <strong style={{ fontSize: 14 }}>出走表</strong>
            <span style={{ fontSize: 11 }}>{settled ? '着順 ・ 単勝 ・ 人気 ・ タイム' : '単勝 ・ 人気'}</span>
          </div>
          {rows.length === 0
            ? <p style={{ margin: 0, padding: '12px 14px', fontSize: 12 }}>{CLAIM_CARD_PUBLISH}</p>
            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))' }}>
              {rows.map((e, i) => {
                const won = settled && e.place === 1;
                return (
                  <div key={e.gate} style={{
                    display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '6px 12px',
                    background: won ? '#fff4cf' : i % 2 === 1 ? '#f4f1e6' : '#fbf7ec', borderBottom: '1px solid #dcd7c6',
                  }}>
                    <span style={{ width: 34, flex: '0 0 34px', display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
                      {settled
                        ? <><span className="u-num" style={{ fontSize: 20, color: won ? '#a9741a' : '#10243a' }}>{e.place ?? '—'}</span><span style={{ fontSize: 9 }}>着</span></>
                        : <><span className="u-num" style={{ fontSize: 20, opacity: 0.75 }}>{e.gate}</span><span style={{ fontSize: 9 }}>番</span></>}
                    </span>
                    <FrameBadge gate={e.gate} fieldSize={p.rows.length} w={26} h={22} font={13} />
                    <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 14, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{e.horseName}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#e8eef3', color: '#25384a' }}>{STYLE_LABEL[e.strategy] ?? e.strategy}</span>
                        <span style={{ fontSize: 10, color: '#4a6178' }}>{e.ownerLabel}</span>
                      </span>
                    </span>
                    {/* 🔴 ★単勝は 全頭 同じ灰の 16px（★人気で色も大きさも変えない・§2-5 ①） */}
                    <span style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span className="u-num" style={{ fontSize: 16, color: '#4a6178' }}>{oddsText(e.odds, e.capped)}</span>
                      <span style={{ fontSize: 10, color: '#4a6178' }}>
                        {e.popularity === null ? '—' : `${e.popularity}人気`}{settled && e.finishTime !== null ? ` ・ ${e.finishTime}` : ''}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>}
          <div style={{ padding: '8px 14px', background: '#f4f1e6', borderTop: '2px solid #dcd7c6', fontSize: 11, lineHeight: 1.6 }}>
            {CLAIM_ODDS_FIXED}。{CLAIM_SALES_CLOSE}。
          </div>
        </section>

        {/* ★§8.6 Provably Fair — ★公正性の検証（§2-3・紙パネル）。★不一致も必ず出す */}
        <section aria-label="公正性の検証" style={PAPER_PANEL}>
          <div style={PAPER_HEAD}>
            <strong style={{ fontSize: 14 }}>公正性の検証</strong>
            <span style={{ fontSize: 11 }}>運営が結果を見てから乱数を選んでいないことを、誰でも確かめられます</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8, padding: 12 }}>
            <SealBox n={1} title="発走前に公開" label="seed_commit" value={p.commit} />
            <SealBox n={2} title="確定後に公開" label="seed_reveal" value={p.reveal ?? '確定後に公開されます'} muted={p.reveal === null} />
            <div style={{
              borderRadius: 10, padding: '10px 12px',
              ...(p.verified === null ? { background: '#fffdf6', border: '1px solid #cfd8e0' }
                : p.verified ? { background: '#e4efe7', border: '2px solid #1e7a3a' }
                  : { background: '#f6ddd9', border: '2px solid #a81a13' }),
            }}>
              <SealHead n={3} title="照合" />
              <div style={{ fontSize: 10, color: '#4a6178', marginTop: 6 }}>SHA-256(seed_reveal) ＝ seed_commit</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                {p.verified === null
                  ? <><Mark bg="#9fb0bd" text="—" /><span style={{ fontSize: 12, color: '#4a6178' }}>確定後に検証できます</span></>
                  : p.verified
                    ? <><Mark bg="#1e7a3a" text="✓" /><span style={{ fontSize: 14, color: '#1e7a3a' }}>一致しました</span></>
                    : <><Mark bg="#a81a13" text="×" /><span style={{ fontSize: 14, color: '#a81a13' }}>一致しません（要調査）</span></>}
              </div>
            </div>
          </div>
          {p.reveal !== null && (
            <div style={{ margin: '0 12px 12px', padding: '10px 12px', borderRadius: 10, background: '#eef2f6', border: '1px solid #cfd8e0' }}>
              <div style={{ fontSize: 10, color: '#4a6178', marginBottom: 4 }}>自分で確かめる</div>
              <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.8, wordBreak: 'break-all' }}>
                $ echo -n &quot;{p.reveal}&quot; | shasum -a 256<br />
                <span style={{ color: '#4a6178' }}>{p.commit}  -</span>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ★下段（§2-4）。★「投票する」の入口は置かない（★`/races/[id]/bet` はオーナーの判断待ち・網 bet-page-closed） */}
      <div style={{
        position: 'relative', flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px var(--u-safe-bottom)', width: '100%', maxWidth: 1220, margin: '0 auto',
      }}>
        {/*
          ⚠️ ★そのレースの映像（★race を指定した /race）へは ★張らない（★裁定 Q-RACE-6「映像の入口は 自分の馬の記録からだけ」・網 race-real-replay ⑥）。
            ★資料 §2-4 の「確定後: レースを見る（録画で見る）」は ★この裁定と食い違うので ★投票モードへの口に替えた（★デザイナー・レビュー側へ返す）。
        */}
        {settled ? <>
          <BigButton tone="ivory" label="オッズを見る" sub="締切時点" href={`/odds/${encodeURIComponent(p.id)}`} grow="1 1 150px" />
          <BigButton tone="ivory" label="投票モードへ" sub="次のレースに投票する" href="/vote" grow="1 1 150px" />
        </> : <>
          <BigButton tone="ivory" label="オッズを見る" sub="券種ごとに見る" href={`/odds/${encodeURIComponent(p.id)}`} grow="1 1 150px" />
          <BigButton tone="ivory" label="レースを見る" sub="発走から中継で見る" href="/watch-race" grow="1 1 150px" />
        </>}
      </div>
    </div>
  );
}

function SealHead({ n, title }: { readonly n: number; readonly title: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="u-num" style={{ width: 24, height: 24, borderRadius: '50%', background: '#0a2340', color: '#fbf7ec', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
      <span style={{ fontSize: 13 }}>{title}</span>
    </div>
  );
}

function SealBox({ n, title, label, value, muted = false }: {
  readonly n: number; readonly title: string; readonly label: string; readonly value: string; readonly muted?: boolean;
}): React.ReactElement {
  return (
    <div style={{ borderRadius: 10, padding: '10px 12px', background: '#fffdf6', border: '1px solid #cfd8e0' }}>
      <SealHead n={n} title={title} />
      <div style={{ fontSize: 10, color: '#4a6178', marginTop: 6 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, wordBreak: 'break-all', color: muted ? '#4a6178' : '#10243a' }}>{value}</div>
    </div>
  );
}

function Mark({ bg, text }: { readonly bg: string; readonly text: string }): React.ReactElement {
  return <span style={{ width: 24, height: 24, borderRadius: 6, background: bg, color: '#fff', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{text}</span>;
}
