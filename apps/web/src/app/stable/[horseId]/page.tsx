import { demoStableRepo, conditionView, fatigueColor, type HorseDetail } from '../../../lib/stable';
import { FatigueBar, StatBar, Stars } from '../../../components/ui';

export const revalidate = 0;

/**
 * ★馬詳細 — 正本 design/hud-ds/components/horse-detail［アーケード］
 *   格を主役に／現在値 5 本（素質上限の目盛つき）／適性／戦績／血統表 5 代（クロスは 2 色まで）／調教履歴。
 *   ⚠️ 表示だけ。上限・昇格条件・係数はデータ層の値をそのまま。勝率は小さく（主指標にしない・§12.3）。
 */
const PED_FLEX = ['1.3', '1.14', '1', '1', '1'];
/** 明るい地では 32 段も 12px（11px にしない） */
const PED_FONT = [15, 14, 13, 12, 12];
/** クロスの着色は明るい地用の濃色 2 色まで（文字・左バー／地）。3 組目以降は凡例に名前だけ */
const CROSS_PALETTE: readonly { readonly ink: string; readonly bg: string }[] = [
  { ink: '#0f6fb8', bg: '#e0eefa' },
  { ink: '#b3306e', bg: '#fbe4ee' },
];

function Pedigree({ horse }: { readonly horse: HorseDetail }): React.ReactElement {
  if (horse.pedigree.length === 0) {
    return <p style={{ padding: '16px 18px', fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>血統情報が登録されていません</p>;
  }
  const colorOf = new Map(horse.crosses.slice(0, CROSS_PALETTE.length).map((c, i) => [c.name, CROSS_PALETTE[i]!]));
  return (
    <div style={{ display: 'flex', height: 704, borderTop: '2px solid var(--a-edge)' }}>
      {horse.pedigree.map((col, gi) => (
        <div key={gi} style={{ flex: PED_FLEX[gi] ?? '1', display: 'flex', flexDirection: 'column' }}>
          {col.map((name, i) => {
            // ★1 代目（父・母）には付けない
            const cross = gi === 0 ? undefined : colorOf.get(name);
            return (
              <div key={i} style={{
                flex: 1, display: 'flex', alignItems: 'center', padding: '0 8px', borderLeft: '1px solid var(--a-line)', borderBottom: '1px solid var(--a-line)',
                background: cross !== undefined ? cross.bg : i % 2 === 1 ? '#f7fbfe' : '#fff',
                boxShadow: cross !== undefined ? `inset 4px 0 0 ${cross.ink}` : undefined,
              }}>
                <span style={{ fontSize: PED_FONT[gi] ?? 12, fontWeight: gi < 2 ? 900 : 700, color: cross !== undefined ? cross.ink : 'var(--a-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
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
  if (h === null) return <p style={{ padding: '24px 40px', fontWeight: 900, color: 'var(--a-ink-2)' }}>この馬は見つかりませんでした。</p>;
  const cond = conditionView(h.condition);
  const winRate = h.starts > 0 ? Math.round((h.wins / h.starts) * 100) : null;
  const statTotal = h.stats.reduce((s, r) => s + r.value, 0);
  const sire = h.pedigree[0]?.[0];
  const hdr: React.CSSProperties = { color: '#fff' };
  // 表示だけ: 重賞・オープンの格チップは金（一覧と同じ見え方）
  const isTopGrade = (grade: string): boolean => grade.startsWith('重賞') || grade.startsWith('オープン');

  return (
    <div style={{ padding: '22px 0 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 900, color: 'var(--a-ink-3)' }}>
        <a href="/stable" style={{ color: 'var(--a-blue-d)' }}>わたしの馬</a><span>/</span><span style={{ color: 'var(--a-ink)' }}>{h.name}</span>
      </div>

      {/* ヒーロー */}
      <div className="a-panel strong" style={{ marginTop: 10 }}>
        <div className="a-band" style={{ height: 40, padding: '0 20px', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '.14em' }}>現在の格</span>
          {h.nextClassLabel !== null && (
            <span style={{ fontSize: 13, fontWeight: 900 }}>次の格は {h.nextClassLabel}{h.promotionHint !== null && <>　—　{h.promotionHint}</>}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 26, padding: '20px 22px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)', flexWrap: 'wrap' }}>
          <div>
            {/* ★板の最初の要素は格（馬名より先に読ませる） */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', height: 56, padding: '0 22px', borderRadius: 10, backgroundImage: 'var(--a-gloss-gold)', border: '3px solid #8a5a06', boxShadow: 'var(--a-shadow-sm)', fontSize: 34, fontWeight: 900, color: '#4a3105', whiteSpace: 'nowrap' }}>{h.classLabel}</span>
            </div>
            <div style={{ fontSize: 44, fontWeight: 900, marginTop: 14 }}>{h.name}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              {[h.sexAge, h.coat, h.stableName, ...(sire !== undefined ? [`父 ${sire}`] : [])].map((t) => (
                <span key={t} className="a-chip" style={{ height: 28, padding: '0 12px', fontSize: 13, color: 'var(--a-ink)' }}>{t}</span>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
              <span className="a-lbl">素質</span><Stars value={h.stars} size={26} /><span style={{ fontSize: 13, fontWeight: 900, color: 'var(--a-ink-3)' }}>★{h.stars}（生涯変わりません）</span>
            </div>
          </div>
          <div style={{ width: 2, alignSelf: 'stretch', background: 'var(--a-line)' }} className="hide-narrow" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* 獲得賞金 — 育成の主指標なので格の次に大きく */}
            <div style={{ padding: '10px 18px', borderRadius: 10, background: '#fff', border: '3px solid #8a5a06', boxShadow: 'var(--a-shadow-sm)', textAlign: 'center' }}>
              <div className="a-lbl" style={{ color: '#8a5a06' }}>獲得賞金</div>
              <div style={{ marginTop: 2 }}><span className="a-num" style={{ fontSize: 50, color: 'var(--a-num-money)', textShadow: '0 2px 0 #fff, 0 3px 0 #e0c07a' }}>{h.prizePP.toLocaleString('ja-JP')}</span> <span style={{ fontSize: 15, fontWeight: 900, color: '#4a3105' }}>PP</span></div>
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
              <div style={{ flex: 1, padding: '8px 14px', borderRadius: 10, background: '#fff', border: '2px solid var(--a-edge)' }}>
                <div className="a-lbl">戦績</div>
                <div style={{ fontSize: 14, fontWeight: 900, marginTop: 2, whiteSpace: 'nowrap' }}><span className="a-num" style={{ fontSize: 28 }}>{h.starts}</span> 戦 <span className="a-num" style={{ fontSize: 28, color: 'var(--a-num-rank)' }}>{h.wins}</span> 勝</div>
              </div>
              <div style={{ padding: '8px 14px', borderRadius: 10, background: '#fff', border: '2px solid var(--a-edge)' }}>
                <div className="a-lbl">2・3着</div>
                <div style={{ fontSize: 14, fontWeight: 900, marginTop: 2, whiteSpace: 'nowrap' }}><span className="a-num" style={{ fontSize: 24, color: 'var(--a-ink-2)' }}>{h.seconds}</span> ・ <span className="a-num" style={{ fontSize: 24, color: 'var(--a-ink-2)' }}>{h.thirds}</span></div>
              </div>
              {/* 勝率は主指標にしない（末尾に小さく） */}
              {winRate !== null && <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)', paddingBottom: 6, whiteSpace: 'nowrap' }}>勝率 {winRate}%</span>}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="a-btn a-btn-gold off" style={{ height: 48, padding: '0 24px', fontSize: 17, whiteSpace: 'nowrap' }} title="調教画面は準備中">{h.week.kind === 'done' ? '指示を変更する' : '調教を指示する'}</span>
            <span className="a-btn off" style={{ height: 42, padding: '0 24px', fontSize: 15, whiteSpace: 'nowrap' }} title="出走登録は準備中">出走登録</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26, height: 52, padding: '0 22px', background: 'var(--a-ivory)', borderTop: '2px solid var(--a-line)', fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)', whiteSpace: 'nowrap', flexWrap: 'wrap' }}>
          <span>調子 <span style={{ color: cond.color }}>{cond.mark} {cond.label}</span></span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>疲労 <FatigueBar value={h.fatigue} width={130} color={fatigueColor(h.fatigue)} /></span>
          <span>今週の指示 <span style={{ color: 'var(--a-ink)' }}>{h.week.kind === 'done' ? h.week.menu : h.week.kind === 'rest' ? '休養' : '未指示'}</span></span>
          <span style={{ marginLeft: 'auto' }}>
            次走 <span style={{ color: 'var(--a-ink)' }}>{h.nextRace ?? '未定'}</span>
            {h.entryFeeEP !== null && <>　出走料 <span className="a-num" style={{ fontSize: 19, color: 'var(--a-num-money)' }}>{h.entryFeeEP}</span> EP</>}
          </span>
        </div>
      </div>

      {/* 現在値・適性 */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="a-panel strong" style={{ flex: 1, minWidth: 420 }}>
          <div className="a-band" style={{ height: 38, padding: '0 16px', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: '.1em' }}>現在値</span>
            <span style={{ fontSize: 12, fontWeight: 900 }}>上限は素質★から決まります</span>
          </div>
          <div style={{ padding: '10px 16px 14px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)' }}>
            {h.stats.map((s) => (
              // 上限はデータ層の capRatio（1000 スケール）をそのまま写す
              <StatBar key={s.key} label={s.label} value={s.value} cap={Math.round(s.capRatio * 1000)} delta={s.delta} height={18} valueSize={26} rowHeight={38} labelWidth={76} />
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, paddingTop: 10, borderTop: '2px solid var(--a-line)' }}>
              <span className="a-lbl">合計</span><span className="a-num" style={{ fontSize: 30, color: 'var(--a-num-time)' }}>{statTotal.toLocaleString('ja-JP')}</span><span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>/ 上限 {h.statCapTotal.toLocaleString('ja-JP')}</span>
            </div>
          </div>
        </div>
        <div className="a-panel" style={{ width: 252, flex: '0 0 252px' }}>
          <div style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 12px', backgroundImage: 'linear-gradient(#fff,#e3ecf3)', borderBottom: '2px solid var(--a-line)' }}><span className="a-lbl">適性</span></div>
          {h.aptitude.map((a) => (
            <div key={a.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 34, padding: '0 12px', borderTop: '1px solid var(--a-line)' }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>{a.label}</span>
              <span style={{ fontSize: 19, fontWeight: 900, color: a.mark === '◎' ? 'var(--a-green-d)' : a.mark === '○' ? 'var(--a-ink-2)' : 'var(--a-ink-3)' }}>{a.mark}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 48, padding: '0 12px', borderTop: '2px solid var(--a-line)', background: 'var(--a-ivory)' }}>
            <span className="a-lbl">脚質</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', height: 30, padding: '0 14px', borderRadius: 8, backgroundImage: 'var(--a-gloss-blue)', border: '2px solid var(--a-edge)', color: '#fff', fontSize: 14, fontWeight: 900 }}>{h.strategyLabel}</span>
          </div>
        </div>
      </div>

      {/* 戦績表（全幅の独立パネル） */}
      <div className="a-panel strong" style={{ marginTop: 16 }}>
        <div className="a-band" style={{ height: 38, padding: '0 14px', gap: 10 }}>
          <span className="a-lbl" style={{ ...hdr, width: 42, flex: '0 0 42px' }}>週</span>
          <span className="a-lbl" style={{ ...hdr, width: 200, flex: '0 0 200px' }}>レース</span>
          <span className="a-lbl" style={{ ...hdr, width: 120, flex: '0 0 120px' }}>格</span>
          <span className="a-lbl" style={{ ...hdr, flex: 1, minWidth: 160 }}>条件</span>
          <span className="a-lbl" style={{ ...hdr, width: 34, flex: '0 0 34px', textAlign: 'center' }}>着</span>
          <span className="a-lbl" style={{ ...hdr, width: 80, flex: '0 0 80px', textAlign: 'right' }}>時計</span>
          <span className="a-lbl" style={{ ...hdr, width: 110, flex: '0 0 110px', textAlign: 'right' }}>賞金</span>
        </div>
        {h.races.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', height: 46, padding: '0 14px', gap: 10, borderTop: '1px solid var(--a-line)', background: i % 2 === 1 ? 'var(--a-panel-2)' : '#fff' }}>
            <span className="a-num" style={{ width: 42, flex: '0 0 42px', fontSize: 14, color: 'var(--a-ink-3)' }}>{r.week}週</span>
            <span style={{ width: 200, flex: '0 0 200px', fontSize: 15, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.race}</span>
            <span style={{ width: 120, flex: '0 0 120px' }}><span className={`a-chip${isTopGrade(r.grade) ? ' gold' : ''}`} style={{ height: 24, padding: '0 10px', fontSize: 12, whiteSpace: 'nowrap' }}>{r.grade}</span></span>
            <span style={{ flex: 1, minWidth: 160, fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)', whiteSpace: 'nowrap' }}>{r.cond}</span>
            <span className="a-num" style={{ width: 34, flex: '0 0 34px', textAlign: 'center', fontSize: r.place === 1 ? 26 : 20, color: r.place === 1 ? 'var(--a-num-rank)' : 'var(--a-ink)' }}>{r.place}</span>
            <span className="a-num" style={{ width: 80, flex: '0 0 80px', textAlign: 'right', fontSize: 18, color: 'var(--a-ink-2)' }}>{r.time}</span>
            <span style={{ width: 110, flex: '0 0 110px', textAlign: 'right', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}><span className="a-num" style={{ fontSize: 17, color: r.prizePP > 0 ? 'var(--a-num-money)' : 'var(--a-ink-3)' }}>{r.prizePP.toLocaleString('ja-JP')}</span> PP</span>
          </div>
        ))}
        {h.races.length === 0 && <p style={{ padding: '14px', fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)', borderTop: '1px solid var(--a-line)' }}>まだ出走していません。出走登録から初戦を選べます</p>}
        {h.races.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', height: 42, padding: '0 14px', borderTop: '2px solid var(--a-line)', background: 'var(--a-ivory)' }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--a-blue-d)' }}>戦績をすべて見る（{h.starts} 戦）</span>
          </div>
        )}
      </div>

      {/* 血統表 */}
      <div className="a-panel strong" style={{ marginTop: 16 }}>
        <div className="a-band" style={{ height: 44, padding: '0 18px', gap: 18, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '.12em' }}>血統表　5代</span>
          {h.crosses.map((c, i) => {
            const pal = CROSS_PALETTE[i];
            return pal !== undefined ? (
              <span key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 26, padding: '0 10px', borderRadius: 6, background: pal.bg, border: `2px solid ${pal.ink}` }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: pal.ink }}>{c.name} {c.label}</span>
              </span>
            ) : (
              <span key={c.name} style={{ fontSize: 12, fontWeight: 900 }}>{c.name} {c.label}</span>
            );
          })}
          {h.inbreedCoeff !== null && (
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 900 }}>インブリード係数 <span className="a-num" style={{ fontSize: 17 }}>{(h.inbreedCoeff * 100).toFixed(2)}</span>%</span>
          )}
        </div>
        <Pedigree horse={h} />
      </div>

      {/* 調教履歴 */}
      <div className="a-panel strong" style={{ marginTop: 16 }}>
        <div className="a-band" style={{ height: 38, padding: '0 14px', gap: 14 }}>
          <span className="a-lbl" style={{ ...hdr, width: 52, flex: '0 0 52px' }}>週</span>
          <span className="a-lbl" style={{ ...hdr, width: 130, flex: '0 0 130px' }}>メニュー</span>
          <span className="a-lbl" style={{ ...hdr, width: 150, flex: '0 0 150px' }}>主効果</span>
          <span className="a-lbl" style={{ ...hdr, width: 120, flex: '0 0 120px' }}>疲労</span>
          <span className="a-lbl" style={{ ...hdr, flex: 1, minWidth: 120 }}>記録</span>
        </div>
        {h.training.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', height: 42, padding: '0 14px', gap: 14, borderTop: '1px solid var(--a-line)', background: i % 2 === 1 ? 'var(--a-panel-2)' : '#fff' }}>
            <span className="a-num" style={{ width: 52, flex: '0 0 52px', fontSize: 14, color: 'var(--a-ink-3)' }}>{t.week}週</span>
            <span style={{ width: 130, flex: '0 0 130px', fontSize: 14, fontWeight: 900 }}>{t.menu}</span>
            <span style={{ width: 150, flex: '0 0 150px', fontSize: 13, fontWeight: 900, color: 'var(--a-green-d)' }}>{t.effect}</span>
            <span style={{ width: 120, flex: '0 0 120px', fontSize: 13, fontWeight: 900, color: t.fatigueDelta > 0 ? '#8a5a06' : 'var(--a-green-d)' }}>疲労 {t.fatigueDelta > 0 ? `+${t.fatigueDelta}` : `−${Math.abs(t.fatigueDelta)}`}</span>
            <span style={{ flex: 1, minWidth: 120, fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)', whiteSpace: 'nowrap' }}>{t.note}</span>
          </div>
        ))}
        {h.training.length === 0 && <p style={{ padding: '14px', fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)', borderTop: '1px solid var(--a-line)' }}>今週が最初の週です</p>}
      </div>
    </div>
  );
}
