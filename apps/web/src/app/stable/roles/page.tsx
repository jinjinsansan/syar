'use client';

/**
 * ★**引退後の役割**（★デザイナー第 2 便 §5 **A-1〜A-7**・2026-09-23・移行 `0074`）
 *
 * 【★この画面が守る約束】
 *   ★**押せるかどうかを画面が決めません。** ★サーバー（`my_retired_horses` → `breeding_role_block`）が
 *   ★返した理由を、★`roleVariantOf` が見せ方に写すだけです（★`request_breeding_role` と判定が割れない）。
 *   ★上限の数（10 / 5 / 8）も ★**サーバーが返した値**を出します（★画面で数を持たない）。
 *   ★素質・能力・遺伝子は出しません（D-114・D-116）。★他人の馬は出しません（★本人の引退馬だけ）。
 *
 * 【★意匠の出どころ】
 *   ★色・寸法・文言は ★**デザイナーの第 2 便**（`design_handoff_breed_v2/README.md` §5・`BreedScreen.dc.html`）。
 *   ⚠️ ★開発側で意匠を足していません。★**足りないところは「出さない」ことで埋めています**（下記）。
 *
 * 【⚠️ ★まだ無いので出していないもの】（★報告済み・デザイナー／オーナー待ち）
 *   ★A-2 の主ボタン「配合する」… ★配合の画面（B-1〜B-5）がまだありません。★行き先の無いボタンを出しません。
 *   ★A-3 `cap` の副ボタン「繁殖牝馬の一覧へ」… ★同じ理由。
 *   ★馬を選ぶ並び … ★A-1 は 1 頭を映す画面で、★選ぶところの意匠は第 2 便にありません。
 *      ★いまは既存の引退馬の一覧と同じ見せ方を借りています（★デザイナーの指示で差し替えます）。
 */

import { useCallback, useEffect, useState } from 'react';
import { storyLinesOf, STORY_EVENT_LABEL, type StoryEvent } from '@star/training';
import {
  loadRetiredScreen, loadHorseStory, requestBreedingRole, autoDemotedThisYear,
  type RetiredScreenData, type RetiredHorseView, type RoleVariant,
} from '../../../lib/retired-screen';
import { SignInRequiredError } from '../../../lib/stable-repo';
import { TYPE_TONE } from '../../../lib/story-tone';

/** ★変えられない 4 通り（★A-3〜A-6・★文言と色はデザイナーの表のまま） */
const BLOCK_VIEW: Readonly<Record<RoleVariant, {
  readonly icon: string; readonly border: string; readonly bg: string;
  readonly title: string; readonly text: (limits: { readonly broodmare: number; readonly foals: number }) => string;
  readonly primarySub: string;
  /** ★行き先のある副ボタンだけ（★無いものは出さない） */
  readonly secondary: { readonly label: string; readonly href: string } | null;
}>> = {
  cap: {
    icon: '!', border: '#a9741a', bg: '#fff6d6',
    title: '繁殖牝馬の枠がいっぱいです',
    text: (l) => `繁殖牝馬は ${l.broodmare} 頭までです。ほかの繁殖牝馬を功労馬に戻すと、繁殖入りできます。`,
    primarySub: '枠がいっぱいです',
    secondary: null,
  },
  sex: {
    icon: '牡', border: '#1a6fd4', bg: '#e0eefa',
    title: 'この馬は繁殖入りできません',
    text: () => '繁殖入りは牝馬だけです。牡馬は「種牡馬入り」を選べます。',
    primarySub: '',
    secondary: null,
  },
  active: {
    icon: '現', border: '#4a5a66', bg: '#e3e8ec',
    title: 'まだ引退していません',
    text: () => '役割を選べるのは、引退して功労馬になってからです。',
    primarySub: '引退してから選べます',
    secondary: { label: '厩舎へ戻る', href: '/stable' },
  },
  done8: {
    icon: '8', border: '#0e7a73', bg: '#dcf1ef',
    title: 'もう産めません',
    text: (l) => `生涯 ${l.foals} 頭を産み終えています。功労馬のまま、記録は残ります。`,
    primarySub: 'もう産めません',
    secondary: { label: '生涯の記録を見る', href: '/stable/retired' },
  },
};

const ROLE_LABEL: Readonly<Record<string, string>> = {
  honored: '功労馬', broodmare: '繁殖牝馬', stallion: '種牡馬',
};
const ROLE_CHIP: Readonly<Record<string, { readonly bg: string; readonly border: string; readonly ink: string }>> = {
  honored: { bg: '#e3e8ec', border: '#4a5a66', ink: '#4a5a66' },
  broodmare: { bg: '#dcf1ef', border: '#0e7a73', ink: '#0e7a73' },
  stallion: { bg: '#dcf1ef', border: '#0e7a73', ink: '#0e7a73' },
};

/** ★A-7 の告知を閉じた印（★端末の中だけ・★その訪問のあいだ。★デザイナー決定 §8-5） */
const DISMISS_KEY = 'star.roles.autoNoticeDismissed';
function dismissedIds(): readonly string[] {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    return raw === null ? [] : (JSON.parse(raw) as string[]);
  } catch { return []; }
}
function dismiss(id: string): void {
  try { sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...dismissedIds(), id])); } catch { /* 使えなくても画面は出す */ }
}

export default function RolesPage(): React.ReactElement {
  const [data, setData] = useState<RetiredScreenData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<readonly StoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState<string>(() => crypto.randomUUID());
  const [hidden, setHidden] = useState<readonly string[]>([]);

  useEffect(() => { setHidden(dismissedIds()); }, []);

  const reload = useCallback(() => {
    setLoading(true);
    loadRetiredScreen().then((fresh) => {
      setData(fresh);
      setError(null);
      setNeedsLogin(false);
      setSelected((current) => current ?? fresh.horses[0]?.id ?? null);
    }).catch((cause: unknown) => {
      setData(null);
      setNeedsLogin(cause instanceof SignInRequiredError);
      setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { setLoading(false); });
  }, []);
  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (selected === null) { setEvents([]); return; }
    let active = true;
    loadHorseStory(selected)
      .then((rows) => { if (active) setEvents(rows); })
      .catch(() => { if (active) setEvents([]); });
    return () => { active = false; };
  }, [selected]);

  const horse: RetiredHorseView | null = data?.horses.find((h) => h.id === selected) ?? null;

  const change = async (toRole: 'broodmare' | 'stallion' | 'honored'): Promise<void> => {
    if (horse === null || busy) return;
    setBusy(true);
    try {
      const result = await requestBreedingRole({ requestId, horseId: horse.id, toRole });
      setRequestId(crypto.randomUUID());
      if (result.ok) {
        setToast(toRole === 'honored' ? '功労馬に戻りました。生涯の記録に残しました。'
          : toRole === 'broodmare' ? '繁殖入りしました。生涯の記録に残しました。'
            : '種牡馬入りしました。生涯の記録に残しました。');
      } else {
        // ★理由の語は出さない（★第 2 便 §4）。★読み直せば、その理由の枠が出る
        setToast(null);
      }
      reload();
      if (selected !== null) void loadHorseStory(selected).then(setEvents).catch(() => { /* 記録は後で */ });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (loading && data === null) return <Shell><Note>読み込んでいます…</Note></Shell>;
  if (needsLogin) return <Shell><Note>引退した馬の役割を選ぶには、ログインしてください。</Note></Shell>;
  if (error !== null && data === null) return <Shell><Note>読み込めませんでした: {error}</Note></Shell>;
  if (data === null || horse === null) {
    return <Shell><Note>引退した馬はまだいません。現役の馬が引退すると、ここで役割を選べます。</Note></Shell>;
  }

  const limits = { broodmare: data.broodmareLimit, foals: data.lifetimeFoals };
  const action = horse.sex === 'female' ? horse.broodmare : horse.stallion;
  const variant = action.variant;
  const block = variant === null ? null : BLOCK_VIEW[variant];
  const chip = ROLE_CHIP[horse.role] ?? ROLE_CHIP['honored']!;
  const autoNotice = horse.role === 'honored'
    && autoDemotedThisYear(events, data.gameWeek)
    && !hidden.includes(horse.id);
  const lines = storyLinesOf(events);

  return (
    <Shell>
      {/* ★馬を選ぶ（★意匠は既存の引退馬の一覧を借りています・デザイナー待ち） */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {data.horses.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => { setSelected(h.id); setToast(null); }}
            style={{
              minHeight: 44, padding: '6px 12px', borderRadius: 10, cursor: 'pointer',
              background: h.id === horse.id ? '#fff4cf' : '#fbf7ec', color: '#10243a',
              border: `${h.id === horse.id ? 2.5 : 1.5}px solid ${h.id === horse.id ? '#8a5a06' : '#cfc7b2'}`,
              fontSize: 13, fontWeight: 900,
            }}
          >
            {h.name}
            <span style={{ fontSize: 11, color: '#4a6178', marginLeft: 6 }}>{ROLE_LABEL[h.role] ?? h.role}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ padding: '3px 10px', borderRadius: 6, border: `2px solid ${chip.border}`, background: chip.bg, color: chip.ink, fontSize: 12, fontWeight: 900 }}>
              {ROLE_LABEL[horse.role] ?? horse.role}
            </div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{horse.name}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#cfe0ee' }}>
              {horse.sex === 'female' ? '牝' : '牡'}{horse.ageYears === null ? '' : ` ${horse.ageYears} 歳`}
            </div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#cfe0ee' }}>
            {horse.starts} 戦 {horse.wins} 勝{horse.g1Wins > 0 ? ` ・ 最高格 ${horse.g1Wins} 勝` : ''}
            {horse.sireName === null && horse.damName === null ? '' : ` ・ 父 ${horse.sireName ?? '不明'} ／ 母 ${horse.damName ?? '不明'}`}
          </div>

          {toast !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '2px solid #0e7a73', borderRadius: 10, background: '#dcf1ef', color: '#0b4f4a' }}>
              <div style={{ flex: '0 0 auto', width: 26, height: 26, borderRadius: '50%', background: '#0e7a73', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✓</div>
              <div style={{ fontSize: 13, fontWeight: 900 }}>{toast}</div>
            </div>
          )}

          {autoNotice && (
            <div style={{ display: 'flex', gap: 10, padding: 12, border: '2px solid #0e7a73', borderRadius: 10, background: '#dcf1ef', color: '#0b4f4a' }}>
              <div style={{ flex: '0 0 auto', width: 26, height: 26, borderRadius: '50%', background: '#0e7a73', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{data.lifetimeFoals}</div>
              <div style={{ flex: '1 1 auto', fontSize: 12, fontWeight: 500, lineHeight: 1.7 }}>
                <b>生涯 {data.lifetimeFoals} 頭を産み終えたので、年の初めに功労馬に戻りました。</b>
                繁殖入りにはもう戻せません。戦績・血統・生涯の記録は残っています。
              </div>
              <button
                type="button"
                aria-label="この告知を閉じる"
                onClick={() => { dismiss(horse.id); setHidden(dismissedIds()); }}
                style={{ flex: '0 0 auto', width: 44, height: 44, margin: '-8px -6px -8px 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#0b4f4a' }}
              >×</button>
            </div>
          )}

          {/* ★役割の枠（★n / 上限 は サーバーが返した数） */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, border: '2px solid rgba(251,247,236,.28)', borderRadius: 12, background: 'rgba(10,35,64,.72)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 900 }}>引退後の役割</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#8fa6b8' }}>その場で変わります</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8 }}>
              <SlotCard label="繁殖牝馬" count={data.broodmareCount} limit={data.broodmareLimit} />
              <SlotCard label="種牡馬" count={data.stallionCount} limit={data.stallionLimit} />
            </div>
            {block !== null && (
              <div style={{ display: 'flex', gap: 10, padding: '10px 12px', border: `2px solid ${block.border}`, borderRadius: 10, background: block.bg, color: '#10243a' }}>
                <div style={{ flex: '0 0 auto', minWidth: 26, height: 26, padding: '0 5px', borderRadius: 13, background: block.border, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900 }}>{block.icon}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 13, fontWeight: 900 }}>{block.title}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.6, color: '#25384a' }}>{block.text(limits)}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ★生涯の記録（新しい順）。★文は storyLinesOf が組み立てたものをそのまま出す（LR-4） */}
        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 12, background: '#fbf7ec', color: '#10243a' }}>
          <div style={{ fontSize: 14, fontWeight: 900 }}>生涯の記録（新しい順）</div>
          {[...lines].reverse().map((l, i) => {
            const tone = TYPE_TONE[l.type];
            return (
              <div key={`${l.type}-${l.week}-${i}`} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid #dcd7c6' }}>
                <div style={{ flex: '0 0 44px', fontSize: 15, color: '#4a6178' }}>{l.week}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <div style={{ alignSelf: 'flex-start', padding: '1px 8px', borderRadius: 5, border: `1.5px solid ${tone.border}`, background: tone.bg, color: tone.color, fontSize: 11, fontWeight: 900 }}>
                    {STORY_EVENT_LABEL[l.type]}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.55 }}>{l.text}</div>
                </div>
              </div>
            );
          })}
          {lines.length === 0 && <div style={{ fontSize: 12, fontWeight: 500 }}>まだ記録がありません。</div>}
        </div>
      </div>

      {/* ★下段のボタン */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {action.alreadyThisRole ? (
          <button type="button" disabled={busy} onClick={() => { void change('honored'); }} style={SECONDARY}>功労馬に戻す</button>
        ) : (
          <>
            {block?.secondary != null && <a href={block.secondary.href} style={{ ...SECONDARY, textDecoration: 'none' }}>{block.secondary.label}</a>}
            {block === null && <button type="button" disabled={busy} onClick={() => { setToast(null); }} style={SECONDARY}>功労馬のまま</button>}
            <button
              type="button"
              disabled={!action.enabled || busy}
              onClick={() => { void change(action.toRole); }}
              style={action.enabled && !busy ? PRIMARY : PRIMARY_OFF}
            >
              <span>{horse.sex === 'female' ? '繁殖入りする' : '種牡馬入りする'}</span>
              <span style={{ fontSize: 11 }}>
                {block === null
                  ? (horse.sex === 'female' ? 'その場で変わります' : `種牡馬 ${data.stallionCount} / ${data.stallionLimit} 頭`)
                  : block.primarySub}
              </span>
            </button>
          </>
        )}
      </div>
    </Shell>
  );
}

const PRIMARY: React.CSSProperties = {
  flex: '1.6 1 220px', minHeight: 72, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  border: '5px solid #0a2340', borderRadius: 14, backgroundImage: 'linear-gradient(#ffe483 0%,#f6c21c 46%,#d98f0a 100%)',
  boxShadow: '0 7px 0 #0a2340, inset 0 3px 0 rgba(255,255,255,.65)', color: '#10243a', fontSize: 20, fontWeight: 900, cursor: 'pointer',
};
const PRIMARY_OFF: React.CSSProperties = {
  flex: '1.6 1 220px', minHeight: 72, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  border: '4px solid #4a6178', borderRadius: 14, backgroundImage: 'linear-gradient(#9fb0bd,#7d8f9c)',
  color: '#e8edf1', fontSize: 18, fontWeight: 900, cursor: 'not-allowed',
};
const SECONDARY: React.CSSProperties = {
  flex: '1 1 150px', minHeight: 72, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '4px solid #0a2340', borderRadius: 14, backgroundImage: 'linear-gradient(#ffffff,#e6eef6)',
  boxShadow: '0 6px 0 rgba(10,35,64,.85)', color: '#10243a', fontSize: 16, fontWeight: 900, cursor: 'pointer',
};

function SlotCard({ label, count, limit }: { readonly label: string; readonly count: number; readonly limit: number }): React.ReactElement {
  return (
    <div style={{ padding: 10, borderRadius: 10, background: '#fbf7ec', color: '#10243a' }}>
      <div style={{ fontSize: 10, color: '#4a6178', fontWeight: 900 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>{count}</div>
        <div style={{ fontSize: 11, color: '#4a6178', fontWeight: 900 }}>/ {limit} 頭</div>
      </div>
    </div>
  );
}

function Shell({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ minHeight: '100%', background: '#0a2340', color: '#fbf7ec' }}>
      <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '.06em' }}>引退後の役割</div>
        {children}
      </div>
    </div>
  );
}

function Note({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.8 }}>{children}</div>;
}
