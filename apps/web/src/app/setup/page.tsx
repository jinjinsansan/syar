'use client';

/**
 * ★初回セットアップ（2 ステップ）— ★**馬物語 UI の部品で組み直しました**（★2026-09-21）
 *
 * ============================================================================
 * 【★なぜ書き直したか — ★オーナーの判断「B」】
 *   ✔ ★**実測**（★本番 `0dc003d` の配信 HTML・2026-09-21）:
 *   ```
 *   /home /mypage /vote /train /exchange … ★自前バーあり・帯 1 つ（★新しい世代）
 *   /login /signup                       … ★自前バーあり（★帯が二重だったので直した）
 *   /setup                               … 🔴 ★**自前バーが無い**（★ここだけ旧いまま）
 *   ```
 *   ★オーナーの選択: ★**B「既存の部品で組み直す（★新しい見た目は作らない）」**。
 *
 * 【🔴 ★私が作っていないもの】
 *   ★**新しい意匠を 1 つも作っていません。** ★`/login` `/signup` と ★**同じ部品・同じ寸法**です:
 *     ★`Backdrop` / `TopBar` / `NoticeBar` / `BigButton` / `useMotionPaused`
 *     ★入力欄の高さ 48・角 10・縁 2px・枠 `rgba(8,18,8,.55)` … ★**`/login` からの写し**。
 *   → ★意匠の判断が要るもの（★新しい配置・新しい色・新しい部品）は ★**作っていません**。
 *
 * 【✅ ★機能は 1 つも変えていません（★下の「保った物」）】
 *   ★① 2 ステップ（★1 牧場をつくる → ★2 最初の 1 頭）
 *   ★② 表示名・牧場名（★`NAME_MAX` で切る）・勝負服の色（★`SILK_COLORS`）・袖（★`SLEEVES`）
 *   ★③ ★**冪等キー**（★`clientToken` は 1 回だけ作って持ち続ける・V-19 ⑭）
 *   ★④ ★`supabaseSetupRepo.create(...)` に ★**同じ引数**を渡す
 *   ★⑤ 失敗の 4 種（★重複／NG 語／通信／その他）と ★**サーバーの文言をそのまま出す**（UI1-9）
 *   ★⑥ 受け取った EP の実数・馬の名前・格・性別、★`/mypage` `/train` への導線
 *   ⚠️ ★検査 `apps/cli/test/setup-page-wiring.test.ts` が ★**これを釘付け**します。
 *
 * 【⚠️ ★意匠として残っている判断】
 *   ★勝負服の見本（`SilkPreview`）は ★**選んだ色を確かめるための情報**なので残しました。
 *   ★寸法は縦持ちに収まるよう小さくしていますが、★**形（胴・袖・帽）は同じ**です。
 * ============================================================================
 */

import { useState } from 'react';

import {
  Backdrop, BigButton, NoticeBar, TopBar, useMotionPaused,
} from '../../components/uma/uma-parts';
import {
  NAME_MAX, SILK_COLORS, SLEEVES, sleeveHex, supabaseSetupRepo,
  type InitialHorse, type SetupError, type Sleeve,
} from '../../lib/setup';

/** ★枠（★`/login` の入力枠と同じ指定） */
const CARD: React.CSSProperties = {
  flex: '0 0 auto', borderRadius: 14, padding: '16px 18px',
  background: 'rgba(8,18,8,.55)', border: '2px solid var(--u-edge)',
  display: 'flex', flexDirection: 'column', gap: 12,
};
/** ★入力欄（★`/login` からの写し） */
const INPUT: React.CSSProperties = {
  height: 48, borderRadius: 10, border: '2px solid var(--u-edge)',
  background: 'rgba(255,255,255,.95)', padding: '0 14px',
  fontSize: 16, fontWeight: 800, color: '#1a2410', width: '100%',
};
const LABEL: React.CSSProperties = { fontSize: 14, fontWeight: 900, color: 'var(--u-ink)' };

/** ★名前の入力（★`NAME_MAX` で切るのは ★**旧と同じ**） */
function NameField({ label, value, onChange, placeholder }: {
  readonly label: string; readonly value: string;
  readonly onChange: (v: string) => void; readonly placeholder: string;
}): React.ReactElement {
  const len = [...value].length;
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ ...LABEL, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        {label}
        <span style={{ fontSize: 12, fontWeight: 800, opacity: .75 }}>{len} / {NAME_MAX}</span>
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange([...e.target.value].slice(0, NAME_MAX).join('')); }}
        style={INPUT}
      />
    </label>
  );
}

/**
 * ★失敗の行。★**サーバーの文言をそのまま出します**（★UI1-9）。
 * ⚠️ ★当てはまらないものを言い換えると、★**直すべき所が画面から見えなくなります**（R-16）。
 */
/**
 * ★失敗の種類ごとの文言。
 *
 * ⚠️ ★**`Record<SetupError, string>` にしてあります**（★2026-09-24）。
 *    ★ここは `error === 'other' ? … : error === 'network' ? … : …` と書いた ★**最後が既定**でした。
 *    ★その形だと、★`SetupError` に 5 つ目を足した日、★**型は通り、画面は「使えない語が含まれています」と嘘を言い**ます。
 *    ★実際に `'duplicate'` → `'already'` の入れ替えで ★**嘘の理由**を出していた画面です（★上の ⚠️）。
 *    ★`Record` にすると ★**種類を足した時点で型検査が落ちます**。
 */
const ERROR_TEXT: Record<SetupError, string> = {
  other: '登録できませんでした（理由が返っていません）',
  network: '通信に失敗しました',
  already: 'すでに登録が済んでいます。ホームからお進みください',
  ngword: '使えない語が含まれています',
};

function ErrorRow({ error, message, onRetry }: {
  readonly error: SetupError; readonly message: string | null; readonly onRetry: () => void;
}): React.ReactElement {
  // ★`other` のときだけ、★サーバーの原文を優先します（★推測で言い換えない・UI1-9）
  const text = error === 'other' ? (message ?? ERROR_TEXT.other) : ERROR_TEXT[error];
  const retryable = error === 'other' || error === 'network';
  return (
    <div style={{
      borderRadius: 10, padding: '10px 12px', background: 'rgba(214,47,38,.18)',
      border: '2px solid #d62f26', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--u-ink)', lineHeight: 1.7 }}>{text}</span>
      {retryable && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginLeft: 'auto', height: 34, padding: '0 14px', borderRadius: 8,
            border: '2px solid var(--u-edge)', background: 'rgba(255,255,255,.9)',
            fontSize: 13, fontWeight: 900, color: '#1a2410', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >もう一度</button>
      )}
    </div>
  );
}

/** ★勝負服の見本（★形は旧と同じ。★縦持ちに収まる寸法にしています） */
function SilkPreview({ bodyHex, sleeve }: {
  readonly bodyHex: string; readonly sleeve: Sleeve;
}): React.ReactElement {
  const sl = sleeveHex(sleeve, bodyHex);
  const border = '3px solid var(--u-edge)';
  return (
    <div style={{ position: 'relative', width: 120, height: 128, flex: '0 0 auto' }}>
      <div style={{ position: 'absolute', left: 25, top: 12, width: 70, height: 90, borderRadius: '10px 10px 8px 8px', background: bodyHex, border }} />
      <div style={{ position: 'absolute', left: 1, top: 24, width: 27, height: 60, borderRadius: 8, background: sl, border }} />
      <div style={{ position: 'absolute', right: 1, top: 24, width: 27, height: 60, borderRadius: 8, background: sl, border }} />
      <div style={{ position: 'absolute', left: 40, top: 0, width: 41, height: 24, borderRadius: '6px 6px 14px 14px', background: bodyHex, border }} />
    </div>
  );
}

export default function SetupPage(): React.ReactElement {
  const [paused, toggle] = useMotionPaused();
  const [step, setStep] = useState<1 | 2>(1);
  const [displayName, setDisplayName] = useState('');
  const [stableName, setStableName] = useState('');
  const [colorKey, setColorKey] = useState('blue');
  const [sleeve, setSleeve] = useState<Sleeve>('white');
  const [error, setError] = useState<SetupError | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  /**
   * ★**冪等キー**（V-19 ⑭）。⚠️ ★**送るたびに作り直さないこと** —
   *   ★作り直すと ★**2 回目も通ってしまいます**。★1 回だけ作って持ち続けます。
   */
  const [clientToken] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [granted, setGranted] = useState<
    { horse: InitialHorse; grantedEP: number; dailyEP: number } | null
  >(null);

  const color = SILK_COLORS.find((c) => c.key === colorKey) ?? SILK_COLORS[7]!;
  const sleeveLabel = SLEEVES.find((s) => s.key === sleeve)?.label ?? '';
  const canSubmit = [...displayName].length > 0 && [...stableName].length > 0 && !busy;

  const submit = async (): Promise<void> => {
    if (!canSubmit) return;
    /**
     * 🔴 ★**押す前に言う**（★D-123 ③・裁定 `REVIEW_IDLE_WORK_20260925.md` (a)・2026-09-25）
     *
     * 【★なぜ要るか】
     *   ★牧場をつくるのは ★**1 回きり**で、★あとから戻せません（★`create_account` は冪等で、
     *   ★同じ `client_token` なら同じ口座を返すだけ ＝ ★**作り直せません**）。
     *   ★決まるのは ★表示名・牧場名・勝負服（★色と袖）で、★**画面から変える口は在りません**。
     *   → ★D-123 の作法（★`/vote` と同じ）: ★**取り消せないものは、押す前にそう言う**。
     * ⚠️ ★文面は ★`/vote` の形を写しました（★何が決まるか → ★空行 → ★戻せないこと → ★問い）。
     * ⚠️ ★`window.confirm` は ★**既存の部品だけ**で済ませる形です（★新しい意匠を作らない）。
     *    ★デザイナー便で ★画面の中の確認に差し替える前提です（★そのとき ★**この文面を持っていく**）。
     */
    if (!window.confirm(
      `牧場をつくります\n表示名: ${displayName}\n牧場名: ${stableName}\n\n`
      + 'あとから変えられません。この内容でよろしいですか？',
    )) return;
    setBusy(true); setError(null); setErrorText(null);
    try {
      const r = await supabaseSetupRepo.create({ displayName, stableName, colorKey, sleeve, clientToken });
      if (r.ok) { setGranted({ horse: r.horse, grantedEP: r.grantedEP, dailyEP: r.dailyEP }); setStep(2); }
      else { setError(r.error); setErrorText(r.message ?? null); }
    } catch (e) { setError('network'); setErrorText(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div
      data-theme="uma"
      className={paused ? 'u-paused' : undefined}
      style={{
        position: 'relative', width: '100%', minHeight: '100dvh', overflow: 'hidden',
        containerType: 'inline-size', background: 'var(--u-navy)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <Backdrop />
      <TopBar
        title={step === 1 ? 'はじめの設定（1／2）' : 'はじめの設定（2／2）'}
        backHref="/"
        paused={paused}
        onToggle={toggle}
      />
      {/*
        ⚠️ ★`actionLabel` / `actionHref` は ★**必須**です（★型が要求します）。
          ★`/login` と ★**同じ組み合わせ**（★中継を観る → `/watch-race`）を渡します。
          ★★ここで新しい導線を発明しません。
      */}
      <NoticeBar
        kind="soon"
        text={step === 1 ? '最初の 1 回だけ。あとから変えられます。' : 'あなたの牧場に迎えました。'}
        actionLabel="中継を観る"
        actionHref="/watch-race"
      />

      <div style={{
        position: 'relative', flex: '1 1 auto', minHeight: 0, overflow: 'auto',
        padding: '12px 14px 18px', width: '100%', maxWidth: 1220, margin: '0 auto',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {step === 1 && (
          <>
            <div style={CARD}>
              <NameField label="表示名" value={displayName} onChange={setDisplayName} placeholder="たかせ みのる" />
              <NameField label="牧場名" value={stableName} onChange={setStableName} placeholder="サクラ牧場" />
              {error !== null && <ErrorRow error={error} message={errorText} onRetry={() => { void submit(); }} />}
            </div>

            <div style={CARD}>
              <span style={LABEL}>勝負服の配色</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--u-ink)', opacity: .8, lineHeight: 1.7 }}>
                16 色から選びます（芝や土と同化しないよう、色は用意したものから選ぶ形です）
              </span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <SilkPreview bodyHex={color.hex} sleeve={sleeve} />
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(46px, 1fr))', gap: 8,
                  }}>
                    {SILK_COLORS.map((c) => {
                      const on = c.key === colorKey;
                      return (
                        <button
                          key={c.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => { setColorKey(c.key); }}
                          title={c.label}
                          style={{
                            display: 'block', width: '100%', aspectRatio: '1 / 1', borderRadius: 10,
                            background: c.hex, cursor: 'pointer', padding: 0, fontFamily: 'inherit',
                            border: on ? '4px solid #ffe37a' : '2px solid var(--u-edge)',
                          }}
                        />
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                    <span style={LABEL}>袖</span>
                    {SLEEVES.map((s) => {
                      const on = s.key === sleeve;
                      return (
                        <button
                          key={s.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => { setSleeve(s.key); }}
                          style={{
                            height: 36, padding: '0 14px', borderRadius: 8, cursor: 'pointer',
                            fontFamily: 'inherit', fontSize: 14, fontWeight: 900,
                            border: `2px solid ${on ? '#ffe37a' : 'var(--u-edge)'}`,
                            background: on ? 'rgba(255,227,122,.22)' : 'rgba(255,255,255,.9)',
                            color: on ? 'var(--u-ink)' : '#1a2410',
                          }}
                        >{s.label}</button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--u-ink)' }}>
                {stableName === '' ? '（牧場名）' : stableName} ／ {color.label} ／ 袖 {sleeveLabel}
              </span>
            </div>

            <div style={{ ...CARD, gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--u-ink)', lineHeight: 1.7 }}>
                登録で 2,000 EP、毎日のログインで 200 EP が入ります
              </span>
              <BigButton
                tone={canSubmit ? 'gold' : 'disabled'}
                label={busy ? '登録しています…' : 'この牧場ではじめる'}
                grow="1.2"
                {...(canSubmit ? { onClick: () => { void submit(); } } : {})}
              />
            </div>
          </>
        )}

        {step === 2 && granted !== null && (
          <>
            <div style={CARD}>
              <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--u-ink)', opacity: .85 }}>
                わたしの 1 頭目
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{
                  height: 30, padding: '0 12px', borderRadius: 8, display: 'inline-flex',
                  alignItems: 'center', fontSize: 14, fontWeight: 900,
                  border: '2px solid var(--u-edge)', background: 'rgba(255,255,255,.9)', color: '#1a2410',
                }}>{granted.horse.classLabel}</span>
                <span style={{ fontSize: 28, fontWeight: 900, color: 'var(--u-ink)' }}>{granted.horse.name}</span>
                <span style={{
                  height: 28, padding: '0 12px', borderRadius: 8, display: 'inline-flex',
                  alignItems: 'center', fontSize: 13, fontWeight: 900,
                  border: '2px solid var(--u-edge)', background: 'rgba(255,255,255,.9)', color: '#1a2410',
                }}>{granted.horse.sex}</span>
              </div>
              {/*
                🔴 ★**毛色・年齢・脚質・素質は出しません**（★旧の版で取ったものを、そのまま取ってあります）。
                  ★毛色 … ★`horses` に列がありません（★「栗毛」は画面の作り物でした・UI1-8）
                  ★年齢 … ★今が何週かを画面が知らないと出せません
                  ★脚質 … ★`horses` に無く、★**出走登録のたびに選ぶもの**（`race_entries.strategy`）
                  ★素質 … ★D-114 ②・T-10・AL-2 で取りました
                ⚠️ ★**無い列を作って埋めません。**
              */}
              <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--u-ink)', lineHeight: 1.7 }}>
                最初の 1 頭は無償です。どの 1 頭が来ても、できることは変わりません
              </span>
              <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--u-ink)' }}>
                参加ポイント {granted.grantedEP.toLocaleString('ja-JP')} EP を受け取りました
              </span>
            </div>

            {/*
              🔴 ★**もう 1 頭 受け取れることを、ここで伝えます**（★2026-09-24・案 A・D-120）。
                 ★案 A は「★付与 1 頭 ＋ ★**無償の生産 1 頭**」です。
                 ★生産の画面（`/stable/foal`）は在るのに、★**リンクが 1 本もありませんでした**。
                 ★登録した人は ★**受け取れるはずの馬に辿り着けません**でした。
              ⚠️ ★ここは ★**新しい口座を作り終えた直後**なので、★必ず新しい流れです
                 （★`create_account` が `first_horse_v1` を書く）。★段階を読み直しません。
                 ★古い口座（`legacy`）はこの画面を通らないので、★ここに出しても混ざりません。
            */}
            <div style={CARD}>
              <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--u-ink)', lineHeight: 1.7 }}>
                もう 1 頭、父と母を選んで生産できます。参加ポイントはかかりません
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <BigButton tone="gold" label="もう 1 頭 生産する" href="/stable/foal" grow="1.4" />
              <BigButton tone="ivory" label="調教へ" href="/train" />
              <BigButton tone="ivory" label="牧場を見る" href="/mypage" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
