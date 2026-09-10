import { notFound } from 'next/navigation';

/**
 * ★**走りの見比べ台**（★2026-09-10・★オーナー指示「開発サーバーで見せてほしい」）
 *
 * ★`out/` に書き出した比較映像・素材の連番を、★**探しに行かずに見られる**ようにするだけの頁です。
 *
 * ⚠️ ★**開発専用**（★本番では 404）。★`rig-lab` と同じ作法。
 * ⚠️ ★中身は `apps/web/public/gait-review/` に置いた書き出し済みの映像・画像です。
 *    ★**リポジトリにはコミットしません**（★45MB・★作り直せます）。
 *    ★作り直し方は `REPORT_P4_POSE_OBSERVE_20260910.md` と各報告書にあります。
 * ⚠️ ★**主観の評価は等速を先に**。★0.25 倍は姿勢と接地の確認に使います（★裁定 §4-4）。
 */
export default function GaitReviewPage(): React.ReactElement {
  if (process.env.NODE_ENV === 'production') notFound();

  const wrap: React.CSSProperties = {
    minHeight: '100vh', background: '#12161a', color: '#eef2f6',
    padding: 16, fontFamily: 'system-ui,sans-serif',
  };
  const card: React.CSSProperties = {
    border: '1px solid #3d4650', borderRadius: 6, padding: 14, marginBottom: 22, background: '#161d24',
  };
  const h2: React.CSSProperties = { fontSize: 17, margin: '0 0 6px' };
  const note: React.CSSProperties = { fontSize: 13, lineHeight: 1.9, color: '#9fb4c6', margin: '0 0 10px' };
  const media: React.CSSProperties = { width: '100%', display: 'block', background: '#000', borderRadius: 4 };
  const tabs: React.CSSProperties = { display: 'flex', gap: 10, marginBottom: 8, fontSize: 13 };

  const Pair = ({ base }: { base: string }): React.ReactElement => (
    <>
      <div style={tabs}>
        <span style={{ color: '#ffd34d' }}>等速（先にこちら）</span>
        <a href={`/gait-review/${base}-quarter.mp4`} style={{ color: '#4dd2ff' }}>0.25 倍を別窓で開く</a>
      </div>
      <video src={`/gait-review/${base}-equal.mp4`} style={media} controls loop muted playsInline />
    </>
  );

  return (
    <main style={wrap}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 21, margin: '0 0 4px' }}>走りの見比べ台（★開発専用）</h1>
        <p style={note}>
          ★これは <b>観察のための頁</b>です。★どれかが「正しい」という判定ではありません。<br />
          ★<b>主観の評価は等速を先に</b>見てください。★0.25 倍は姿勢と接地を確かめるためのものです。
        </p>

        <section style={card}>
          <h2 style={h2}>① ★斜め前の素材 — ★1 周 8 コマ（★同じ倍率・止め絵）</h2>
          <p style={note}>
            ★水色＝接地線／★黄＝そのコマの最下点／★橙＝そのコマの上端。<br />
            ★<b>上が現行のデフォルメ（v4）、下が旧 2D（v2）</b>です。★別の絵柄なので、
            ★どちらが正しいかではなく <b>何が動いているか</b>を見てください。
          </p>
          <img src="/gait-review/cycle-v4.jpg" alt="現行デフォルメ v4 の 1 周" style={media} />
          <p style={{ ...note, margin: '8px 0' }}>★↑ 現行デフォルメ v4</p>
          <img src="/gait-review/cycle-v2.jpg" alt="旧 2D v2 の 1 周" style={media} />
          <p style={{ ...note, margin: '8px 0 0' }}>★↑ 旧 2D v2</p>
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: '#9fb4c6' }}>★脚の形を拡大して見る（v4）</summary>
            <img src="/gait-review/cycle-v4-zoom.jpg" alt="v4 の脚を拡大" style={{ ...media, marginTop: 8 }} />
            <p style={{ ...note, margin: '6px 0 0' }}>
              ⚠️ ★こちらは 1 コマずつ切り抜いて高さを揃えたものです。
              ★<b>体の大きさ・浮き・騎手の上下動の比較には使えません</b>（★脚の形を読む用）。
            </p>
          </details>
        </section>

        <section style={card}>
          <h2 style={h2}>② ★斜め前の 4 条件（★1 角・同じ馬・同じカット）</h2>
          <p style={note}>
            ★左から ★<b>D 当て込み時</b>（旧配置・1完歩 7m・浮き 1）／
            ★<b>A 現行</b>（実測配置・5.6m・浮き 0.3）／
            ★<b>B 現行だが浮き 0</b>（全コマ接地）／
            ★<b>E 旧 2D 素材</b>（旧配置）。<br />
            ★見ていただきたいのは ★<b>B が A より良いか悪いか</b>と ★<b>E が本当に良く見えるか</b>です。
          </p>
          <Pair base="front4" />
        </section>

        <section style={card}>
          <h2 style={h2}>③ ★1 完歩だけを変えた対照（★他は全部同じ）</h2>
          <p style={note}>
            ★左 ★<b>5.60m</b>（2.96 完歩/秒）／★右 ★<b>7.00m</b>（2.37 完歩/秒）。<br />
            ★素材・配置・浮き・カメラ・カット・馬は同一で、★<b>1 完歩だけ</b>が違います。
          </p>
          <Pair base="stride" />
        </section>

        <section style={card}>
          <h2 style={h2}>④ ★発走（★3 番＝型 A ／ 4 番＝型 B）</h2>
          <p style={note}>
            ★表示秒 7.8〜10.3。★黄の枠が対象の馬、★水色の線が走路上の接地点です。<br />
            ★測った事実: ★<b>発走から 0.25 秒間、12 頭が 1 コマも違わない</b>コマを描いています。
          </p>
          <Pair base="start" />
        </section>

        <section style={card}>
          <h2 style={h2}>⑤ ★真横（★直った所の確認・3 者）</h2>
          <p style={note}>
            ★左 ★<b>検証台</b>（★4 頭の台・オーナーが良いと言った画面）／
            ★中 ★<b>修正前</b>の桜星賞／★右 ★<b>修正後</b>の桜星賞。<br />
            ★<b>左と右が同じ走りに見えるか</b>だけ見てください。★ここが残りの土台です。
          </p>
          <Pair base="side3-typeA" />
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: '#9fb4c6' }}>★型 B も見る</summary>
            <video src="/gait-review/side3-typeB-equal.mp4" style={{ ...media, marginTop: 8 }} controls loop muted playsInline />
          </details>
        </section>

        <section style={{ ...card, marginBottom: 8 }}>
          <h2 style={h2}>★この頁が言っていないこと</h2>
          <p style={{ ...note, margin: 0 }}>
            ★どの脚が支持しているかは ★<b>同定できていません</b>（★正面寄りで脚が重なるため）。<br />
            ★ギャロップで接地コマが 8 中いくつであるべきか、★<b>根拠を持っていません</b>。<br />
            ★v4 と v2 の違いは記述しましたが、★<b>どちらが正しいかは判定していません</b>。<br />
            ★方向（★進路と画像方向の関係）の対照は ★<b>未着手</b>です。<br />
            ★1 頭・1 カット・2.5 秒の観察です。★全会場・全シードではありません。
          </p>
        </section>
      </div>
    </main>
  );
}
