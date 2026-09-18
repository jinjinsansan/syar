'use client';

/**
 * ★投票（馬券・マークシート風）— 正本 design/hud-ds/components/bet-sheet［アーケード］
 *   券種タブ（グロス）→ 馬番グリッド（32px の真円を金で塗る）→ 金額（EP・100 単位）→ 確認。右に「みんなの投票状況」（オッズに影響しない）。
 *   🔴 ★**2026-09-19・UI-2 で本番に繋ぎました**。★**見た目は仮**（★UI1-8 と同じ扱い・デザイナー便で差し替わります）。
 *   ⚠️ 憲法: 「購入」と書かない。EP を増やす導線なし。自馬出走レースは投票不可（§9.5）。不的中は静か。
 */
import { useEffect, useMemo, useState } from 'react';
import { BET_TYPES, DEMO_BET_RACE } from '../../../../lib/game-demo';
import { loadBetScreen, loadBetAllowance, placeBet, oddsKey, type BetScreenData, type BetAllowance } from '../../../../lib/bet-screen';
import { FrameBadge } from '../../../../components/ui';
import { formatEntryPoints } from '../../../../lib/format';

const AMOUNTS = [100, 500, 1000, 5000];
const MARK_COL = 70;

/** 券種タブ（選択中: 赤グロス＋下辺を白くして板と繋ぐ／未選択: 白→灰で沈む） */
function TypeTab({ label, selected, onClick }: { readonly label: string; readonly selected: boolean; readonly onClick: () => void }): React.ReactElement {
  return (
    <button className="story-tab" aria-pressed={selected} type="button" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', height: 42, padding: '0 20px', cursor: 'pointer', fontFamily: 'inherit',
      borderRadius: '10px 10px 0 0', border: '2px solid var(--a-edge)', borderBottom: selected ? '2px solid #fff' : '2px solid var(--a-edge)',
      backgroundImage: selected ? 'var(--a-gloss-red)' : 'linear-gradient(#fff,#e3ecf3)', color: selected ? '#fff' : 'var(--a-ink-2)',
      fontSize: 16, fontWeight: 900, boxShadow: selected ? 'var(--a-inset)' : 'inset 0 -3px 4px rgba(16,36,58,.12)', position: 'relative', zIndex: selected ? 2 : 1,
    }}>{label}</button>
  );
}

export default function BetPage(): React.ReactElement {
  /**
   * ★**本番データ**（★2026-09-19・UI-2）。★読み込み中と失敗を ★**必ず出します**。
   * ⚠️ ★失敗を空にしない（★「出馬表が無い」に見えてしまう・R-16）。
   */
  const [data, setData] = useState<BetScreenData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [betError, setBetError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * ★**冇等キー**。⚠️ ★**送るたびに作り直さないこと**— ★作り直すと ★**2 回目も通ります**。
   *    ★投票が 1 回通ったら、★**次の投票用に新しい鍵を作ります**（★連続して買えなくなるため）。
   */
  const [clientToken, setClientToken] = useState(() => crypto.randomUUID());
  /**
   * ★**あと何 EP 投票できるか**（★`0047`・BT-1/**BT-5**）。
   * ⚠️ ★**券種ごとに違う答え**なので、★**券種を選び直すたびに聞き直します**。
   *    ★`0044` は券種を渡さずに 1 度だけ読んでいて、★**誤った数を返していました**。
   */
  const [allowance, setAllowance] = useState<BetAllowance | null>(null);
  const [allowanceError, setAllowanceError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadBetScreen(null)
      .then((d) => { if (alive) setData(d); })
      .catch((e: unknown) => { if (alive) setLoadError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, []);

  /**
   * ⚠️ ★**見本と本番を混ぜています**（★UI1-8 の形）。
   *    ★本番から来るのは ★**出馬表・オッズ・残高・自馬の枠番**。
   *    🔴 ★**みんなの投票状況（`shares`）と 1 回の上限（`capPerBet`）は見本のまま**です —
   *    ★前者は公開する口が無く、★後者は `place_bet` が持っていて ★**画面が持つと二重帳簿**になります。
   *    ★上限に当たったことは ★**RPC の文言**で分かります。
   */
  const live = data?.race ?? null;
  const race = {
    ...DEMO_BET_RACE,
    id: live?.id ?? DEMO_BET_RACE.id,
    raceNo: live?.classLabel ?? DEMO_BET_RACE.raceNo,
    raceName: live?.raceName ?? DEMO_BET_RACE.raceName,
    cond: live?.cond ?? DEMO_BET_RACE.cond,
    deadline: live?.time ?? DEMO_BET_RACE.deadline,
    fieldSize: live?.entries.length ?? DEMO_BET_RACE.fieldSize,
    horses: live === null
      ? DEMO_BET_RACE.horses
      : live.entries.map((e) => ({ gate: e.gate, name: e.horseName })),
    ownGate: data === null ? null : (data.ownGates[0] ?? null),
    epBalance: data?.epBalance ?? DEMO_BET_RACE.epBalance,
  };

  const [typeKey, setTypeKey] = useState('trifecta');
  const type = BET_TYPES.find((t) => t.key === typeKey) ?? BET_TYPES[0]!;
  /** picks[col] = gate。順不同の券種は列 0 に複数入れる */
  const [picks, setPicks] = useState<(number | null)[]>([7, 3, 4]);
  const [unordered, setUnordered] = useState<number[]>([]);
  const [amount, setAmount] = useState(1000);
  const ordered = type.ordered;
  const cols = ordered ? type.picks : 1;
  const selection: number[] = ordered ? picks.slice(0, type.picks).filter((g): g is number => g !== null) : unordered;
  const complete = selection.length === type.picks;
  const blocked = race.ownGate !== null;
  /** ★オッズ（★サーバーが計算した値。★画面では計算しない・§9.2） */
  const currentOdds = live === null || !complete
    ? null
    : live.odds.get(oddsKey(typeKey, selection)) ?? null;

  /** ★投票する（★判定はすべて `place_bet` が持っています） */
  const submit = async (): Promise<void> => {
    if (live === null || !complete || busy) return;
    setBusy(true); setBetError(null); setPlaced(null);
    try {
      const r = await placeBet({
        raceId: live.id, betType: typeKey, selection, amount, clientToken,
      });
      if (r.ok) {
        setPlaced(r.betId);
        // ★次の投票用に新しい鍵（★同じ鍵では 2 回目が通らない）
        setClientToken(crypto.randomUUID());
      } else {
        // 🔴 ★**原文をそのまま**（★上限も §9.5 も RPC が持っています）
        setBetError(r.failure.message);
      }
    } catch (e) {
      setBetError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  /**
   * ★**券種が変わったら聞き直す**（★BT-5）。★投票が 1 回通ったあと（`placed`）も聞き直します。
   * ⚠️ ★失敗を null にしません（★「上限が無い」に見えてしまう・R-16）。★別に出します。
   */
  useEffect(() => {
    let alive = true;
    const id = data?.race?.id ?? null;
    if (id === null) { setAllowance(null); return; }
    setAllowanceError(null);
    loadBetAllowance(id, typeKey)
      .then((a) => { if (alive) setAllowance(a); })
      .catch((e: unknown) => { if (alive) { setAllowance(null); setAllowanceError(e instanceof Error ? e.message : String(e)); } });
    return () => { alive = false; };
  }, [data?.race?.id, typeKey, placed]);

  const enough = race.epBalance >= amount;
  const sep = ordered ? '→' : '−';
  /**
   * ★**狭い画面では、着順を 1 列ずつ出します**（★デザイン第4便・オーナー承認 2026-09-02）。
   *
   *   ★三連単は「1着・2着・3着」の 3 列。★360px では 1 列 ★**約 60px** しか取れず、
   *     ★丸を 44px 以上に保つと ★**馬名が潰れます**。
   *   → ★1 列だけ出し、★左右送りで着順を切り替えます。
   *
   * ⚠️ ★**閾値の 720px は `globals.css` の `@media (max-width: 720px)` と同じ数**です。
   *    ★片方だけ動かすと、★**版面と操作が別の幅で切り替わります**（★同じ量を 2 か所に持つ形）。
   */
  const NARROW_PX = 720;
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${NARROW_PX}px)`);
    const apply = (): void => { setNarrow(mq.matches); };
    apply();
    mq.addEventListener('change', apply);
    return () => { mq.removeEventListener('change', apply); };
  }, []);
  /** ★いま選んでいる着順（0 始まり） */
  const [activeCol, setActiveCol] = useState(0);
  /** ⚠️ ★券種を変えたら 1 着へ戻す。★戻さないと「3 着」のまま馬連（2 列）に入り、空の列を出します */
  useEffect(() => { setActiveCol(0); }, [typeKey]);
  /** ★順不同の券種（単勝・馬連など）は元から 1 列なので、送りは要りません */
  const paged = narrow && ordered && cols > 1;
  const shownCols = paged
    ? [Math.min(activeCol, cols - 1)]
    : Array.from({ length: cols }, (_, c) => c);
  const shareMax = useMemo(() => Math.max(...race.shares.map(([, p]) => p)), [race.shares]);

  const toggle = (gate: number, col: number): void => {
    if (ordered) {
      setPicks((prev) => {
        const next = [...prev];
        while (next.length < type.picks) next.push(null);
        // 同じ馬を別の着に置けない
        if (next.some((g, c) => g === gate && c !== col)) return prev;
        next[col] = next[col] === gate ? null : gate;
        return next;
      });
    } else {
      setUnordered((prev) => prev.includes(gate) ? prev.filter((g) => g !== gate) : prev.length < type.picks ? [...prev, gate] : prev);
    }
  };
  const clear = (): void => { setPicks([]); setUnordered([]); };
  const switchType = (key: string): void => { setTypeKey(key); clear(); };

  const badge = (g: number): React.ReactElement => <FrameBadge gate={g} fieldSize={race.fieldSize} w={32} h={24} font={16} />;

  return (
    <div style={{ padding: '22px 0 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <h1 className="a-band" style={{ height: 46, padding: '0 22px', borderRadius: 10, border: '2px solid var(--a-edge)', fontSize: 26, fontWeight: 900, letterSpacing: '.06em', textShadow: '0 2px 0 rgba(0,0,0,.3)', margin: 0 }}>投票</h1>
        <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--a-ink)' }}>{race.raceNo}　{race.raceName}　{race.cond}　{race.fieldSize}頭</span>
        {/* 🔴 ★読み込み中と失敗を必ず出す（★UI1-9） */}
        {data === null && loadError === null && (
          <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)', marginLeft: 10 }}>読み込んでいます…</span>
        )}
        {loadError !== null && (
          <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-red-d)', marginLeft: 10 }}>読み込めませんでした: {loadError}</span>
        )}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10, height: 44, padding: '0 18px', borderRadius: 10, backgroundImage: 'var(--a-gloss-red)', border: '2px solid var(--a-red-d)', boxShadow: 'var(--a-shadow-sm)' }}>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.1em', color: '#fff' }}>締切まで</span>
          <span className="a-num" style={{ fontSize: 30, color: '#fff' }}>{race.deadline}</span>
        </span>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>※ デモデータ（投票はサーバー RPC に接続するまで動きません）</p>

      {/* 券種タブ */}
      <div className="rc-tabs" style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
        {BET_TYPES.map((t) => <TypeTab key={t.key} label={t.label} selected={t.key === type.key} onClick={() => switchType(t.key)} />)}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* マークシート */}
        <div className="a-panel strong" style={{ flex: 1, minWidth: 0, borderRadius: '0 10px 10px 10px', marginTop: -2 }}>
          <div style={{ display: 'flex', alignItems: 'center', height: 40, backgroundImage: 'linear-gradient(#fff8e1,#ffefc0)', borderBottom: '2px solid #e6c979', opacity: blocked ? .3 : 1 }}>
            <span className="a-lbl" style={{ width: 56, flex: '0 0 56px', textAlign: 'center' }}>馬番</span>
            <span className="a-lbl" style={{ flex: 1, minWidth: 130 }}>馬名</span>
            {shownCols.map((c) => (
              <span key={c} style={{ width: MARK_COL, flex: `0 0 ${MARK_COL}px`, textAlign: 'center', fontSize: 13, fontWeight: 900, color: c === 0 && ordered ? 'var(--a-red-d)' : 'var(--a-ink-2)' }}>{ordered ? `${c + 1}着` : type.label}</span>
            ))}
          </div>
          {paged && (
            /**
             * ★左右送り。★いま何着を選んでいるかと、★他の着で選んだ馬を並べて出します
             *   （★1 列しか見えないので、★**選んだものが見えなくなる**のを防ぐため）。
             */
            <div className="bet-pager">
              <button
                type="button" onClick={() => setActiveCol((c) => Math.max(0, c - 1))}
                disabled={activeCol === 0} aria-label="前の着順"
              >←</button>
              <span className="bet-pager-now">{activeCol + 1} 着を選ぶ</span>
              <button
                type="button" onClick={() => setActiveCol((c) => Math.min(cols - 1, c + 1))}
                disabled={activeCol >= cols - 1} aria-label="次の着順"
              >→</button>
              <span className="bet-pager-picked">
                {Array.from({ length: cols }, (_, c) => {
                  const g = picks[c];
                  return (
                    <button
                      key={c} type="button" onClick={() => setActiveCol(c)}
                      className={c === activeCol ? 'on' : undefined}
                    >{c + 1}着 {g === null || g === undefined ? '—' : g}</button>
                  );
                })}
              </span>
            </div>
          )}
          <div style={{ opacity: blocked ? .3 : 1, pointerEvents: blocked ? 'none' : 'auto' }}>
            {race.horses.map((h, i) => (
              <div key={h.gate} style={{ display: 'flex', alignItems: 'center', height: 44, borderTop: '1px solid var(--a-line)', background: i % 2 === 1 ? 'var(--a-panel-2)' : '#fff' }}>
                <span style={{ width: 56, flex: '0 0 56px', display: 'flex', justifyContent: 'center' }}><FrameBadge gate={h.gate} fieldSize={race.fieldSize} w={38} h={28} font={19} /></span>
                <span style={{ flex: 1, minWidth: 130, fontSize: 15, fontWeight: 900, color: 'var(--a-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</span>
                {shownCols.map((c) => {
                  const on = ordered ? picks[c] === h.gate : unordered.includes(h.gate);
                  const usedElsewhere = ordered ? picks.some((g, cc) => g === h.gate && cc !== c) : (!on && unordered.length >= type.picks);
                  return (
                    <span key={c} style={{ width: MARK_COL, flex: `0 0 ${MARK_COL}px`, display: 'flex', justifyContent: 'center' }}>
                      <button type="button" onClick={() => toggle(h.gate, c)} disabled={usedElsewhere} style={{
                        width: 32, height: 32, borderRadius: '50%', cursor: usedElsewhere ? 'default' : 'pointer', padding: 0, fontFamily: 'inherit',
                        border: `3px solid ${on ? '#8a5a06' : '#a9bccd'}`,
                        backgroundImage: on ? 'var(--a-gloss-gold)' : 'linear-gradient(#fff,#eef4fa)',
                        boxShadow: on ? '0 2px 0 #8a5a06' : 'inset 0 1px 0 #fff',
                        opacity: usedElsewhere ? .35 : 1,
                        color: on ? '#4a3105' : 'transparent', fontSize: 15, fontWeight: 900,
                      }}>{ordered ? c + 1 : unordered.indexOf(h.gate) + 1}</button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          {blocked && race.ownGate !== null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', borderTop: '2px solid var(--a-line)' }}>
              <span style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderRadius: 8, backgroundImage: 'linear-gradient(#ffeceb,#ffdcd9)', border: '2px solid var(--a-red-d)', fontSize: 14, fontWeight: 900, color: 'var(--a-red-d)' }}>
                このレースには自分の馬（{race.ownGate}番 {race.horses[race.ownGate - 1]?.name}）が出走しているため、投票できません
              </span>
              <a className="a-btn a-btn-blue" href="/race" style={{ marginLeft: 'auto', height: 38, padding: '0 20px', fontSize: 14 }}>中継を観る</a>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 52, padding: '0 16px', backgroundImage: 'var(--a-gloss-gold)', borderTop: '2px solid #8a5a06' }}>
              <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.12em', color: '#4a3105' }}>選択中</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {selection.length === 0 ? <span style={{ fontSize: 14, fontWeight: 900, color: '#4a3105' }}>あと {type.picks} 頭</span>
                  : selection.map((g, i) => (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {i > 0 && <span style={{ fontSize: 16, fontWeight: 900, color: '#4a3105' }}>{sep}</span>}{badge(g)}
                    </span>
                  ))}
              </span>
              <span style={{ fontSize: 14, fontWeight: 900, color: '#4a3105' }}>{complete ? '1 通り' : `あと ${type.picks - selection.length} 頭`}</span>
              <button type="button" onClick={clear} className="a-btn" style={{ marginLeft: 'auto', height: 32, padding: '0 14px', fontSize: 13 }}>マークを消す</button>
            </div>
          )}
        </div>

        {/* 右: 金額と投票状況 */}
        <div style={{ width: 352, flex: '0 0 352px', display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14, opacity: blocked ? .3 : 1, pointerEvents: blocked ? 'none' : 'auto' }}>
          <div className="a-panel strong">
            <div className="a-band" style={{ height: 38, padding: '0 16px', fontSize: 15, fontWeight: 900, letterSpacing: '.1em' }}>投票する額</div>
            <div style={{ padding: '14px 16px 16px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" className="a-btn" onClick={() => setAmount((a) => Math.max(100, a - 100))} style={{ width: 46, height: 46, fontSize: 24 }}>−</button>
                <span style={{ flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 10, background: '#fff', border: '2px solid var(--a-edge)' }}>
                  <span className="a-num" style={{ fontSize: 38, color: 'var(--a-num-money)' }}>{amount.toLocaleString('ja-JP')}</span> <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)' }}>EP</span>
                </span>
                <button type="button" className="a-btn a-btn-gold" onClick={() => setAmount((a) => Math.min(race.capPerBet, a + 100))} style={{ width: 46, height: 46, fontSize: 24 }}>＋</button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                {AMOUNTS.map((v) => {
                  const sel = v === amount;
                  return (
                    <button key={v} type="button" onClick={() => setAmount(v)} className={`a-chip${sel ? ' gold' : ''}`} style={{ flex: 1, justifyContent: 'center', height: 32, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: sel ? '#4a3105' : 'var(--a-ink-2)' }}>{v.toLocaleString('ja-JP')}</button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '2px solid var(--a-line)', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>
                <span>1 回の上限 <span className="a-num" style={{ fontSize: 16, color: 'var(--a-ink)' }}>{race.capPerBet.toLocaleString('ja-JP')}</span> EP</span>
                <span>投票後の残り <span className="a-num" style={{ fontSize: 16, color: 'var(--a-num-time)' }}>{Math.max(0, race.epBalance - amount).toLocaleString('ja-JP')}</span> EP</span>
              </div>
              {/**
                * ★**あと何 EP**（★`0047`・BT-1/BT-5）。★サーバーが出した ★**判断の結果**だけを出します。
                * ⚠️ ★`bindingLabel` は ★**効いている上限の名前**であって「達した」ではありません（★`0045`）。
                *    ★「達した」かどうかは ★**残りが 0 か**で、★ここで言います。
                */}
              {allowance !== null && (
                <div style={{ fontSize: 12, fontWeight: 900, marginTop: 8, color: allowance.remainingEP === 0 ? 'var(--a-red-d)' : 'var(--a-ink-2)' }}>
                  {allowance.remainingEP === 0
                    ? `${allowance.bindingLabel}に達しています`
                    : <>この券種であと <span className="a-num" style={{ fontSize: 16, color: 'var(--a-ink)' }}>{allowance.remainingEP.toLocaleString('ja-JP')}</span> EP（{allowance.bindingLabel}）</>}
                </div>
              )}
              {allowanceError !== null && (
                <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-red-d)', marginTop: 8 }}>{allowanceError}</div>
              )}
              {/* ★オッズ（★サーバーが計算した値・§9.2。★画面では計算しません） */}
              {currentOdds !== null && (
                <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)', marginTop: 8 }}>
                  この買い目のオッズ <span className="a-num" style={{ fontSize: 18, color: 'var(--a-ink)' }}>{currentOdds.toFixed(1)}</span> 倍
                </div>
              )}
              <button
                type="button"
                className={`a-btn a-btn-gold${complete && enough && !busy && live !== null ? '' : ' off'}`}
                style={{ width: '100%', height: 52, marginTop: 14, fontSize: 17, cursor: 'pointer', fontFamily: 'inherit' }}
                onClick={() => { void submit(); }}
                disabled={!complete || !enough || busy || live === null}
              >
                {busy ? '送っています…' : `${type.label}に ${formatEntryPoints(amount)} を投票する`}
              </button>
              {!enough && <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-red-d)', marginTop: 6 }}>参加ポイントが足りません</div>}
              {/* 🔴 ★**失敗を握り潰さない**（★UI1-9 と同じ作法。★原文をそのまま出す） */}
              {betError !== null && (
                <div style={{ marginTop: 8, padding: '9px 12px', borderRadius: 8, background: '#ffeceb', border: '2px solid var(--a-red-d)' }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-red-d)', lineHeight: 1.7 }}>{betError}</span>
                </div>
              )}
              {placed !== null && (
                <div style={{ marginTop: 8, padding: '9px 12px', borderRadius: 8, background: '#eaf3fb', border: '2px solid #9fc0dc' }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink)', lineHeight: 1.7 }}>投票しました</span>
                </div>
              )}
              <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)', marginTop: 10, lineHeight: 1.7 }}>締切後は取消できません。参加ポイントは投票時に引かれ、的中すると賞金ポイント（PP）で払戻されます</div>
            </div>
          </div>
          <div className="a-panel">
            <div style={{ display: 'flex', alignItems: 'center', height: 34, padding: '0 14px', backgroundImage: 'linear-gradient(#fff,#e3ecf3)', borderBottom: '2px solid var(--a-line)' }}>
              <span className="a-lbl">みんなの投票状況</span><span className="a-lbl" style={{ marginLeft: 'auto', color: 'var(--a-ink-3)' }}>単勝の支持</span>
            </div>
            <div style={{ padding: '10px 14px 14px' }}>
              {race.shares.map(([gate, pct]) => (
                <div key={gate} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 34 }}>
                  {badge(gate)}
                  <span style={{ flex: 1, height: 12, borderRadius: 6, background: '#e3ecf3', border: '2px solid var(--a-edge-soft)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${(pct / shareMax) * 100}%`, height: '100%', backgroundImage: 'linear-gradient(#8fb3d0,#5d87ab)' }} /></span>
                  <span className="a-num" style={{ width: 38, textAlign: 'right', fontSize: 16, color: 'var(--a-ink-2)' }}>{pct}%</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '10px 12px', borderRadius: 8, background: '#eaf3fb', border: '2px solid #9fc0dc' }}>
                <span style={{ fontSize: 12, fontWeight: 900, lineHeight: 1.6, color: 'var(--a-ink)' }}>支持の目安です。<span style={{ color: 'var(--a-red-d)' }}>オッズには影響しません</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
