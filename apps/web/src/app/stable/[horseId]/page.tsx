import { demoStableRepo, conditionView, fatigueColor, type HorseDetail } from '../../../lib/stable';
import { ClassChip, FatigueBar, Stars } from '../../../components/ui';

export const revalidate = 0;

/**
 * ★馬詳細 — 正本 design/hud-ds/components/horse-detail
 *   格を主役に／現在値 5 本（素質上限の目盛つき）／適性／戦績／血統表 5 代（クロスは 2 色まで）／調教履歴。
 *   ⚠️ 表示だけ。上限・昇格条件・係数はデータ層の値をそのまま。勝率は小さく（主指標にしない・§12.3）。
 */
const PED_FLEX = ['1.3', '1.14', '1', '1', '1'];
const PED_FONT = [15, 14, 13, 12, 11];

function Pedigree({ horse }: { readonly horse: HorseDetail }): React.ReactElement {
  if (horse.pedigree.length === 0) {
    return <p style={{ padding: '16px 18px', fontSize: 14, color: 'var(--paper-70)' }}>血統情報が登録されていません</p>;
  }
  const colorOf = new Map(horse.crosses.map((c) => [c.name, c.color]));
  return (
    <div style={{ display: 'flex', height: 704, borderTop: '1px solid var(--rule)' }}>
      {horse.pedigree.map((col, gi) => (
        <div key={gi} style={{ flex: PED_FLEX[gi] ?? '1', display: 'flex', flexDirection: 'column' }}>
          {col.map((name, i) => {
            // ★1 代目（父・母）には付けない
            const cross = gi === 0 ? undefined : colorOf.get(name);
            return (
              <div key={i} style={{
                flex: 1, display: 'flex', alignItems: 'center', padding: '0 8px', borderLeft: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)',
                background: cross !== undefined ? `${cross}1f` : i % 2 === 1 ? 'rgba(255,255,255,.02)' : 'transparent',
                boxShadow: cross !== undefined ? `inset 3px 0 0 ${cross}` : undefined,
              }}>
                <span style={{ fontSize: PED_FONT[gi] ?? 11, fontWeight: gi < 2 ? 900 : 700, color: cross ?? 'var(--paper)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default async function HorsePage({ params }: { params: Promise<{ horseId: string }> }) {
  const { horseId } = await params;
  const h = await demoStableRepo.horse(horseId);
  if (h === null) return <p style={{ padding: '24px 40px', color: 'var(--paper-70)' }}>この馬は見つかりませんでした。</p>;
  const cond = conditionView(h.condition);
  const winRate = h.starts > 0 ? Math.round((h.wins / h.starts) * 100) : null;
  const statTotal = h.stats.reduce((s, r) => s + r.value, 0);
  const sire = h.pedigree[0]?.[0];

  return (
    <div style={{ padding: '22px 0 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--paper-45)' }}>
        <a href="/stable" style={{ color: 'var(--paper-70)' }}>わたしの馬</a><span>/</span><span style={{ color: 'var(--paper)' }}>{h.name}</span>
      </div>

      {/* ヒーロー */}
      <div className="board rise" style={{ marginTop: 12 }}>
        <div className="edge" />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 30, padding: '22px 26px 20px', flexWrap: 'wrap' }}>
          <div>
            <div className="lbl" style={{ color: 'var(--gold)' }}>現在の格</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
              <ClassChip label={h.classLabel} classRank={h.classRank} h={46} font={28} />
              {h.nextClassLabel !== null && (
                <span style={{ fontSize: 13, color: 'var(--paper-70)', lineHeight: 1.6 }}>次の格は <span style={{ color: 'var(--paper)' }}>{h.nextClassLabel}</span><br />{h.promotionHint}</span>
              )}
            </div>
            <div style={{ fontSize: 40, fontWeight: 900, marginTop: 16 }}>{h.name}</div>
            <div style={{ display: 'flex', gap: 18, marginTop: 8, fontSize: 14, color: 'var(--paper-70)' }}>
              <span>{h.sexAge}</span><span>{h.coat}</span><span>{h.stableName}</span>{sire !== undefined && <span>父 {sire}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
              <span className="lbl">素質</span><Stars value={h.stars} size={22} /><span style={{ fontSize: 13, color: 'var(--paper-45)' }}>★{h.stars}（生涯変わりません）</span>
            </div>
          </div>
          <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--rule)' }} className="hide-narrow" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><div className="lbl">獲得賞金</div><div style={{ marginTop: 4 }}><span className="num plate" style={{ fontSize: 46 }}>{h.prizePP.toLocaleString('ja-JP')}</span> <span style={{ fontSize: 15, color: 'var(--paper-70)' }}>PP</span></div></div>
            <div style={{ display: 'flex', gap: 26, alignItems: 'flex-end' }}>
              <div><div className="lbl">戦績</div><div style={{ fontSize: 15, marginTop: 5 }}><span className="num" style={{ fontSize: 24 }}>{h.starts}</span> 戦 <span className="num" style={{ fontSize: 24, color: 'var(--gold)' }}>{h.wins}</span> 勝</div></div>
              <div><div className="lbl">2・3着</div><div style={{ fontSize: 15, marginTop: 5 }}><span className="num" style={{ fontSize: 20, color: 'var(--paper-70)' }}>{h.seconds}</span> ・ <span className="num" style={{ fontSize: 20, color: 'var(--paper-70)' }}>{h.thirds}</span></div></div>
              {winRate !== null && <span style={{ fontSize: 12, color: 'var(--paper-45)' }}>勝率 {winRate}%</span>}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="chip-gold" style={{ height: 40, fontSize: 16 }} title="調教画面は準備中"><span className="unskew">{h.week.kind === 'done' ? '指示を変更する' : '調教を指示する'}</span></span>
            <span className="chip-glass" style={{ height: 36 }} title="出走登録は準備中"><span className="unskew">出走登録</span></span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26, height: 44, padding: '0 26px', background: 'rgba(255,255,255,.03)', borderTop: '1px solid var(--rule)', fontSize: 14, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--paper-70)' }}>調子 <span style={{ color: cond.color }}>{cond.mark} {cond.label}</span></span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--paper-70)' }}>疲労 <FatigueBar value={h.fatigue} width={120} color={fatigueColor(h.fatigue)} /></span>
          <span style={{ color: 'var(--paper-70)' }}>今週の指示 <span style={{ color: 'var(--paper)' }}>{h.week.kind === 'done' ? h.week.menu : h.week.kind === 'rest' ? '休養' : '未指示'}</span></span>
          <span style={{ marginLeft: 'auto', color: 'var(--paper-70)' }}>
            次走 <span style={{ color: 'var(--paper)' }}>{h.nextRace ?? '未定'}</span>
            {h.entryFeeEP !== null && <>　出走料 <span className="num" style={{ fontSize: 16 }}>{h.entryFeeEP}</span> EP</>}
          </span>
        </div>
      </div>

      {/* 現在値・適性・戦績 */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
        <div className="panel" style={{ flex: 1, minWidth: 320, padding: '14px 18px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline' }}><span className="lbl">現在値</span><span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--paper-45)' }}>縦の目盛 = 素質による上限</span></div>
          <div style={{ marginTop: 6 }}>
            {h.stats.map((s) => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 14, height: 36 }}>
                <span style={{ width: 74, fontSize: 14, color: 'var(--paper-70)' }}>{s.label}</span>
                <span style={{ position: 'relative', flex: 1, height: 14, background: 'rgba(0,0,0,.5)', border: '1px solid var(--rule)' }}>
                  <span style={{ display: 'block', width: `${Math.max(0, Math.min(100, s.value / 10))}%`, height: '100%', background: 'var(--gold)' }} />
                  <span style={{ position: 'absolute', left: `${Math.round(s.capRatio * 100)}%`, top: -4, width: 2, height: 20, background: 'var(--paper-45)' }} />
                </span>
                <span className="num" style={{ width: 52, textAlign: 'right', fontSize: 20 }}>{s.value}</span>
                <span className="num" style={{ width: 44, textAlign: 'right', fontSize: 14, color: s.delta > 0 ? '#5fd48b' : s.delta < 0 ? 'var(--bad)' : 'var(--paper-45)' }}>{s.delta > 0 ? `+${s.delta}` : s.delta < 0 ? `${s.delta}` : '±0'}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--rule)' }}>
            <span className="lbl">合計</span><span className="num" style={{ fontSize: 22 }}>{statTotal.toLocaleString('ja-JP')}</span><span style={{ fontSize: 12, color: 'var(--paper-45)' }}>/ 上限 {h.statCapTotal.toLocaleString('ja-JP')}</span>
          </div>
        </div>
        <div className="panel" style={{ width: 250, padding: '14px 0 0' }}>
          <div className="lbl" style={{ padding: '0 12px' }}>適性</div>
          <div style={{ marginTop: 8 }}>
            {h.aptitude.map((a) => (
              <div key={a.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 32, padding: '0 12px', borderTop: '1px solid var(--rule)' }}>
                <span style={{ fontSize: 14, color: 'var(--paper-70)' }}>{a.label}</span>
                <span style={{ fontSize: 17, fontWeight: 900, color: a.mark === '◎' ? '#5fd48b' : a.mark === '○' ? 'var(--paper-70)' : 'var(--paper-45)' }}>{a.mark}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 44, padding: '0 12px', borderTop: '1px solid var(--rule)' }}>
            <span className="lbl">脚質</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 12px', fontSize: 13, color: '#3fd0e0', border: '1px solid rgba(63,208,224,.4)' }}>{h.strategyLabel}</span>
          </div>
        </div>
        <div className="panel" style={{ flex: 1.15, minWidth: 560 }}>
          <div style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 14px', gap: 10 }}>
            <span className="lbl" style={{ flex: '0 0 40px' }}>週</span><span className="lbl" style={{ flex: '0 0 100px' }}>レース</span><span className="lbl" style={{ flex: '0 0 78px' }}>格</span>
            <span className="lbl" style={{ flex: 1, minWidth: 96 }}>条件</span><span className="lbl" style={{ flex: '0 0 30px', textAlign: 'center' }}>着</span>
            <span className="lbl" style={{ flex: '0 0 56px', textAlign: 'right' }}>時計</span><span className="lbl" style={{ flex: '0 0 70px', textAlign: 'right' }}>賞金</span>
          </div>
          {h.races.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', height: 42, padding: '0 14px', gap: 10, borderTop: '1px solid var(--rule)', background: i % 2 === 1 ? 'var(--row)' : 'transparent' }}>
              <span className="num" style={{ flex: '0 0 40px', fontSize: 14, color: 'var(--paper-45)' }}>{r.week}週</span>
              <span style={{ flex: '0 0 100px', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.race}</span>
              <span style={{ flex: '0 0 78px', fontSize: 12, color: 'var(--paper-70)', whiteSpace: 'nowrap' }}>{r.grade}</span>
              <span style={{ flex: 1, minWidth: 96, fontSize: 13, color: 'var(--paper-70)', whiteSpace: 'nowrap' }}>{r.cond}</span>
              <span className="num" style={{ flex: '0 0 30px', textAlign: 'center', fontSize: r.place === 1 ? 21 : 18, color: r.place === 1 ? 'var(--gold)' : 'var(--paper)' }}>{r.place}</span>
              <span className="num" style={{ flex: '0 0 56px', textAlign: 'right', fontSize: 14, color: 'var(--paper-70)' }}>{r.time}</span>
              <span style={{ flex: '0 0 70px', textAlign: 'right', fontSize: 12, color: r.prizePP > 0 ? 'var(--paper)' : 'var(--paper-45)' }}><span className="num" style={{ fontSize: 15 }}>{r.prizePP.toLocaleString('ja-JP')}</span> PP</span>
            </div>
          ))}
          {h.races.length === 0 && <p style={{ padding: '14px', fontSize: 14, color: 'var(--paper-70)' }}>まだ出走していません。出走登録から初戦を選べます</p>}
          {h.races.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', height: 38, padding: '0 14px', borderTop: '1px solid var(--rule)' }}>
              <span style={{ fontSize: 13, color: 'var(--gold)' }}>戦績をすべて見る（{h.starts} 戦）</span>
            </div>
          )}
        </div>
      </div>

      {/* 血統表 */}
      <div className="panel" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 44, padding: '0 18px', gap: 20, borderBottom: '1px solid var(--rule)', flexWrap: 'wrap' }}>
          <span className="lbl">血統表　5代</span>
          {h.crosses.map((c) => (
            <span key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ width: 12, height: 12, background: `${c.color}33`, boxShadow: `inset 3px 0 0 ${c.color}` }} />
              <span style={{ color: c.color }}>{c.name}</span><span style={{ color: 'var(--paper-70)' }}>{c.label}</span>
            </span>
          ))}
          {h.inbreedCoeff !== null && (
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--paper-45)' }}>インブリード係数 <span className="num" style={{ fontSize: 15, color: 'var(--paper-70)' }}>{(h.inbreedCoeff * 100).toFixed(2)}%</span></span>
          )}
        </div>
        <Pedigree horse={h} />
      </div>

      {/* 調教履歴 */}
      <div className="panel" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 14px', gap: 14 }}>
          <span className="lbl" style={{ width: 52 }}>週</span><span className="lbl" style={{ width: 126 }}>メニュー</span><span className="lbl" style={{ width: 150 }}>主効果</span><span className="lbl" style={{ width: 120 }}>疲労</span><span className="lbl" style={{ flex: 1 }}>記録</span>
        </div>
        {h.training.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', height: 38, padding: '0 14px', gap: 14, borderTop: '1px solid var(--rule)', background: i % 2 === 1 ? 'var(--row)' : 'transparent' }}>
            <span className="num" style={{ width: 52, fontSize: 14, color: 'var(--paper-45)' }}>{t.week}週</span>
            <span style={{ width: 126, fontSize: 14 }}>{t.menu}</span>
            <span style={{ width: 150, fontSize: 13, color: '#5fd48b' }}>{t.effect}</span>
            <span style={{ width: 120, fontSize: 13, color: t.fatigueDelta > 0 ? '#fad728' : '#5fd48b' }}>疲労 {t.fatigueDelta > 0 ? `+${t.fatigueDelta}` : `−${Math.abs(t.fatigueDelta)}`}</span>
            <span style={{ flex: 1, minWidth: 96, fontSize: 13, color: 'var(--paper-70)', whiteSpace: 'nowrap' }}>{t.note}</span>
          </div>
        ))}
        {h.training.length === 0 && <p style={{ padding: '14px', fontSize: 14, color: 'var(--paper-70)' }}>今週が最初の週です</p>}
      </div>
    </div>
  );
}
