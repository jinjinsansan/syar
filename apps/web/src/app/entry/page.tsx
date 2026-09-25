'use client';

/**
 * ★出走登録 — 正本 design/hud-ds/components/race-entry［アーケード］
 *   馬タブ → 出走できるレース一覧 → 確認パネル（脚質・斤量・出走料・登録）。
 *   ⚠️ 今はデモデータ。登録・取消はサーバー RPC に繋ぐまで動かない。可否（格・締切）はサーバー判断を表示するだけ。
 *   ⚠️ §9.5: 自分の馬が出るレースは投票できない旨を登録前から常時表示。
 *      ★2026-09-17: ★画面の語を「投票」に統一（★引き渡し資料 §2-2・A-4）。
 */
import { useEffect, useMemo, useState } from 'react';
import { conditionView, fatigueColor, type Condition } from '../../lib/stable';
import { STRATEGY_OPTIONS, DEMO_JOCKEY_RIDES } from '../../lib/game-demo';
import { loadEntryScreen, toEntryRaceView, type EntryScreenData } from '../../lib/entry-screen';
import { supabaseEntryRepo } from '../../lib/entry-repo';
import { Capsule, ClassChip, FatigueBar, PageTitle, Pill, TabButton } from '../../components/ui';
/** ★騎手を選ぶ（★D12-4・D-105 ④「出走登録で凍結する」） */
import { JockeyPicker } from '../../components/jockey-picker';

/**
 * 🔴 ★**見た目は仮です**（★2026-09-19・**UI1-8**）。
 *   ★読み込み中・失敗の見せ方は ★**デザイナー便**で決めます（2026-09-15 オーナー指示）。
 *   ★ここにあるのは ★**「あるか無いか」の側**だけです —
 *   ★表示が無いと ★**結線が正しいかを確かめられず**、★失敗が黙って消えます（R-16）。
 *   ⚠️ ★**これを「デザイン」と思わないでください。**
 */
//    ★上の註記のとおりです。★定数は置きません（★使わない値を置くと、★何かを切り替えているように読めます）。

/** 一覧の列幅（固定列は flex:0 0 <幅>） */
const COL = { time: 70, no: 42, cls: 112, heads: 54, fee: 88, deadline: 104, state: 126 } as const;

export default function EntryPage(): React.ReactElement {
  /**
   * ★**本番データ**（★2026-09-19・UI1）。★読み込み中と失敗を ★**必ず出します**。
   * ⚠️ ★失敗を空配列にしない（★「レースが無い」に見えてしまう・R-16）。
   */
  const [data, setData] = useState<EntryScreenData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /**
   * ★**「いま」は 1 回だけ固定します**（★描画のたびに動くと締切の表示が揃いません）。
   * ⚠️ ★これは ★**画面の時計**ですが、★**締切そのものはサーバーが書いた値**です（ED-1）。
   *    ★ここで使うのは「あと何分か」の表示だけで、★**判定は RPC がします**。
   */
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    loadEntryScreen()
      .then((d) => {
        if (!alive) return;
        setData(d);
        // ★最初の 1 頭を選んだ状態にする（★タブがどれも選ばれていないと読めない）
        setHorseId((cur) => (cur === '' ? (d.horses[0]?.id ?? '') : cur));
      })
      .catch((e: unknown) => { if (alive) setLoadError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, []);

  const horses = data?.horses ?? [];
  const [horseId, setHorseId] = useState('');
  const [raceId, setRaceId] = useState<string | null>(null);
  const [strategy, setStrategy] = useState('sashi');
  /**
   * ★**選んだ騎手**（★D12-4・D-105 ④「出走登録で凍結する」）。
   * ⚠️ ★この便では ★**着順に効きません**（★`JOCKEY_EFFECT` が 0）。
   */
  const [jockeyId, setJockeyId] = useState<string | null>(null);
  const horse = horses.find((h) => h.id === horseId) ?? horses[0] ?? null;
  /**
   * ★**出走できるかは「選んでいる馬」ごとに変わります**（★勝利数で資格が決まる）。
   * ★そのたびに組み直します（★`toEntryRaceView` は純粋な変換）。
   */
  const races = useMemo(() => {
    if (data === null) return [];
    const wins = horse?.wins ?? 0;
    const order = { ok: 0, class: 1, closed: 2 } as const;
    return data.raceRows
      .map((r) => toEntryRaceView(r, data.headsByRace.get(r.id) ?? 0, wins, nowMs))
      .sort((a, b) => order[a.state] - order[b.state] || a.time.localeCompare(b.time));
  }, [data, horse?.wins, nowMs]);
  const race = races.find((r) => r.id === raceId) ?? null;
  /**
   * ⚠️ ★`condition` は DB では `int` ですが、★画面の `Condition` は 1〜5 のリテラル型です。
   *    ★**範囲外は黙って通さず、★真ん中に寄せます**（★DB 側に制約があるので本来起きません）。
   */
  const condValue = Math.min(5, Math.max(1, Math.round(horse?.condition ?? 3))) as Condition;
  const cond = horse === null ? null : conditionView(condValue);
  const epBalance = data?.epBalance ?? 0;
  const enough = race === null ? false : epBalance >= race.feeEP;

  /**
   * ★**登録を送る**（★2026-09-25 に繋いだ）。
   * ⚠️ ★冪等キーは ★**1 回だけ**作ります（★送るたびに作り直すと二重登録になる・V-19 ⑭）。
   *    ★成功したら次のために作り直します。
   * ⚠️ ★失敗の文言は ★**サーバーのものをそのまま**出します（★推測で言い換えない・UI1-9）。
   */
  const [clientToken, setClientToken] = useState(() => crypto.randomUUID());
  const [entering, setEntering] = useState(false);
  const [entryMessage, setEntryMessage] = useState<{ readonly ok: boolean; readonly text: string } | null>(null);
  const submitEntry = async (): Promise<void> => {
    if (race === null || horse === null || entering || !enough) return;
    /**
     * 🔴 ★**取り消せる範囲を、押す前に言います**（★D-123・簿 `ONE-WAY-DOORS`）。
     *    ★出走の取消は ★**発売の準備に入る前まで**です。★押した後に知らせない。
     */
    if (!window.confirm(
      `${race.raceNo}　${race.classLabel}　${race.course}\n`
      + `${horse.name}・${STRATEGY_OPTIONS.find((s) => s.key === strategy)?.label ?? strategy}\n`
      + `出走料 ${race.feeEP} EP（登録後の残り ${(epBalance - race.feeEP).toLocaleString('ja-JP')} EP）\n\n`
      + '登録の取消は、発売の準備に入る前までしかできません。この内容でよろしいですか？',
    )) return;
    setEntering(true);
    setEntryMessage(null);
    try {
      const result = await supabaseEntryRepo.enter({
        raceId: race.id, horseId: horse.id, strategy,
        // ⚠️ ★騎手はまだ着順に効きません（★`JockeyPicker` の註記）。★選んだ id だけ凍結します
        jockeyFrozen: jockeyId === null ? null : { id: jockeyId },
        clientToken,
      });
      if (result.ok) {
        setClientToken(crypto.randomUUID());
        setEntryMessage({ ok: true, text: `登録しました（${race.raceNo}　${horse.name}）` });
        setRaceId(null);
        loadEntryScreen().then(setData).catch(() => { /* ★読み直せなくても登録は済んでいる */ });
      } else {
        setEntryMessage({ ok: false, text: result.failure.message });
      }
    } catch (cause: unknown) {
      setEntryMessage({ ok: false, text: cause instanceof Error ? cause.message : String(cause) });
    } finally { setEntering(false); }
  };

  return (
    <div style={{ padding: '22px 0 40px' }}>
      <PageTitle
        title="出走登録"
        sub="出走料は参加ポイント（EP）から支払われます"
        right={<Capsule label="週" value={String(data?.gameWeek ?? '—')} />}
      />
      {/* 🔴 ★見た目は仮（UI1-8）。★データは本番です */}
      <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>
        ※ 見た目は仮です（デザイナー便で差し替わります）。データは本番のサーバーから読んでいます
        {data !== null && data.staleSeconds > 600 && (
          <span style={{ color: 'var(--a-red-d)' }}>／⚠️ 世界の更新が {Math.floor(data.staleSeconds / 60)} 分前で止まっています</span>
        )}
      </p>

      {/* 🔴 ★読み込み中と失敗を必ず出す（UI1-9・★黙って消さない） */}
      {loadError !== null && (
        <div style={{ margin: '12px 0 0', padding: '10px 13px', borderRadius: 8, background: '#ffeceb', border: '2px solid var(--a-red-d)' }}>
          <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-red-d)', lineHeight: 1.7 }}>読み込めませんでした: {loadError}</span>
        </div>
      )}
      {data === null && loadError === null && (
        <p style={{ margin: '12px 0 0', fontSize: 13, fontWeight: 900, color: 'var(--a-ink-3)' }}>読み込んでいます…</p>
      )}
      {data !== null && horses.length === 0 && (
        <p style={{ margin: '12px 0 0', fontSize: 13, fontWeight: 900, color: 'var(--a-ink-3)' }}>出走させられる馬がいません</p>
      )}

      {/* 馬タブ（休養中の馬はタブに出さず末尾に理由） */}
      <div className="rc-tabs" style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
        {horses.map((h) => <TabButton key={h.id} label={h.name} selected={h.id === horseId} onClick={() => setHorseId(h.id)} />)}
        {/* ⚠️ ★**休養中の除外はまだ入れていません** — ★`my_horses` に「今週の調教」が無く、
            ★`rest_until_week` と「いまの週」で判定できますが、★**本当に出せないのかは
            ★`enter_race` が決めます**（★画面で先回りして違う判定をすると CL-4 の形になります）。 */}
      </div>

      {/* 選択中の馬（タブと接続） */}
      {horse !== null && cond !== null && (
        <div className="a-panel strong rise" style={{ borderRadius: '0 10px 10px 10px', marginTop: -2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '16px 20px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <ClassChip label={horse.classLabel} classRank={horse.classRank} h={28} font={14} />
              <span style={{ fontSize: 28, fontWeight: 900 }}>{horse.name}</span>
              <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>{horse.sexAge}</span>
            </div>
            <div style={{ width: 2, height: 44, background: 'var(--a-line)' }} className="hide-narrow" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="a-lbl">疲労</span><FatigueBar value={horse.fatigue} width={110} color={fatigueColor(horse.fatigue)} />
              {horse.fatigue > 60 && <Pill tone="yellow">出走は可能・注意</Pill>}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 22, fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)', whiteSpace: 'nowrap' }}>
              <span>調子 <span style={{ color: cond.color }}>{cond.mark} {cond.label}</span></span>
              {/* ⚠️ ★**「今週の指示」は出せません** — ★`horses` に `training_menu` の列がありません
                  （★`/setup` の毛色・脚質と同じ、★**デモの作り物**でした）。★報告済み。 */}
              <span>戦績 <span style={{ color: 'var(--a-ink)' }}>{horse.starts} 戦 {horse.wins} 勝</span></span>
            </div>
          </div>
        </div>
      )}

      {/* レース一覧 */}
      <div className="a-panel strong" style={{ marginTop: 16 }}>
        <div className="a-band hide-narrow" style={{ height: 38, padding: '0 18px', gap: 14 }}>
          <span className="a-lbl" style={{ width: COL.time, flex: `0 0 ${COL.time}px`, color: '#fff' }}>発走</span>
          <span className="a-lbl" style={{ width: COL.no, flex: `0 0 ${COL.no}px`, color: '#fff' }}>R</span>
          <span className="a-lbl" style={{ width: COL.cls, flex: `0 0 ${COL.cls}px`, color: '#fff' }}>格</span>
          <span className="a-lbl" style={{ flex: 1, minWidth: 160, color: '#fff' }}>コース</span>
          <span className="a-lbl" style={{ width: COL.heads, flex: `0 0 ${COL.heads}px`, textAlign: 'right', color: '#fff' }}>頭数</span>
          <span className="a-lbl" style={{ width: COL.fee, flex: `0 0 ${COL.fee}px`, textAlign: 'right', color: '#fff' }}>出走料</span>
          <span className="a-lbl" style={{ width: COL.deadline, flex: `0 0 ${COL.deadline}px`, textAlign: 'right', color: '#fff' }}>締切</span>
          <span className="a-lbl" style={{ width: COL.state, flex: `0 0 ${COL.state}px`, textAlign: 'right', color: '#fff' }}>状態</span>
        </div>
        {races.map((r, i) => {
          const sel = r.id === raceId;
          const disabled = r.state !== 'ok';
          // 格違い・締切後は地 #e7edf3 だけで沈める（不透明度は掛けない）
          const bg = sel ? 'linear-gradient(#fffdf2,#fff3cf)' : disabled ? '#e7edf3' : i % 2 === 1 ? 'var(--a-panel-2)' : '#fff';
          return (
            <div key={r.id} onClick={() => { if (!disabled) setRaceId(r.id); }} className="en-row" style={{
              display: 'flex', alignItems: 'center', height: 64, padding: '0 18px', gap: 14, borderTop: '1px solid var(--a-line)', color: 'var(--a-ink)',
              cursor: disabled ? 'default' : 'pointer', background: bg, boxShadow: sel ? 'inset 5px 0 0 #f2b012' : undefined,
            }}>
              <span className="a-num en-time" style={{ width: COL.time, flex: `0 0 ${COL.time}px`, fontSize: 26, color: 'var(--a-num-time)' }}>{r.time}</span>
              <span className="a-num en-no" style={{ width: COL.no, flex: `0 0 ${COL.no}px`, fontSize: 17, color: 'var(--a-ink-2)' }}>{r.raceNo}</span>
              <span className="en-cls" style={{ width: COL.cls, flex: `0 0 ${COL.cls}px` }}><ClassChip label={r.classLabel} classRank={r.classRank} h={24} font={12} /></span>
              <span className="en-course" style={{ flex: 1, minWidth: 160, fontSize: 15, fontWeight: 900, whiteSpace: 'nowrap' }}>{r.course}<span style={{ marginLeft: 10, fontSize: 13, color: 'var(--a-ink-3)' }}>馬場 {r.going}</span></span>
              <span className="a-num en-heads" style={{ width: COL.heads, flex: `0 0 ${COL.heads}px`, textAlign: 'right', fontSize: 17, color: 'var(--a-ink-2)' }}>{r.heads}頭</span>
              <span className="en-fee" style={{ width: COL.fee, flex: `0 0 ${COL.fee}px`, textAlign: 'right', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}><span className="a-num" style={{ fontSize: 21, color: 'var(--a-num-money)' }}>{r.feeEP}</span> EP</span>
              <span className="en-deadline" style={{ width: COL.deadline, flex: `0 0 ${COL.deadline}px`, textAlign: 'right', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)', whiteSpace: 'nowrap' }}>{r.deadline === null ? '—' : `締切 ${r.deadline}`}</span>
              <span className="en-state" style={{ width: COL.state, flex: `0 0 ${COL.state}px`, display: 'flex', justifyContent: 'flex-end' }}>
                {sel ? <Pill tone="gold">選択中</Pill>
                  : r.state === 'ok' ? <Pill tone="green">登録できます</Pill>
                    : <Pill tone="grey">{r.state === 'class' ? '格が違います' : '締切後'}</Pill>}
              </span>
            </div>
          );
        })}
        {races.every((r) => r.state !== 'ok') && (
          <div style={{ padding: '14px 18px', borderTop: '1px solid var(--a-line)' }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>今週は出走できるレースがありません</div>
          </div>
        )}
      </div>

      {/* 確認パネル */}
      {race !== null && horse !== null && (
        <div className="a-panel strong" style={{ marginTop: 16 }}>
          <div className="a-band" style={{ height: 40, padding: '0 18px', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '.12em' }}>登録の確認</span>
            {race.deadline !== null && <span style={{ fontSize: 13, fontWeight: 900 }}>登録締切まで {race.deadline}</span>}
          </div>
          <div style={{ display: 'flex', gap: 24, padding: '18px 20px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 360 }}>
              <div style={{ fontSize: 26, fontWeight: 900 }}>{race.raceNo}　{race.classLabel}　{race.course}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <span className="a-chip" style={{ height: 30, padding: '0 14px', fontSize: 14 }}>発走 {race.time}</span>
                <span className="a-chip" style={{ height: 30, padding: '0 14px', fontSize: 14 }}>馬場 {race.going}</span>
                <span className="a-chip" style={{ height: 30, padding: '0 14px', fontSize: 14 }}>{race.heads} 頭</span>
              </div>
              <div style={{ marginTop: 18 }}><span className="a-lbl">脚質</span>
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  {STRATEGY_OPTIONS.map((s) => {
                    const sel = s.key === strategy;
                    return (
                      <button key={s.key} type="button" onClick={() => setStrategy(s.key)} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', height: 42, padding: '0 22px', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 10,
                        border: sel ? '3px solid var(--a-edge)' : '2px solid var(--a-edge-soft)',
                        backgroundImage: sel ? 'var(--a-gloss-blue)' : 'linear-gradient(#fff,#e9eff5)',
                        color: sel ? '#fff' : 'var(--a-ink-2)', fontSize: 16, fontWeight: 900,
                        boxShadow: sel ? 'var(--a-shadow-sm)' : 'inset 0 -2px 3px rgba(16,36,58,.1)',
                      }}>{s.label}</button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)', marginTop: 10, lineHeight: 1.7 }}>脚質は今回のレースにだけ適用されます。馬の適性から外れた指示は道中で崩れやすくなります</div>
              </div>
            </div>
            <div style={{ width: 2, alignSelf: 'stretch', background: 'var(--a-line)' }} className="hide-narrow" />
            <div style={{ width: 340, flex: '0 0 340px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 44, borderBottom: '1px solid var(--a-line)' }}><span className="a-lbl">斤量</span><span><span className="a-num" style={{ fontSize: 30, color: 'var(--a-ink)' }}>{race.weightKg.toFixed(1)}</span> <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>kg</span></span></div>
              {/*
                ★**騎手を選ぶ**（★D12-4・D-105）。★脚質の次・料金の前に置きます
                （★騎手の料金が出走料に足されるので、★料金を見る前に選ぶ順序）。
                ⚠️ ★この便では ★**着順に効きません**（★部品の側で明言しています）。
              */}
              <JockeyPicker
                horseName={horse?.name ?? ''}
                raceName={`${race.raceNo}　${race.classLabel}`}
                /* ⚠️ ★**騎乗回数はまだ見本です** — ★`race_entries.jockey_frozen` は CLOSED で、
                   ★画面から数える口がありません（★報告済み）。 */
                rides={DEMO_JOCKEY_RIDES}
                selectedId={jockeyId}
                onSelect={setJockeyId}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 44, borderBottom: '1px solid var(--a-line)' }}><span className="a-lbl">出走料</span><span><span className="a-num" style={{ fontSize: 30, color: 'var(--a-num-money)' }}>{race.feeEP}</span> <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>EP</span></span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 44, borderBottom: '1px solid var(--a-line)' }}><span className="a-lbl">登録後の残り</span><span><span className="a-num" style={{ fontSize: 30, color: 'var(--a-num-time)' }}>{(epBalance - race.feeEP).toLocaleString('ja-JP')}</span> <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>EP</span></span></div>
              {/* §9.5 憲法の明示 — 登録前から常時表示し、登録後も残す */}
              <div style={{ marginTop: 12, padding: '11px 13px', borderRadius: 8, background: '#eaf3fb', border: '2px solid #9fc0dc' }}><span style={{ fontSize: 13, fontWeight: 900, color: 'var(--a-ink)', lineHeight: 1.6 }}>自分の馬が出るレースは投票できません</span></div>
              {/*
                🔴 ★**ここは `<span>` でした**（★2026-09-25 に発覚）。
                   ★`title="サーバー接続まで押せません"` と書かれたまま、★`onClick` が無く、
                   ★**押しても何も起きません**でした。★`supabaseEntryRepo.enter` は在るのに、
                   ★**誰も呼んでいません**でした（★本番の登録実績 0 件）。
                ⚠️ ★**押す前に「取り消せるか」を言います**（★D-123・簿 `ONE-WAY-DOORS`）。
                   ★出走の取消は ★**発売の準備に入る前まで**しかできません。
              */}
              <button
                type="button"
                className={`a-btn a-btn-gold${enough && !entering ? '' : ' off'}`}
                style={{
                  height: 52, marginTop: 12, fontSize: 18, width: '100%', fontFamily: 'inherit',
                  cursor: enough && !entering ? 'pointer' : 'not-allowed',
                  ...(enough && !entering ? {} : { opacity: .4 }),
                }}
                disabled={!enough || entering}
                onClick={() => { void submitEntry(); }}
              >{entering ? '登録しています…' : `登録する（${race.feeEP} EP）`}</button>
              {!enough && <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-red-d)', marginTop: 6 }}>参加ポイントが足りません</div>}
              {entryMessage !== null && (
                <div role={entryMessage.ok ? 'status' : 'alert'} style={{
                  marginTop: 8, padding: '10px 12px', borderRadius: 8, fontSize: 13, fontWeight: 900, lineHeight: 1.7,
                  background: entryMessage.ok ? '#e8f6ec' : '#ffeceb',
                  border: `2px solid ${entryMessage.ok ? '#3f8f57' : 'var(--a-red-d)'}`,
                  color: entryMessage.ok ? '#1d5c31' : 'var(--a-red-d)',
                }}>{entryMessage.text}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
