'use client';
import { useState } from 'react';
import { PageTitle, Stars, StyleChip } from '../../components/ui';
import {
  NAME_MAX, SILK_COLORS, SLEEVES, sleeveHex, demoSetupRepo,
  type InitialHorse, type SetupError, type Sleeve,
} from '../../lib/setup';

/**
 * ★初回セットアップ（2 ステップ）— 正本 design/hud-ds/components/setup［アーケード］
 *   Step 1 牧場をつくる（表示名・牧場名・勝負服の配色）→ Step 2 最初の 1 頭（「迎える」演出・D-074）。
 *   カードは 2 ステップを縦に並べているが、実装ではステップ送りで 1 枚ずつ出す（カードの実装表）。
 *   ⚠️ 今はデモ（Auth＝マジックリンクとセットアップ RPC の導入まで）。画面は `SetupRepo` だけを見る。
 *   ⚠️ 付与はサーバー側で決定的に実行（user_id から導く・D-074）。画面で抽選しない。
 *   ⚠️ セットアップ済みなら /setup は /stable へリダイレクト（Auth 導入時に実装）。
 *   ⚠️ EP を買う・増やす導線を置かない（憲法 §0.2）。素質は ★ のみ（§12.4）。
 */

/** 入力欄（筐体の凹み: 縁 3px 濃紺＋inset・右端に「n / 12」） */
function NameField({ label, value, onChange, placeholder }: {
  readonly label: string; readonly value: string; readonly onChange: (v: string) => void; readonly placeholder: string;
}): React.ReactElement {
  const len = [...value].length;
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span className="a-lbl">{label}</span>
        <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--a-ink-3)' }}>{NAME_MAX} 文字まで</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', height: 52, marginTop: 6, padding: '0 14px', borderRadius: 10, background: '#fff', border: '3px solid var(--a-edge)', boxShadow: 'inset 0 2px 4px rgba(16,36,58,.1)' }}>
        <input
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange([...e.target.value].slice(0, NAME_MAX).join(''))}
          className="st-name-input"
          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', font: '900 22px var(--a-jp)', color: 'var(--a-ink)' }}
        />
        <span className="a-num" style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 700, color: 'var(--a-ink-3)', flex: '0 0 auto' }}>{len} / {NAME_MAX}</span>
      </div>
    </div>
  );
}

/** エラー行 — 入力欄の直下に該当する 1 件だけを出す（重複と NG ワードは同時に出ない） */
function ErrorRow({ error, onRetry }: { readonly error: SetupError; readonly onRetry: () => void }): React.ReactElement {
  if (error === 'network') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, padding: '9px 12px', borderRadius: 8, background: '#fff6d6', border: '2px solid #a9741a' }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: '#8a5a06' }}>通信に失敗しました</span>
        <button type="button" className="a-btn" onClick={onRetry} style={{ height: 30, padding: '0 14px', fontSize: 12, marginLeft: 'auto' }}>もう一度</button>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 10, padding: '9px 12px', borderRadius: 8, background: '#ffeceb', border: '2px solid var(--a-red-d)' }}>
      <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-red-d)' }}>
        {error === 'duplicate' ? 'この牧場名はすでに使われています' : '使えない語が含まれています'}
      </span>
    </div>
  );
}

/** ステップ表示のピル（右上・h38。現在は青グロス＋白、未到達は沈んだ白） */
function StepPill({ n, label, on }: { readonly n: number; readonly label: string; readonly on: boolean }): React.ReactElement {
  return (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 16px', borderRadius: 8,
      backgroundImage: on ? 'var(--a-gloss-blue)' : 'linear-gradient(#fff,#e9eff5)',
      border: `2px solid ${on ? 'var(--a-edge)' : 'var(--a-edge-soft)'}`,
    }}>
      <span className="a-num" style={{ fontSize: 20, color: on ? '#fff' : 'var(--a-ink-3)' }}>{n}</span>
      <span style={{ fontSize: 13, fontWeight: 900, color: on ? '#fff' : 'var(--a-ink-2)' }}>{label}</span>
    </span>
  );
}

/** 勝負服のプレビュー（170×180: 胴 100×126・袖 38×84・帽 58×34） */
function SilkPreview({ bodyHex, sleeve }: { readonly bodyHex: string; readonly sleeve: Sleeve }): React.ReactElement {
  const sl = sleeveHex(sleeve, bodyHex);
  const border = '3px solid var(--a-edge)';
  return (
    <div style={{ position: 'relative', width: 170, height: 180 }}>
      <div style={{ position: 'absolute', left: 35, top: 16, width: 100, height: 126, borderRadius: '14px 14px 10px 10px', background: bodyHex, border }} />
      <div style={{ position: 'absolute', left: 2, top: 34, width: 38, height: 84, borderRadius: 10, background: sl, border }} />
      <div style={{ position: 'absolute', right: 2, top: 34, width: 38, height: 84, borderRadius: 10, background: sl, border }} />
      <div style={{ position: 'absolute', left: 56, top: 0, width: 58, height: 34, borderRadius: '8px 8px 20px 20px', background: bodyHex, border }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, textAlign: 'center', fontSize: 11, fontWeight: 900, color: 'var(--a-ink-3)' }}>胴 ＋ 袖</div>
    </div>
  );
}

export default function SetupPage(): React.ReactElement {
  const [step, setStep] = useState<1 | 2>(1);
  const [displayName, setDisplayName] = useState('');
  const [stableName, setStableName] = useState('');
  const [colorKey, setColorKey] = useState('blue');
  const [sleeve, setSleeve] = useState<Sleeve>('white');
  const [error, setError] = useState<SetupError | null>(null);
  const [busy, setBusy] = useState(false);
  const [granted, setGranted] = useState<{ horse: InitialHorse; grantedEP: number; dailyEP: number } | null>(null);

  const color = SILK_COLORS.find((c) => c.key === colorKey) ?? SILK_COLORS[7]!;
  const sleeveLabel = SLEEVES.find((s) => s.key === sleeve)?.label ?? '';
  const canSubmit = [...displayName].length > 0 && [...stableName].length > 0 && !busy;

  const submit = async (): Promise<void> => {
    if (!canSubmit) return;
    setBusy(true); setError(null);
    try {
      const r = await demoSetupRepo.create({ displayName, stableName, colorKey, sleeve });
      if (r.ok) { setGranted({ horse: r.horse, grantedEP: r.grantedEP, dailyEP: r.dailyEP }); setStep(2); }
      else setError(r.error);
    } catch { setError('network'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ padding: '22px 0 40px' }}>
      <PageTitle
        title="はじめの設定"
        sub="最初の 1 回だけ。あとから変えられます"
        right={(
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StepPill n={1} label="牧場をつくる" on={step === 1} />
            <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink-3)' }}>→</span>
            <StepPill n={2} label="最初の 1 頭" on={step === 2} />
          </span>
        )}
      />
      <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>※ デモ（ログインとセットアップ RPC の導入まで、送信してもサーバーには保存されません）</p>

      {step === 1 && (
        <div className="a-panel strong rise" style={{ marginTop: 14 }}>
          <div className="a-band" style={{ height: 48, padding: '0 20px', gap: 14 }}>
            <span className="a-num" style={{ fontSize: 24 }}>1</span>
            <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: '.06em' }}>牧場をつくる</span>
            <span style={{ fontSize: 13, fontWeight: 900 }}>表示名・牧場名・勝負服の配色を決めます</span>
          </div>
          <div style={{ display: 'flex', gap: 24, padding: 20, backgroundImage: 'linear-gradient(#ffffff,#eef6fd)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <NameField label="表示名" value={displayName} onChange={setDisplayName} placeholder="たかせ みのる" />
                <NameField label="牧場名" value={stableName} onChange={setStableName} placeholder="サクラ牧場" />
              </div>
              {error !== null && <ErrorRow error={error} onRetry={submit} />}
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <span className="a-lbl">勝負服の配色</span>
                  <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-2)' }}>16 色から選びます（芝や土と同化しないよう、色は用意したものから選ぶ形です）</span>
                </div>
                <div className="a-cards c8" style={{ gap: 12, marginTop: 12 }}>
                  {SILK_COLORS.map((c) => {
                    const on = c.key === colorKey;
                    return (
                      <button key={c.key} type="button" onClick={() => setColorKey(c.key)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                        <span style={{
                          display: 'block', width: 56, height: 56, borderRadius: 10, background: c.hex,
                          border: on ? '4px solid #8a5a06' : '3px solid var(--a-edge)',
                          boxShadow: on ? '0 0 0 3px #ffe37a, var(--a-shadow-sm)' : 'var(--a-shadow-sm)',
                        }} />
                        <span style={{ fontSize: 11, fontWeight: 900, color: on ? '#8a5a06' : 'var(--a-ink-2)' }}>{c.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
                  <span className="a-lbl">袖</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {SLEEVES.map((s) => {
                      const on = s.key === sleeve;
                      return (
                        <button key={s.key} type="button" onClick={() => setSleeve(s.key)} style={{
                          display: 'flex', alignItems: 'center', height: 36, padding: '0 16px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                          border: `2px solid ${on ? 'var(--a-edge)' : 'var(--a-edge-soft)'}`,
                          backgroundImage: on ? 'var(--a-gloss-blue)' : 'linear-gradient(#fff,#e9eff5)',
                          color: on ? '#fff' : 'var(--a-ink-2)', fontSize: 14, fontWeight: 900,
                        }}>{s.label}</button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ width: 250, flex: '0 0 250px', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16, borderRadius: 10, background: '#fff', border: '3px solid var(--a-edge)', boxShadow: 'var(--a-shadow-sm)', alignSelf: 'flex-start' }}>
              <span className="a-lbl">プレビュー</span>
              <div style={{ marginTop: 10 }}><SilkPreview bodyHex={color.hex} sleeve={sleeve} /></div>
              <div style={{ fontSize: 15, fontWeight: 900, marginTop: 6, color: 'var(--a-ink)' }}>{stableName === '' ? '（牧場名）' : stableName}</div>
              <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)', marginTop: 3 }}>{color.label} ／ 袖 {sleeveLabel}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, height: 76, padding: '0 20px', borderTop: '2px solid var(--a-line)', background: 'var(--a-ivory)' }}>
            {/* ★脚注は 1 行固定（flex:0 0 auto＋nowrap）。auto マージンのボタンと並べると shrink して途中で折れる（カードの実装表） */}
            <span style={{ flex: '0 0 auto', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)' }}>
              登録で <span className="a-num" style={{ fontSize: 20, color: 'var(--a-blue-d)' }}>2,000</span> EP、毎日のログインで <span className="a-num" style={{ fontSize: 20, color: 'var(--a-blue-d)' }}>200</span> EP が入ります
            </span>
            <button type="button" className={`a-btn a-btn-gold${canSubmit ? '' : ' off'}`} onClick={submit} style={{ marginLeft: 'auto', height: 52, padding: '0 30px', fontSize: 18, whiteSpace: 'nowrap' }}>
              この牧場ではじめる
            </button>
          </div>
        </div>
      )}

      {step === 2 && granted !== null && (
        <div className="a-panel strong rise" style={{ marginTop: 14, borderColor: '#8a5a06' }}>
          <div className="a-band a-band-gold" style={{ height: 48, padding: '0 20px', gap: 14, borderBottom: '2px solid #8a5a06' }}>
            <span className="a-num" style={{ fontSize: 24 }}>2</span>
            <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: '.06em' }}>最初の 1 頭</span>
            <span style={{ fontSize: 13, fontWeight: 900 }}>あなたの牧場に迎えます</span>
          </div>
          <div style={{ display: 'flex', gap: 24, padding: 20, backgroundImage: 'linear-gradient(#fffdf2,#fff8e6)' }}>
            {/* 馬体カット（340×250）。「迎える」演出 = 0.6s フェードイン＋上へ 12px（.welcome）。派手な光は使わない */}
            <div className="welcome" style={{ position: 'relative', width: 340, flex: '0 0 340px', height: 250, borderRadius: 10, background: '#e6eef5', border: '3px solid var(--a-edge)', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(135deg,rgba(16,36,58,.05) 0 8px,rgba(16,36,58,0) 8px 16px)' }} />
              <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', fontSize: 11, letterSpacing: '.12em', color: 'var(--a-ink-3)', lineHeight: 1.9, fontFamily: 'ui-monospace,Menlo,monospace' }}>馬体カット（準備中）</div>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 34, backgroundImage: 'var(--a-gloss-gold)', borderTop: '2px solid #8a5a06' }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: '#4a3105', letterSpacing: '.14em' }}>わたしの 1 頭目</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span className="a-chip" style={{ height: 30, padding: '0 12px', fontSize: 14, color: 'var(--a-ink)' }}>{granted.horse.classLabel}</span>
                <span style={{ fontSize: 36, fontWeight: 900, color: 'var(--a-ink)' }}>{granted.horse.name}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <span className="a-chip" style={{ height: 28, padding: '0 12px', fontSize: 13, color: 'var(--a-ink)' }}>{granted.horse.sexAge}</span>
                <span className="a-chip" style={{ height: 28, padding: '0 12px', fontSize: 13, color: 'var(--a-ink)' }}>{granted.horse.coat}</span>
                <span className="a-chip" style={{ height: 28, padding: '0 12px', fontSize: 13, color: 'var(--a-ink)' }}>{granted.horse.stableName}</span>
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
                <div style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: '#fff', border: '2px solid var(--a-edge)' }}>
                  <span className="a-lbl">素質</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                    <Stars value={granted.horse.stars} size={26} />
                    <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--a-ink-3)' }}>生涯変わりません</span>
                  </div>
                </div>
                <div style={{ width: 190, flex: '0 0 190px', padding: '12px 16px', borderRadius: 10, background: '#fff', border: '2px solid var(--a-edge)' }}>
                  <span className="a-lbl">脚質</span>
                  <div style={{ marginTop: 8 }}><StyleChip strategy={granted.horse.strategy} h={30} font={14} /></div>
                </div>
              </div>
              <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 8, background: '#eaf3fb', border: '2px solid #9fc0dc' }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--a-ink)', lineHeight: 1.7 }}>最初の 1 頭は無償です。引退や引き直しをしても同じ馬が迎えられます</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 76, padding: '0 20px', borderTop: '2px solid #8a5a06', background: 'var(--a-ivory)' }}>
            {/* ★脚注は 1 行固定（nowrap） */}
            <span style={{ flex: '0 0 auto', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)' }}>
              参加ポイント <span className="a-num" style={{ fontSize: 20, color: 'var(--a-blue-d)' }}>{granted.grantedEP.toLocaleString('ja-JP')}</span> EP を受け取りました
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
              <a className="a-btn" href="/stable" style={{ height: 46, padding: '0 22px', fontSize: 15, whiteSpace: 'nowrap' }}>牧場を見る</a>
              <a className="a-btn a-btn-gold" href="/training" style={{ height: 52, padding: '0 30px', fontSize: 18, whiteSpace: 'nowrap' }}>調教へ</a>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
