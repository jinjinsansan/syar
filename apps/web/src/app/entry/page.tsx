'use client';

/**
 * ★出走登録 — ★**馬物語 UI の骨格**（★2026-09-27・引き渡し資料 `design_handoff_uma_monogatari` §5 / §4.3）
 *   馬タブ → 出走できるレース一覧 → 確認パネル（脚質・斤量・騎手・出走料・登録）。
 *   ⚠️ §9.5: 自分の馬が出るレースは投票できない旨を登録前から常時表示。
 *
 * 【🔴 ★2026-09-27 に 白い旧い枠から移しました】
 *   ★オーナー指摘「★この白の間違っているデザインはいつ辞めるのですか」。
 *   ★引き渡し資料は ★§5 に ★全ページ共通の骨格（外枠・背景・上段バー・パネル・カプセル・ボタン）を、
 *   ★§4.3 に ★`/entry` の行き先を ★既に書いていました（★デザイナー待ちにしていたのは開発側の読み落とし）。
 *   → ★**骨格は資料どおりの部品**（`components/uma/uma-parts.tsx`）で組み、★**新しい意匠は作っていません**。
 *   ⚠️ ★**登録・読み込み・騎手選びの処理は 1 行も変えていません**（★見た目の層だけ）。
 *      ★画面が呼ぶサーバーの口は ★網 `screen-rebuild-pins` が釘付けにしています（★減れば落ちる）。
 */
import { useEffect, useMemo, useState } from 'react';
import { conditionView, type Condition } from '../../lib/stable';
import { STRATEGY_OPTIONS, DEMO_JOCKEY_RIDES } from '../../lib/game-demo';
import { loadEntryScreen, toEntryRaceView, type EntryScreenData } from '../../lib/entry-screen';
import { supabaseEntryRepo } from '../../lib/entry-repo';
import { Backdrop, BigButton, EpCapsule, NoticeBar, TextPanel, TopBar, useMotionPaused } from '../../components/uma/uma-parts';
import { RaceStrip } from '../../components/uma/race-strip';
/** ★騎手を選ぶ（★D12-4・D-105 ④「出走登録で凍結する」） */
import { JockeyPicker } from '../../components/jockey-picker';
import { CLAIM_ENTRY_NO_CANCEL, CLAIM_OWN_RACE_BET, CLAIM_STRATEGY } from '../../lib/claims';

/** ★紙パネル（★資料 §5.6: 紙 ＋ 見出し帯は濃紺・下に金 3px） */
const PAPER: React.CSSProperties = {
  position: 'relative', border: '2px solid rgba(246,194,28,.45)', borderRadius: 12,
  background: 'var(--u-paper)', color: 'var(--u-ink-dark)', overflow: 'hidden',
};
const PAPER_HEAD: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, padding: '8px 14px',
  background: 'var(--u-navy)', color: 'var(--u-ink-light)', borderBottom: '3px solid var(--u-gold)',
};
/** ★小さな札（★紙の上） */
const CHIP: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', minHeight: 26, padding: '0 10px', borderRadius: 999,
  border: '2px solid var(--u-navy)', background: '#fff', color: 'var(--u-ink-dark)', fontSize: 12, whiteSpace: 'nowrap',
};
/** ★1 行の外枠（★資料 §5.1: 内側 0 14px・最大 1220px） */
const ROW: React.CSSProperties = { position: 'relative', width: '100%', maxWidth: 1220, margin: '0 auto', padding: '0 14px' };

export default function EntryPage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
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
    const order = { ok: 0, entered: 1, class: 2, closed: 3 } as const;
    return data.raceRows
      .map((r) => toEntryRaceView(r, data.headsByRace.get(r.id) ?? 0, wins, nowMs,
        /** 🔴 ★選んでいる馬が ★このレースに登録済みか（★2026-09-27・★登録後も「登録できます」と出ていた） */
        horse !== null && (data.enteredHorsesByRace.get(r.id)?.has(horse.id) ?? false)))
      .sort((a, b) => order[a.state] - order[b.state] || a.time.localeCompare(b.time));
  }, [data, horse, nowMs]);
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
      + `${CLAIM_ENTRY_NO_CANCEL}この内容でよろしいですか？`,
    )) return;
    setEntering(true);
    setEntryMessage(null);
    try {
      const result = await supabaseEntryRepo.enter({
        raceId: race.id, horseId: horse.id, strategy,
        /**
         * 🔴 ★**id だけを送ります**（★2026-09-25・裁定 `REVIEW_JOCKEY_FEE_20260925.md`）。
         *   ⚠️ ★旧は `{ id: jockeyId }` を ★**凍結の中身として**送っていました。
         *     ★`enter_race` は `feeEP` を探して見つからず ★**料金 0** になっていました（★D-105 が効かない）。
         *     ★そして `feeEP: 0` を送れば ★高い騎手が無料になる形でもありました（★憲法 3）。
         *   → ★料金と凍結は ★サーバーが名簿（`jockeys`）から作ります。
         */
        jockeyId,
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

  return <div data-theme="uma" data-page-body className={paused ? 'u-paused' : undefined} style={{
    position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden',
    containerType: 'inline-size', background: 'var(--u-navy)', color: 'var(--u-ink-light)',
    display: 'flex', flexDirection: 'column', paddingBottom: 'var(--u-safe-bottom)',
  }}>
    <Backdrop />
    <TopBar title="出走登録" backHref="/mypage" paused={paused} onToggle={toggle} />
    <RaceStrip />

    {/* ★EP のカプセルと週（★資料 §5.6・★PP とは合算しない） */}
    <div style={{ ...ROW, display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10, alignItems: 'stretch' }}>
      {data !== null && data.signedIn && <EpCapsule value={epBalance} />}
      <div style={{
        flex: '0 1 auto', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
        border: '2px solid rgba(251,247,236,.28)', borderRadius: 12, background: 'var(--u-panel)',
      }}>
        <span style={{ fontSize: 12 }}>週</span>
        <strong style={{ fontSize: 22 }}>{data?.gameWeek ?? '—'}</strong>
        <span style={{ fontSize: 11, opacity: .8 }}>出走料は参加ポイント（EP）から支払われます</span>
      </div>
    </div>
    {data !== null && data.staleSeconds > 600 && (
      <div role="alert" style={{ ...ROW, marginTop: 8, fontSize: 12, color: 'var(--u-red)' }}>
        ⚠️ 世界の更新が {Math.floor(data.staleSeconds / 60)} 分前で止まっています
      </div>
    )}
    {/*
      ★**参加ポイントが足りないとき、★受け取る場所へ案内します**（★2026-09-27・オーナーが残高 0 で登録できなかった）。
      ★毎日のポイントは `/earn` で受け取れます（★D-075・★額は `ep_grant_amount` 1 か所）。★「購入」への導線ではありません（★憲法 §0.2）。
    */}
    {data !== null && data.signedIn && race !== null && !enough && (
      <NoticeBar kind="closing" text={`参加ポイントが足りません（あと ${(race.feeEP - epBalance).toLocaleString('ja-JP')} EP）`}
        sub="毎日のポイントを受け取れます" actionLabel="受け取る" actionHref="/earn" />
    )}

    <main style={{ ...ROW, flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
      {/* 🔴 ★読み込み中と失敗を必ず出す（UI1-9・★黙って消さない） */}
      {loadError !== null && (
        <div role="alert" style={{ padding: '10px 13px', borderRadius: 12, border: '2px solid var(--u-red)', background: 'var(--u-panel-strong)', fontSize: 13, lineHeight: 1.7 }}>
          読み込めませんでした: {loadError}
        </div>
      )}
      {data === null && loadError === null && <p style={{ margin: 0, fontSize: 13 }}>読み込んでいます…</p>}
      {/*
        🔴 ★**ログインしていない人に、★DB の生の文を出していました**（★2026-09-25・オーナー指摘）。
           ★`permission denied for view my_horses` がそのまま出て、★しかも
           ★**公開のレース一覧まで道連れ**で消え、★「今週は出走できるレースがありません」と
           ★**嘘**を出していました（★レースは在ります）。
      */}
      {data !== null && !data.signedIn && (
        <TextPanel style={{ margin: 0, width: '100%', fontSize: 13 }}>
          レースの一覧は見られます。登録するには <a href="/login" style={{ color: 'var(--u-gold)', textDecoration: 'underline' }}>ログイン</a> してください
        </TextPanel>
      )}
      {data !== null && data.signedIn && horses.length === 0 && <p style={{ margin: 0, fontSize: 13 }}>出走させられる馬がいません</p>}

      {/* 馬タブ（★選んでいる馬を金で示す） */}
      {horses.length > 0 && (
        <div role="tablist" aria-label="出走させる馬" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {horses.map((h) => {
            const sel = h.id === horseId || (horseId === '' && h.id === horse?.id);
            return <button key={h.id} type="button" role="tab" aria-selected={sel} onClick={() => setHorseId(h.id)} style={{
              minHeight: 44, padding: '0 16px', borderRadius: 10, fontSize: 14,
              border: sel ? '3px solid var(--u-navy)' : '2px solid rgba(251,247,236,.4)',
              background: sel ? 'var(--u-gold-plate)' : 'var(--u-panel)', color: sel ? 'var(--u-ink-dark)' : 'var(--u-ink-light)',
            }}>{h.name}</button>;
          })}
          {/* ⚠️ ★**休養中の除外はまだ入れていません** — ★`my_horses` に「今週の調教」が無く、
              ★`rest_until_week` と「いまの週」で判定できますが、★**本当に出せないのかは
              ★`enter_race` が決めます**（★画面で先回りして違う判定をすると CL-4 の形になります）。 */}
        </div>
      )}

      {/* 選択中の馬 */}
      {horse !== null && cond !== null && (
        <section aria-label={`${horse.name}の状態`} style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, padding: '12px 14px',
          border: '2px solid rgba(251,247,236,.28)', borderRadius: 12, background: 'var(--u-panel)',
        }}>
          <span style={{ ...CHIP, background: 'var(--u-gold-pale)' }}>{horse.classLabel}</span>
          <strong style={{ fontSize: 22 }}>{horse.name}</strong>
          <span style={{ fontSize: 13 }}>{horse.sexAge}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            疲労
            <span aria-hidden style={{ width: 100, height: 10, borderRadius: 5, background: 'rgba(251,247,236,.2)', overflow: 'hidden' }}>
              <span style={{ display: 'block', width: `${Math.min(100, Math.max(0, horse.fatigue))}%`, height: '100%', background: horse.fatigue > 60 ? 'var(--u-orange)' : 'var(--u-gauge)' }} />
            </span>
            <strong>{horse.fatigue}</strong>
            {horse.fatigue > 60 && <span style={{ color: 'var(--u-orange)' }}>出走は可能・注意</span>}
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 13, whiteSpace: 'nowrap' }}>
            <span>調子 {cond.mark} {cond.label}</span>
            {/* ⚠️ ★**「今週の指示」は出せません** — ★`horses` に `training_menu` の列がありません（★報告済み）。 */}
            <span>戦績 {horse.starts} 戦 {horse.wins} 勝</span>
          </span>
        </section>
      )}

      {/* レース一覧 */}
      <section aria-label="出走できるレース" style={PAPER}>
        <div style={PAPER_HEAD}><strong>出走できるレース</strong><span style={{ fontSize: 11 }}>{races.length} 件</span></div>
        {races.map((r) => {
          const sel = r.id === raceId;
          const disabled = r.state !== 'ok';
          return (
            <button key={r.id} type="button" disabled={disabled} onClick={() => { if (!disabled) setRaceId(r.id); }} style={{
              display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', width: '100%', minHeight: 64,
              padding: '10px 14px', border: 0, borderTop: '1px solid var(--u-rule)', textAlign: 'left',
              background: sel ? '#fff4cf' : disabled ? '#e9e5d8' : 'var(--u-paper)', color: 'var(--u-ink-dark)',
              boxShadow: sel ? 'inset 5px 0 0 var(--u-gold)' : undefined, cursor: disabled ? 'default' : 'pointer',
            }}>
              <strong style={{ fontSize: 22, minWidth: 64 }}>{r.time}</strong>
              <span style={{ fontSize: 15, minWidth: 38 }}>{r.raceNo}</span>
              <span style={CHIP}>{r.classLabel}</span>
              <span style={{ flex: '1 1 180px', fontSize: 15 }}>{r.course}<span style={{ marginLeft: 10, fontSize: 12, opacity: .7 }}>馬場 {r.going}</span></span>
              <span style={{ fontSize: 13 }}>{r.heads}頭</span>
              <span style={{ fontSize: 13 }}><strong style={{ fontSize: 18 }}>{r.feeEP}</strong> EP</span>
              <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{r.deadline === null ? '—' : `締切 ${r.deadline}`}</span>
              <span style={{
                ...CHIP,
                background: sel ? 'var(--u-gold-pale)' : r.state === 'ok' ? '#dff3e5' : r.state === 'entered' ? '#dbe8f7' : '#ddd8c9',
                borderColor: sel ? 'var(--u-gold-deep)' : r.state === 'ok' ? 'var(--u-green-deep)' : r.state === 'entered' ? '#1a4f8a' : '#9a947f',
              }}>
                {sel ? '選択中' : r.state === 'ok' ? '登録できます' : r.state === 'entered' ? '登録済み' : r.state === 'class' ? '格が違います' : '締切後'}
              </span>
            </button>
          );
        })}
        {/*
          ⚠️ ★**「出走できるレースがありません」は、★条件を選んで言うこと**（★2026-09-25）。
             ★ログインしていない・馬がいない ときは ★**資格が判定できない**だけで、
             ★レースが無いわけではありません。★そこで同じ文を出すと ★**嘘**になります。
        */}
        {races.length > 0 && races.every((r) => r.state !== 'ok') && (
          <div style={{ padding: '14px', borderTop: '1px solid var(--u-rule)', fontSize: 14 }}>
            {data === null || !data.signedIn
              ? 'ログインすると、この馬で出走できるかが分かります'
              : horse === null
                ? '出走させられる馬がいません'
                : races.some((r) => r.state === 'entered')
                  ? 'この馬は登録済みです（発走を待っています）'
                  : 'いま、この馬で出走できるレースがありません'}
          </div>
        )}
        {races.length === 0 && data !== null && (
          <div style={{ padding: '14px', borderTop: '1px solid var(--u-rule)', fontSize: 14 }}>
            いま受け付けているレースがありません（次の組が公示されるまでお待ちください）
          </div>
        )}
      </section>

      {/* 確認パネル */}
      {race !== null && horse !== null && (
        <section aria-label="登録の確認" style={PAPER}>
          <div style={{ ...PAPER_HEAD, justifyContent: 'space-between' }}>
            <strong>登録の確認</strong>
            {race.deadline !== null && <span style={{ fontSize: 13 }}>登録締切まで {race.deadline}</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, padding: '14px' }}>
            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
              <div style={{ fontSize: 22 }}>{race.raceNo}　{race.classLabel}　{race.course}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <span style={CHIP}>発走 {race.time}</span>
                <span style={CHIP}>馬場 {race.going}</span>
                <span style={CHIP}>{race.heads} 頭</span>
              </div>
              <div style={{ marginTop: 16, fontSize: 13 }}>脚質</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {STRATEGY_OPTIONS.map((s) => {
                  const sel = s.key === strategy;
                  return (
                    <button key={s.key} type="button" aria-pressed={sel} onClick={() => setStrategy(s.key)} style={{
                      minHeight: 44, padding: '0 20px', borderRadius: 10, fontSize: 15,
                      border: sel ? '3px solid var(--u-navy)' : '2px solid var(--u-rule)',
                      background: sel ? 'linear-gradient(#5fa9ee,#1a6fd4 46%,#0f56ab)' : '#fff',
                      color: sel ? '#fff' : 'var(--u-ink-dark)',
                    }}>{s.label}</button>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, marginTop: 10, lineHeight: 1.7, opacity: .8 }}>{CLAIM_STRATEGY}</div>
            </div>
            <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, borderBottom: '1px solid var(--u-rule)' }}>
                <span style={{ fontSize: 13 }}>斤量</span><span><strong style={{ fontSize: 26 }}>{race.weightKg.toFixed(1)}</strong> kg</span>
              </div>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, borderBottom: '1px solid var(--u-rule)' }}>
                <span style={{ fontSize: 13 }}>出走料</span><span><strong style={{ fontSize: 26 }}>{race.feeEP}</strong> EP</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, borderBottom: '1px solid var(--u-rule)' }}>
                <span style={{ fontSize: 13 }}>登録後の残り</span><span><strong style={{ fontSize: 26, color: enough ? 'var(--u-ink-dark)' : '#c0392b' }}>{(epBalance - race.feeEP).toLocaleString('ja-JP')}</strong> EP</span>
              </div>
              {/* §9.5 憲法の明示 — 登録前から常時表示し、登録後も残す */}
              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: '#eaf3fb', border: '2px solid #9fc0dc', fontSize: 13, lineHeight: 1.6 }}>{CLAIM_OWN_RACE_BET}</div>
              {/*
                🔴 ★**ここは `<span>` でした**（★2026-09-25 に発覚）。
                   ★`title="サーバー接続まで押せません"` と書かれたまま、★`onClick` が無く、
                   ★**押しても何も起きません**でした。★`supabaseEntryRepo.enter` は在るのに、
                   ★**誰も呼んでいません**でした（★本番の登録実績 0 件）。
                ⚠️ ★**押す前に「取り消せるか」を言います**（★D-123・簿 `ONE-WAY-DOORS`）。
                   ★出走の取消は ★**発売の準備に入る前まで**しかできません。
              */}
              <div style={{ display: 'flex', marginTop: 12 }}>
                <BigButton
                  tone={enough && !entering ? 'gold' : 'disabled'}
                  label={entering ? '登録しています…' : `登録する（${race.feeEP} EP）`}
                  sub={enough ? CLAIM_ENTRY_NO_CANCEL : '参加ポイントが足りません'}
                  {...(enough && !entering ? { onClick: () => { void submitEntry(); } } : {})}
                />
              </div>
              {!enough && (
                <a href="/earn" style={{ marginTop: 8, minHeight: 44, display: 'flex', alignItems: 'center', fontSize: 13, color: '#1a4f8a', textDecoration: 'underline' }}>
                  参加ポイントが足りません — 毎日のポイントを受け取る
                </a>
              )}
              {entryMessage !== null && (
                <div role={entryMessage.ok ? 'status' : 'alert'} style={{
                  marginTop: 8, padding: '10px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.7,
                  background: entryMessage.ok ? '#e8f6ec' : '#ffeceb',
                  border: `2px solid ${entryMessage.ok ? '#3f8f57' : '#c0392b'}`,
                  color: entryMessage.ok ? '#1d5c31' : '#8e2a1f',
                }}>{entryMessage.text}</div>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  </div>;
}
