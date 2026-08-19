import { readClient } from '../lib/supabase';

/** ★毎回サーバーで取り直す（ボタン先の「最新の確定レース」「次のレース」が変わるため） */
export const revalidate = 0;

/**
 * ★TOP（未ログインの LP）— 正本 design/hud-ds/components/landing［アーケード］
 *   初めて来た人が「何のゲームか」「何をすればいいか」を 1 枚で理解し、「無料ではじめる」を押す。
 *   ログイン後のハブ（番組表）は `/races`。Auth 導入後はログイン済みなら `/` から `/races` へ送る。
 *   ⚠️ 憲法: EP は「参加ポイント」・PP は「賞金ポイント」。購入・チャージ・換金・円・価値・相場 を書かない。
 *      EP を買う／増やす導線を置かない。PP→EP の変換を書かない。「無料」は「無料で遊べる」まで。
 *      実在の競馬場名・レース名・馬名・人物名・他社製品名を書かない。
 *   ⚠️ 表示だけ。レースの生成・確定・オッズはサーバー（正典 §14.3）。
 */

/** ヒーローの覆い（カードの値そのまま） */
const VEIL = 'linear-gradient(180deg, rgba(26,111,212,.55) 0%, rgba(15,86,171,.42) 46%, rgba(207,230,247,.86) 100%)';

const POINTS: ReadonlyArray<{ n: string; title: string; img: string; alt: string; body: string }> = [
  { n: '01', title: '育てる', img: '/lp/pt-training.jpg', alt: '調教の画面', body: '週に 1 回、8 つのメニューから指示します。素質★と 5 つの現在値が伸びていくのを見ながら、疲労と調子を管理します。' },
  { n: '02', title: '走らせる', img: '/lp/pt-race.jpg', alt: '中継 HUD', body: 'レースは 10 分ごとに発走。出走登録して、実況つきの中継を観ます。格が上がるほど賞金ポイントも大きくなります。' },
  { n: '03', title: '投票する', img: '/lp/pt-bet.jpg', alt: '投票の画面', body: '参加ポイントで投票して、的中すると賞金ポイントで払戻。自分の馬が出るレースには投票できません。' },
  { n: '04', title: 'つなぐ', img: '/lp/pt-pedigree.jpg', alt: '馬詳細の血統表', body: '引退した馬は配合して次の世代へ。5 代の血統表でクロスを確かめながら、自分の血統を作ります。' },
];

type Step = { readonly title: string; readonly desc: string; readonly button: string; readonly href: string; readonly event: string };
const STEPS: readonly Step[] = [
  { title: 'アカウントをつくる', desc: 'メールだけで登録できます', button: 'はじめる', href: '/signup', event: 'step1_signup' },
  { title: '最初の馬を迎える', desc: '迎え方は準備中です（正典の配合／入手規定に合わせます）', button: '牧場を見る', href: '/stable', event: 'step2_stable' },
  { title: '調教を指示する', desc: '8 つのメニューから 1 つ', button: '調教へ', href: '/training', event: 'step3_training' },
  { title: '出走登録する', desc: '格の合うレースを選ぶ', button: '番組表へ', href: '/races', event: 'step4_program' },
  { title: '中継を観る', desc: '実況つきの中継が始まります', button: '中継を観る', href: '/race', event: 'step5_watch' },
];

/** スクショ枠（h150/h140・角丸 8px・2px 罫）— 実画面のキャプチャを cover で入れる */
function Shot({ src, alt, h }: { readonly src: string; readonly alt: string; readonly h: number }): React.ReactElement {
  return (
    <div style={{ position: 'relative', height: h, borderRadius: 8, background: '#e6eef5', border: '2px solid var(--a-line)', overflow: 'hidden' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
    </div>
  );
}

/** 中継 HUD の 1 コマを背景に、青→水色の覆いを重ねるヒーロー地 */
function HeroBackdrop({ src }: { readonly src: string }): React.ReactElement {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
      <div style={{ position: 'absolute', inset: 0, background: VEIL }} />
    </>
  );
}

function Seal({ step, title, body }: { readonly step: number; readonly title: string; readonly body: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ flex: 1, borderRadius: 10, background: '#fff', border: '2px solid var(--a-edge)', boxShadow: 'var(--a-shadow-sm)', overflow: 'hidden' }}>
      <div className="a-band" style={{ height: 32, padding: '0 12px', gap: 9 }}><span className="a-num" style={{ fontSize: 18 }}>{step}</span><span style={{ fontSize: 13, fontWeight: 900 }}>{title}</span></div>
      <div style={{ padding: '11px 13px 13px', fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 400, fontSize: 12, color: 'var(--a-ink)', lineHeight: 1.7, wordBreak: 'break-all' }}>{body}</div>
    </div>
  );
}

export default async function LandingPage(): Promise<React.ReactElement> {
  // 「仕組みを見る」→ 最新の確定レース／「オッズ」→ 次の発売中レース（無ければ一覧へ）
  let fairnessHref = '/races';
  let oddsHref = '/races';
  try {
    const c = readClient();
    const [{ data: settled }, { data: open }] = await Promise.all([
      c.from('races_public').select('id').eq('status', 'settled').order('scheduled_at', { ascending: false }).limit(1),
      c.from('races_public').select('id').eq('status', 'scheduled').order('scheduled_at', { ascending: true }).limit(1),
    ]);
    const s = settled?.[0] as { id?: string } | undefined;
    const o = open?.[0] as { id?: string } | undefined;
    if (s?.id) fairnessHref = `/races/${s.id}`;
    if (o?.id) oddsHref = `/races/${o.id}/odds`;
  } catch {
    // 読めないときは一覧へ送る（LP 自体は出す）
  }

  return (
    <div style={{ padding: 0 }}>
      {/* 1. ヒーロー */}
      <section className="lp-bleed" style={{ position: 'relative', height: 560, overflow: 'hidden' }}>
        <HeroBackdrop src="/lp/hero.jpg" />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 56, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 96, fontWeight: 900, letterSpacing: '.14em', color: '#ffe37a', textShadow: '0 3px 0 #8a5a06, 0 6px 18px rgba(4,20,40,.5)', lineHeight: 1 }}>STAR</div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', height: 34, padding: '0 18px', borderRadius: 8, background: 'rgba(4,20,40,.42)', border: '2px solid rgba(255,255,255,.7)' }}>
            <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: '.14em', color: '#fff' }}>無料で遊べるオンライン競馬育成</span>
          </div>
          <h1 style={{ margin: '26px 0 0', textAlign: 'center', fontSize: 46, fontWeight: 900, color: '#fff', textShadow: '0 3px 0 rgba(4,20,40,.45)', lineHeight: 1.35 }}>
            配合して、育てて、走らせる。<br />10 分ごとに発走する、あなたの競馬場。
          </h1>
          <div style={{ marginTop: 30, display: 'flex', alignItems: 'center', gap: 14 }}>
            <a className="a-btn a-btn-gold" href="/signup" data-event="cta_hero_signup" style={{ height: 56, padding: '0 34px', fontSize: 20 }}>無料ではじめる</a>
            <a className="a-btn" href="/race" data-event="cta_hero_demo" style={{ height: 48, padding: '0 26px', fontSize: 16 }}>中継を観る（デモ）</a>
          </div>
          <div style={{ marginTop: 16, fontSize: 13, fontWeight: 900, color: 'var(--a-ink)', background: 'rgba(255,255,255,.82)', border: '2px solid var(--a-edge)', borderRadius: 8, padding: '6px 14px' }}>登録は 1 分。クレジットカードは要りません</div>
        </div>
      </section>
      <div className="lp-bleed" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 56, background: '#fff', borderTop: '3px solid var(--a-edge)', borderBottom: '3px solid var(--a-edge)' }}>
        <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--a-ink)' }}>
          育成もレースも投票も。<span style={{ color: 'var(--a-blue-d)' }}>参加ポイント</span>で遊んで、<span style={{ color: '#8a5a06' }}>賞金ポイント</span>で景品と交換
        </span>
      </div>

      {/* 2. 4 つのたのしみ */}
      <section id="points" style={{ paddingTop: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <h2 className="a-band" style={{ height: 46, padding: '0 22px', borderRadius: 10, border: '2px solid var(--a-edge)', fontSize: 26, fontWeight: 900, letterSpacing: '.06em', textShadow: '0 2px 0 rgba(0,0,0,.3)', margin: 0 }}>4 つのたのしみ</h2>
          <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>オーナー兼調教師として、牧場をひとつ預かります</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {POINTS.map((p) => (
            <div key={p.n} style={{ display: 'flex', flexDirection: 'column', borderRadius: 10, overflow: 'hidden', background: '#fff', border: '2px solid var(--a-edge)', boxShadow: 'var(--a-shadow-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 52, padding: '0 14px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)', borderBottom: '2px solid var(--a-line)' }}>
                <span className="a-num" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 34, borderRadius: 8, backgroundImage: 'var(--a-gloss-gold)', border: '2px solid #8a5a06', fontSize: 20, color: '#4a3105' }}>{p.n}</span>
                <span style={{ fontSize: 20, fontWeight: 900 }}>{p.title}</span>
              </div>
              <div style={{ padding: '12px 14px 14px' }}>
                <Shot src={p.img} alt={p.alt} h={150} />
                <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)', lineHeight: 1.75, marginTop: 12 }}>{p.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. はじめの 5 ステップ */}
      <section id="steps" style={{ marginTop: 36 }}>
        <div className="a-panel strong">
          <div className="a-band" style={{ height: 52, padding: '0 20px', gap: 18 }}>
            <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '.06em' }}>はじめの 5 ステップ</span>
            <span style={{ fontSize: 13, fontWeight: 900 }}>ここまで 5 分ほどです</span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ position: 'relative', width: 220, height: 14, borderRadius: 7, background: 'rgba(255,255,255,.35)', border: '2px solid #fff', overflow: 'hidden' }}>
                <span style={{ display: 'block', width: '0%', height: '100%', backgroundImage: 'var(--a-gloss-gold)' }} />
              </span>
              <span className="a-num" style={{ fontSize: 22, color: '#fff' }}>0 / 5</span>
            </span>
          </div>
          {STEPS.map((s, i) => (
            <div key={s.title} style={{ display: 'flex', alignItems: 'center', gap: 16, height: 96, padding: '0 20px', borderTop: '1px solid var(--a-line)', background: i % 2 === 1 ? 'var(--a-panel-2)' : '#fff' }}>
              <span className="a-num" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: '50%', backgroundImage: 'var(--a-gloss-red)', border: '3px solid var(--a-red-d)', boxShadow: 'var(--a-shadow-sm)', fontSize: 26, color: '#fff' }}>{i + 1}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: 20, fontWeight: 900 }}>{s.title}</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)' }}>{s.desc}</span>
              </span>
              <a className="a-btn a-btn-blue" href={s.href} data-event={s.event} style={{ marginLeft: 'auto', height: 42, padding: '0 22px', fontSize: 15, whiteSpace: 'nowrap' }}>{s.button}</a>
            </div>
          ))}
        </div>
      </section>

      {/* 4. 公正性 */}
      <section id="fairness" style={{ marginTop: 36 }}>
        <div className="a-panel strong">
          <div className="a-band" style={{ height: 52, padding: '0 20px', gap: 18 }}>
            <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '.06em' }}>結果はあとから変えられません</span>
            <span style={{ fontSize: 13, fontWeight: 900 }}>運営が結果を見てから乱数を選んでいないことを、誰でも確かめられます</span>
          </div>
          <div style={{ padding: '18px 20px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)' }}>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 14 }}>
              <Seal step={1} title="発走前に公開" body={<>seed_commit<br />9f2c4b7e1a83d605c47e9b2f1d80a6c3…</>} />
              <Seal step={2} title="確定後に公開" body={<>seed_reveal<br />star-2026-08-19-11r-8c41f0a9e5</>} />
              <Seal step={3} title="誰でも照合" body={<>SHA-256(seed_reveal) ＝ seed_commit</>} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 8, background: '#eefaf1', border: '2px solid var(--a-green-d)' }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, backgroundImage: 'var(--a-gloss-green)', border: '2px solid var(--a-green-d)', color: '#fff', fontSize: 14, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
                <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--a-green-d)' }}>一致しました</span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)' }}>各レースの詳細ページで、いつでも自分の手元で照合できます</span>
              <a className="a-btn a-btn-blue" href={fairnessHref} data-event="cta_fairness" style={{ marginLeft: 'auto', height: 44, padding: '0 24px', fontSize: 15, whiteSpace: 'nowrap' }}>仕組みを見る</a>
            </div>
          </div>
        </div>
      </section>

      {/* 5. 登録前に見られる画面 */}
      <section id="tools" style={{ marginTop: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <h2 className="a-band" style={{ height: 46, padding: '0 22px', borderRadius: 10, border: '2px solid var(--a-edge)', fontSize: 26, fontWeight: 900, letterSpacing: '.06em', textShadow: '0 2px 0 rgba(0,0,0,.3)', margin: 0 }}>登録前に見られる画面</h2>
          <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)' }}>中継と番組表は、登録しなくても観られます</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { title: '番組表', img: '/lp/tool-program.jpg', body: '10 分ごとの発走予定を一覧で。次のレースと締切がすぐ分かります', href: '/races', event: 'tool_program' },
            { title: 'オッズ', img: '/lp/tool-odds.jpg', body: '人気順に並んだ単勝・複勝・馬連。支持の集まり方も見えます', href: oddsHref, event: 'tool_odds' },
            { title: '記録', img: '/lp/tool-records.jpg', body: '戦績と、参加ポイント・賞金ポイントの動きをそれぞれ別に記録', href: '/records', event: 'tool_records' },
          ].map((t) => (
            <div key={t.title} style={{ display: 'flex', flexDirection: 'column', borderRadius: 10, overflow: 'hidden', background: '#fff', border: '2px solid var(--a-edge)', boxShadow: 'var(--a-shadow-sm)' }}>
              <div className="a-band" style={{ height: 40, padding: '0 14px' }}><span style={{ fontSize: 17, fontWeight: 900, letterSpacing: '.06em' }}>{t.title}</span></div>
              <div style={{ padding: '12px 14px 14px' }}>
                <Shot src={t.img} alt={`${t.title}の画面`} h={140} />
                <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)', lineHeight: 1.7, marginTop: 10, minHeight: 44 }}>{t.body}</div>
                <a className="a-btn" href={t.href} data-event={t.event} style={{ width: '100%', height: 42, marginTop: 4, fontSize: 14 }}>見てみる</a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. 締めヒーロー */}
      <section className="lp-bleed" style={{ position: 'relative', height: 300, marginTop: 40, overflow: 'hidden', borderTop: '3px solid var(--a-edge)' }}>
        <HeroBackdrop src="/lp/hero-bottom.jpg" />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 50, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: '.14em', color: '#ffe37a', textShadow: '0 3px 0 #8a5a06, 0 6px 16px rgba(4,20,40,.5)', lineHeight: 1 }}>STAR</div>
          <div style={{ marginTop: 14, fontSize: 26, fontWeight: 900, color: '#fff', textShadow: '0 2px 0 rgba(4,20,40,.45)' }}>次のレースは 10 分後に発走します</div>
          <a className="a-btn a-btn-gold" href="/signup" data-event="cta_footer_signup" style={{ height: 56, padding: '0 34px', fontSize: 20, marginTop: 22 }}>無料ではじめる</a>
        </div>
      </section>

      {/* 7. フッター */}
      <footer className="lp-bleed" style={{ height: 120, background: 'var(--a-edge)', display: 'flex', alignItems: 'center', padding: '0 40px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 22, fontSize: 12, fontWeight: 900, color: '#fff' }}>
            <span>運営</span><span>利用規約</span><span>プライバシー</span><span>お問い合わせ</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,.95)' }}>本サービスは参加ポイントを販売しません</div>
          <div style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,.95)' }}>© 2026 STAR</div>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 900, letterSpacing: '.22em', color: '#ffe37a' }}>STAR</span>
      </footer>
    </div>
  );
}
