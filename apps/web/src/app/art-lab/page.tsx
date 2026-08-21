/**
 * ★馬・騎手の絵柄の候補を並べて見るためのページ（P4・案 B の比較用）
 *
 * 【なぜ要るか】
 *   背景・観客席・芝は水準に達したが、**馬と騎手だけが追いついていない**（オーナー・2026-08-20）。
 *   絵柄を作り直すにあたり、**方向を1つに決め打たず、複数の候補を並べて選ぶ**ための場所。
 *
 * 【★小さいときに読めるかが本番の条件】
 *   レース中、馬は画面上で **150〜250px 幅**でしか描かれないことが多い。
 *   **大きく見て良い絵が、小さくすると潰れる**ことがあるので、
 *   ここでは**実寸（レース中の大きさ）と拡大を並べて**出す。
 *
 * ⚠️ 比較用の実験ページ。製品の画面ではない（正典 §12.2 の画面一覧に入れない）。
 */

const CANDIDATES = [
  {
    id: 'v7-current',
    name: '現行 v7',
    note: 'いま使っているもの。比較の基準（絵画寄りの写実）',
  },
  {
    id: 'c1-cg',
    name: '候補 1 — 3DCG ゲーム調',
    note: '現代の 3D ゲームの描画。輪郭が締まり、背に沿ってリムライト。筆致を出さない',
  },
  {
    id: 'c2-photo',
    name: '候補 2 — 写真 / TV 中継',
    note: '生中継を望遠で切り取った1コマ。毛艶・汗・血管、脚先だけ微ブレ',
  },
  {
    id: 'c3-keyart',
    name: '候補 3 — ゲームのキーアート',
    note: '高コントラストで筋肉を強調。★小さくても形が読めることを最優先',
  },
  {
    id: 'v8-tv',
    name: '（参考）v8 試作',
    note: '参考映像を見ずに作ったもの。v7 とほぼ同じになった失敗例',
  },
] as const;

/** レース中に実際に描かれる幅（`page.tsx` のスプライト寸法帯） */
const RACE_WIDTHS = [150, 220, 320] as const;

export default function ArtLabPage(): React.ReactElement {
  return (
    <div style={{ padding: '22px 0 60px' }}>
      <h1 className="a-band" style={{ height: 46, padding: '0 22px', borderRadius: 10, border: '2px solid var(--a-edge)', fontSize: 26, fontWeight: 900, letterSpacing: '.06em', margin: 0, display: 'inline-flex', alignItems: 'center' }}>
        馬・騎手の絵柄 — 候補の比較
      </h1>
      <p style={{ fontSize: 13, fontWeight: 900, color: 'var(--a-ink-2)', lineHeight: 1.9, marginTop: 12 }}>
        いずれも <b>8 コマのうち 1 コマ目だけ</b>を作ったものです。方向が決まってから 8 コマに広げます。<br />
        ★<b>レース中、馬は 150〜250px 幅でしか描かれません。</b>下段の「実寸」で、
        <b>小さくしても走っている馬に見えるか</b>を見てください — ここで潰れる絵は、大きく見て良くても使えません。
      </p>

      {/* 実寸の比較（★これが本番の条件） */}
      <div className="a-panel strong" style={{ marginTop: 18 }}>
        <div className="a-band" style={{ height: 40, padding: '0 18px' }}>
          <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '.14em' }}>実寸（レース中の大きさ）</span>
        </div>
        <div style={{ padding: '18px 22px', backgroundImage: 'linear-gradient(#6f9b52,#5f8f45)' }}>
          {/* 芝の上に置いて見る。白地だと輪郭が実際より締まって見える */}
          {RACE_WIDTHS.map((w) => (
            <div key={w} style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#fff', marginBottom: 6, textShadow: '0 1px 2px rgba(0,0,0,.5)' }}>幅 {w}px</div>
              <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                {CANDIDATES.map((c) => (
                  <div key={c.id} style={{ textAlign: 'center' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/art/lab/${c.id}.png`} alt={c.name} width={w} style={{ display: 'block', imageRendering: 'auto' }} />
                    <div style={{ fontSize: 11, fontWeight: 900, color: '#fff', marginTop: 4, textShadow: '0 1px 2px rgba(0,0,0,.5)' }}>{c.name}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 拡大 */}
      {CANDIDATES.map((c) => (
        <div key={c.id} className="a-panel strong" style={{ marginTop: 18 }}>
          <div className="a-band" style={{ height: 40, padding: '0 18px', gap: 14 }}>
            <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '.1em' }}>{c.name}</span>
            <span style={{ fontSize: 13, fontWeight: 900 }}>{c.note}</span>
          </div>
          <div style={{ padding: 16, backgroundImage: 'linear-gradient(#6f9b52,#5f8f45)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/art/lab/${c.id}.png`} alt={c.name} style={{ display: 'block', width: '100%', maxWidth: 1140 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
