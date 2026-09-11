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

        <section style={{ ...card, border: '1px solid #7a6a2a', background: '#1d1c15' }}>
          <h2 style={h2}>⑥ ★脚の太さ（★オーナー評「足が太過ぎる」を測りました）</h2>
          <p style={note}>
            ★輪郭の下 35% の帯で、★脚 1 本の断面の幅を ★<b>輪郭の高さで割った値</b>の中央値です。
          </p>
          <table style={{ fontSize: 13.5, borderCollapse: 'collapse', marginBottom: 12 }}>
            <tbody>
              {([
                ['斜め前・現行 v4', '9.59%', '#ff8a5c'],
                ['斜め前・旧 2D v2', '5.45%', '#9fb4c6'],
                ['★真横・現行 v8（★オーナー合格）', '★12.77%', '#ffd34d'],
                ['真横・旧 v6', '6.33%', '#9fb4c6'],
              ] as const).map(([name, value, color]) => (
                <tr key={name}>
                  <td style={{ padding: '3px 16px 3px 0', color }}>{name}</td>
                  <td style={{ padding: '3px 0', textAlign: 'right', color, fontWeight: 700 }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ ...note, color: '#e8c86a' }}>
            ⚠️ ★<b>斜め前では、ご指摘のとおり現行が旧 2D の 1.76 倍です。</b><br />
            ⚠️ ★しかし ★<b>合格した真横（v8）のほうが、さらに太い（12.77%）</b>のです。<br />
            → ★<b>太さだけでは、合格と不合格を説明できません。</b>
            ★正面寄りでは脚が短く詰まって見えるため、★太さが効き方を変えている可能性があります。
          </p>
          <img src="/gait-review/cycle-side-v8.jpg" alt="合格した真横 v8 の 1 周" style={media} />
          <p style={{ ...note, margin: '8px 0 0' }}>
            ★↑ ★<b>合格した真横 v8</b>。★①の上段（斜め前 v4）と見比べてください。<br />
            ★<b>この真横の脚も「太過ぎる」と感じますか？</b> ★それとも太さが気になるのは斜め前だけですか。<br />
            ★この答えで、★「太さが原因」なのか「正面寄りだと太さが悪目立ちする」のかが分かれます。
          </p>
        </section>

        <section style={{ ...card, border: '2px solid #4dd2ff', background: '#14212a' }}>
          <h2 style={h2}>⑦ ★試作 — ★斜め前の脚だけを細くしてみました</h2>
          <p style={note}>
            ★「真横は太く感じない、斜め前だけ」というお答えから、★<b>脚の太さを胴の幅と比べ</b>ました。
          </p>
          <table style={{ fontSize: 13.5, borderCollapse: 'collapse', marginBottom: 10 }}>
            <tbody>
              {([
                ['斜め前・現行 v4', '13.4%', '不合格', '#ff8a5c'],
                ['斜め前・現行 v4b', '11.3%', '不合格', '#ff8a5c'],
                ['斜め前・旧 2D v2', '8.6%', '好評', '#7fd18a'],
                ['真横・現行 v8', '7.3%', '★合格', '#7fd18a'],
                ['★試作（脚を細く）', '★8.6%', '★これを見ていただきます', '#4dd2ff'],
              ] as const).map(([name, value, judge, color]) => (
                <tr key={name}>
                  <td style={{ padding: '3px 16px 3px 0', color }}>{name}</td>
                  <td style={{ padding: '3px 16px 3px 0', textAlign: 'right', color, fontWeight: 700 }}>{value}</td>
                  <td style={{ padding: '3px 0', color }}>{judge}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ ...note, color: '#e8c86a' }}>
            ⚠️ ★<b>指標を 3 つ試して、3 つ目が当たった形です。</b>★偶然かもしれません。
            ★（★「太さ÷高さ」と「長さ÷太さ」は ★合否の順序と ★一致しませんでした。）<br />
            → ★だから ★<b>実際に細くして、良く見えるかを確かめます。</b>
          </p>
          <p style={note}>
            ★左 ★<b>現行</b>／★右 ★<b>試作（脚を 63% の幅へ）</b>。
            ★<b>配置・浮き・1 完歩・カメラ・馬はすべて同一</b>で、★<b>脚の太さだけ</b>が違います。
          </p>
          <Pair base="thin" />
          <img src="/gait-review/cycle-v4thin.jpg" alt="試作の 1 周" style={{ ...media, marginTop: 12 }} />
          <p style={{ ...note, margin: '8px 0 0' }}>
            ★↑ 試作の 1 周 8 コマ（★①の上段と見比べてください）。<br />
            ⚠️ ★これは ★<b>画像処理で細くしただけの試作</b>です。★仕上がりの品質は求めていません。
            ★<b>本番の素材ではありません。</b>★良くなるかどうかを確かめるためだけのものです。
          </p>
        </section>

        <section style={{ ...card, border: '2px solid #7fd18a', background: '#141f18' }}>
          <h2 style={h2}>⑧ ★参考映像から — ★走行を「真横だけ」で見せたら</h2>
          <p style={note}>
            ★参考映像（93 秒・14 点を標本）を見たところ、★<b>走行の場面は真横と後方だけ</b>で、
            ★<b>正面寄りの馬が 1 つも出てきません</b>。★せめぎ合いも直線も真横です。
          </p>
          <table style={{ fontSize: 13.5, borderCollapse: 'collapse', marginBottom: 10 }}>
            <tbody>
              <tr><td style={{ padding: '3px 16px 3px 0' }}>★参考映像</td>
                <td style={{ padding: '3px 0', color: '#7fd18a' }}>★真横と後方だけ（★正面寄り 0）</td></tr>
              <tr><td style={{ padding: '3px 16px 3px 0' }}>★私たちの台本</td>
                <td style={{ padding: '3px 0', color: '#ff8a5c' }}>★走行 62 秒のうち ★<b>斜め前が 26 秒（42%）</b></td></tr>
            </tbody>
          </table>
          <p style={{ ...note, color: '#e8c86a' }}>
            ⚠️ ★これは ★<b>私の見立てです</b>。★「参考映像が答え」の意味がこれで合っているか、
            ★教えてください。★違うなら捨てます。
          </p>
          <p style={note}>
            ★左 ★<b>現行</b>（1 角＝斜め前の素材）／★右 ★<b>真横の素材だけ</b>。
            ★<b>カットの数・時刻・画角は同じ</b>で、★<b>使う素材だけ</b>が違います。
          </p>
          <Pair base="sideonly" />
          <p style={{ ...note, margin: '12px 0 6px' }}>★↓ ★1 レース通し（★真横の素材だけ・★早送り 5fps・★62 秒ぶん）</p>
          <video src="/gait-review/sideonly-fullrace.mp4" style={media} controls loop muted playsInline />
          <p style={{ ...note, margin: '8px 0 0' }}>
            ⚠️ ★<b>カットは 7 つとも残っています</b>（★減らしていません）。<br />
            ⚠️ ★これは ★<b>見比べるための口</b>です。★既定の画面は変えていません。<br />
            ⚠️ ★参考映像の ★<b>絵柄・演出は真似しません</b>（★憲法 §0.1）。★見ているのは
            ★「★走行をどの向きで見せているか」だけです。
          </p>
        </section>

        <section style={{ ...card, border: '2px solid #c9a227', background: '#1f1b12' }}>
          <h2 style={h2}>⑨ ★演出 9 点の現状（★録画）</h2>
          <p style={note}>
            ★企画者の 9 点を、★今の画面がどこまで満たしているかを撮りました。<br />
            ★<b>①ゲート・⑧優勝馬・⑨リプレイは、すでに成立しています。</b>
            ★壊れているのは ★<b>②の一部・③・⑤</b> だけでした。
          </p>
          <p style={{ ...note, margin: '10px 0 6px' }}>★↓ ★イントロ〜発走（★0〜11 秒）。★①②</p>
          <video src="/gait-review/rec-intro.mp4" style={media} controls loop muted playsInline />
          <p style={{ ...note, margin: '10px 0 6px' }}>
            ★↓ ★ゲート開放の細部（★5.6〜9.0 秒・★20fps）。
            ★<b>扉は開かず、1 コマ（0.05 秒）で消えます。</b>
          </p>
          <video src="/gait-review/rec-gate-slow.mp4" style={media} controls loop muted playsInline />
          <p style={{ ...note, margin: '10px 0 6px' }}>
            ★↓ ★ゴール〜優勝馬〜リプレイ〜着順（★66〜92 秒）。★⑦⑧⑨
          </p>
          <video src="/gait-review/rec-tail.mp4" style={media} controls loop muted playsInline />
          <p style={{ ...note, margin: '10px 0 0' }}>
            ★カットの時刻: ★6〜13 ②／★13〜26 ③／★26〜37 ④／★37〜40 ⑤／★40〜49 ④／
            ★49〜55 ⑥／★55〜60 斜め前／★60〜66 ⑥／★66〜72 ⑦／★<b>72〜77 ⑧</b>／
            ★<b>77〜81 ⑨</b>／★81〜92 着順ボード
          </p>
        </section>

        <section style={{ ...card, border: '2px solid #7fd18a', background: '#132018' }}>
          <h2 style={h2}>⑩ ★⑤ コーナーをカットインに置き換えました（★第一試作）</h2>
          <p style={note}>
            ★37〜40 秒の 3 秒（★4 角・★不合格だった斜め前の走行）を、
            ★<b>コース図の挿入画面</b>に置き換えました。★前後を含む ★<b>34〜43 秒</b>です。
          </p>
          <p style={{ ...note, color: '#7fd18a' }}>
            ★実測: ★<b>カット数 13 → 13</b>。★<b>境界は 1 つも変わっていません</b>。
            ★挿入画面は ★37・38・39 秒の 3 コマだけ。★総尺も同じです。
          </p>
          <p style={note}>
            ★見ていただきたいのは 2 点です。<br />
            ★① ★<b>どこを走っているか分かるか</b><br />
            ★② ★<b>走行へ戻ったとき唐突でないか</b>（★40 秒）
          </p>
          <Pair base="cutin-corner" />
          <p style={{ ...note, color: '#e8c86a', margin: '14px 0 6px' }}>
            ⚠️ ★<b>オーナー評（2026-09-10）: ★「カットインは長く見せるべきではない。
            ★一瞬のカッコイイカットインであるべき」「★何もかも真横だけではクオリティを疑われる」。</b><br />
            → ★上のコース図は ★<b>長すぎ、情報画面になっていました</b>。★下の 3 案を並べます。
          </p>
          <p style={note}>
            ★左 ★<b>現行</b>（★斜め前の走行・不合格）／
            ★中 ★<b>コース図</b>（★私の第一試作・★長すぎ）／
            ★右 ★<b>4 角の引き</b>（★後方から・★参考映像と同じ見せ方）。<br />
            ★<b>右が参考映像のコーナーの見せ方に近いもの</b>です。★既に台本に定義があり、素材も読み込まれます。
          </p>
          <Pair base="corner3" />
          <p style={{ ...note, color: '#e8c86a', margin: '14px 0 6px' }}>
            ⚠️ ★<b>オーナー評: ★「カーブの部分を馬が真横になりながら進んでいます」</b>（★右の案について）<br />
            ★実測 … ★カットの代表角 ★<b>51°</b> に対し、★馬の実際の向きは ★<b>中央 80°・幅 45〜102°</b>。
            ★素材は ★<b>1 カットに 1 つ</b>で、★カーブでも向きが変わりません。<br />
            ★さらに ★<b>カットが宣言している素材（`high-diag-v2`・★走り判定に合格）が、
            ★実行時に一度も使われていませんでした</b>（★閾値で `diag-rear-v2` に落ちていた）。
          </p>
          <p style={note}>
            ★左 ★<b>現行</b>（斜め前）／★中 ★<b>4 角の引き・いまの素材</b>（★真横のまま曲がる）／
            ★右 ★<b>4 角の引き・宣言どおりの素材</b>（★高所斜め＝後ろ姿で曲がっていく）。
          </p>
          <Pair base="corner4" />
          <p style={{ ...note, color: '#e8c86a', margin: '14px 0 6px' }}>
            ⚠️ ★<b>オーナー評: ★「真上のカメラワークにした瞬間、★馬がぴょんぴょん どんどこ上下に跳ねている」</b><br />
            ★原因が分かりました。★<b>高所斜めの素材だけ、★最初に直した不具合がそのまま残っていました。</b><br />
            ★台本 v6 が使っていなかったため、★対象素材の一覧から漏れていたのです。
            ★引きで見せる案で実際に描かれた途端に出ました。
          </p>
          <table style={{ fontSize: 13.5, borderCollapse: 'collapse', marginBottom: 10 }}>
            <tbody>
              {([
                ['高所斜め v4', '6.37%', '3.30%', '★17.5%'],
                ['真横 v8（合格）', '6.94%', '2.95%', '3.4%'],
              ] as const).map(([n, a, b, c]) => (
                <tr key={n}>
                  <td style={{ padding: '3px 16px 3px 0' }}>{n}</td>
                  <td style={{ padding: '3px 16px 3px 0', textAlign: 'right' }}>蹄 {a}</td>
                  <td style={{ padding: '3px 16px 3px 0', textAlign: 'right' }}>頭頂 {b}</td>
                  <td style={{ padding: '3px 0', textAlign: 'right', color: '#ff8a5c' }}>幅の変動 {c}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={note}>
            ★素材そのものは真横と同等です。★しかし ★<b>幅が 17.5% 変動</b>するため、
            ★従来の配置（★鞍布の幅で毎コマ拡縮）が ★そのまま跳ねになっていました。<br />
            ★左 ★<b>修正前</b>／★右 ★<b>修正後</b>（★実測の接地・他の 2 組と同じ規則）。
          </p>
          <Pair base="cornerfix" />
          <p style={{ ...note, margin: '8px 0 0' }}>
            ⚠️ ★実測では ★上端の振れが ★<b>111.65px → 94.36px</b>（★15% 減）。<br />
            ⚠️ ★<b>この数字は弱い証拠です。</b>★コーナーはカメラが振れ、★馬の奥行きも変わるので、
            ★上端の振れにそれらが混ざります。★<b>合否はオーナーの目です。</b>
          </p>
          <p style={{ ...note, margin: '8px 0 0' }}>
            ⚠️ ★背面は不透明にしてあります（★不合格の走行が透けないように）。<br />
            ⚠️ ★レース時間は止めていません。★40 秒でその時点の真横走行へ戻ります。<br />
            ⚠️ ★着順・走破時刻・台帳・サーバー判定には触れていません。★描画だけです。<br />
            ⚠️ ★図が読みにくければ、★線・文字・余白を調整します。★遠慮なく言ってください。
          </p>
        </section>

        <section style={{ ...card, border: '2px solid #ffd34d', background: '#221d10' }}>
          <h2 style={h2}>⑪ ★旧 2D の場面 — ★どれを採るか選んでください</h2>
          <p style={note}>
            ★オーナー指示: ★<b>「2D 時代の 4 コーナー手前から曲がってくる時のシーンや、
            ★いくつか上手くいっていたシーンをピックアップし、それを使う。
            ★そして、そのシーンを短い尺で使う」</b>
          </p>
          <p style={{ ...note, color: '#ffd34d' }}>
            ★旧 2D の描画は ★<b>いまも動きます</b>（`?renderer=legacy`）。★下は 6 区間を 4 秒ずつ切り出したものです。<br />
            ★<b>採りたいものに ○ を、いらないものに × を付けて教えてください。</b>
          </p>
          <p style={{ ...note, color: '#ffd34d', margin: '0 0 6px' }}>
            ★<b>2D の桜星賞・通し（★表示秒 0〜71.4・★等速 10fps）</b><br />
            ★<b>動画の時刻が、そのまま表示秒です。</b>★気になった所で止めて、
            ★<b>その秒数を言ってください。</b>（★例:「44 秒から 48 秒のこの画」）
          </p>
          <video src="/gait-review/lg2d-full.mp4" style={media} controls playsInline />
          <p style={{ ...note, margin: '8px 0 14px' }}>
            ⚠️ ★<b>生の再生（`?renderer=legacy`）は壊れています。</b>★実測: ★表示秒 24.45 で
            ★<b>タイトル画面のまま</b>でした。★この動画は ★**1 コマずつシークして**撮ったもので、
            ★そちらは正常に描けます。★生の再生の不具合は別途。<br />
            ⚠️ ★背景に ★<b>継ぎ目</b>が見える所があります（★例: 45 秒あたりの左端）。<br />
            ⚠️ ★0〜71.4 秒までです（★撮影が途中で切れました）。★ゴール後は別途撮り直します。
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
            {([
              ['start', '① 発走のあと', '9〜13 秒'],
              ['first-corner', '② 1 コーナー', '18〜22 秒'],
              ['backstretch', '③ 向正面', '28〜32 秒'],
              ['third-corner', '④ 3 コーナー', '37〜41 秒'],
              ['fourth-corner', '⑤ 4 コーナー', '44〜48 秒'],
              ['straight', '⑥ 最後の直線', '53〜57 秒'],
            ] as const).map(([id, label, at]) => (
              <div key={id}>
                <p style={{ ...note, margin: '0 0 4px', color: '#eef2f6' }}>
                  <b>{label}</b> <span style={{ color: '#9fb4c6' }}>（{at}）</span>
                </p>
                <video src={`/gait-review/lg2d-${id}.mp4`} style={media} controls loop muted playsInline />
              </div>
            ))}
          </div>
          <p style={{ ...note, margin: '12px 0 0' }}>
            ⚠️ ★これは ★<b>旧 2D の描画そのまま</b>です（★馬も背景も旧素材）。
            ★新しいデフォルメ馬は出てきません。<br />
            ⚠️ ★採用する場合、★<b>その区間だけ旧 2D の画を使う</b>という作りになります。
            ★絵柄が混ざることになるので、★そこはオーナー判断です。<br />
            ⚠️ ★カットの数・境界は変えません。★短い尺で使う、というご指示のとおりにします。
          </p>
        </section>

        <section style={card}>
          <h2 style={h2}>⑫ ★スクリーンショット 8 点への対応（2026-09-11）</h2>
          <p style={note}>
            ★いただいた 8 点に順に当てています。★<b>できなかったものは、できなかったと書いています。</b>
          </p>
          <table style={{ fontSize: 13, lineHeight: 1.8, color: '#9fb4c6', borderCollapse: 'collapse', margin: '0 0 14px' }}>
            <thead><tr>
              <th style={{ textAlign: 'left', padding: '2px 12px 2px 0' }}>#</th>
              <th style={{ textAlign: 'left', padding: '2px 12px 2px 0' }}>指摘</th>
              <th style={{ textAlign: 'left', padding: '2px 0' }}>やったこと</th>
            </tr></thead>
            <tbody>
              {([
                ['①', 'タイトルの自馬が左にはみ出る', '0.42 → 0.34 に縮め、題字板と画面端の間へ収めた'],
                ['②-a', 'ゲート〜発走を真横に', '★できません。真横だとゲートが黒い塊になり 12 頭が縦に積む（撮って確認）。正面で走る時間を 16m → 12.8m へ詰めた'],
                ['②-b', '今のカットインは使えない', '意味のある 4 枚へ作り直し（下）'],
                ['③', '上空は良い／小さ過ぎ／大きくすると斜め前が目立つ', '★カメラを走路の真横へ回した。馬は真横を向くので合格素材が使える。5.5% → 18.8%'],
                ['④', '位置取りも同じ', '8.1% → 12.4%（俯瞰のまま。素材は不合格のまま）'],
                ['⑤', 'コーナーも同じ', '5.9% → 9.2%。★真横に回すと弧が消えて「コーナーに見えない」ので回せない'],
                ['⑥', '真横→真横が繋がらない', '★原因はカメラの高さ。直線の高さを一つの帯へ揃えた。同じ欠陥が 5 か所あった'],
                ['⑦', '足が白ブチの馬をやめる', '型 B を一旦外した。★12 頭すべて型 A になり、見分けは毛色 7 色だけに戻る'],
                ['⑧', '最後の直線に展開が要る', '★エンジンもカメラも足りていた。足りないのは実況だった（下）'],
              ] as const).map((r) => (
                <tr key={r[0]}>
                  <td style={{ padding: '2px 12px 2px 0', color: '#ffd34d' }}>{r[0]}</td>
                  <td style={{ padding: '2px 12px 2px 0', color: '#eef2f6' }}>{r[1]}</td>
                  <td style={{ padding: '2px 0' }}>{r[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ ...note, margin: '0 0 6px', color: '#eef2f6' }}>
            <b>★⑨⑩⑪ 発走 → 位置取り（★表示 6〜22 秒・★等速）— ★発馬機を作り直しました</b>
          </p>
          <p style={note}>
            ★<b>発馬機を「絵」ではなく「形」にしました。</b>★房の仕切り・柱・天井・番号板を
            ★<b>走路の座標から組み立てます</b>（<code>starting-gate-world.ts</code>）。<br />
            → ★正面でも真横でも俯瞰でも成立します。★角度を変えるたびに絵を作り直す必要がありません。<br />
            ★これで ★<b>ゲート・発走・位置取りを全部「真横」</b>にできました。
            ★真横素材は合格済みなので、★<b>斜め前向きは出ません</b>。
          </p>
          <Pair base="staging2-open" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            {([
              ['gate-side', '⑪ ゲート（真横・15.5%）— 12 房と番号が読める'],
              ['start-rear-fixed', '⑨ 発走直後（20.0%）— 芝の縞が縦・ラチが水平・馬は右向き'],
              ['opening-side-high', '⑩ 位置取り（14.6%）— 同じく走路が水平'],
            ] as const).map(([id, label]) => (
              <div key={id}>
                <p style={{ ...note, margin: '0 0 4px', color: '#eef2f6' }}><b>{label}</b></p>
                <img src={`/gait-review/${id}.jpg`} alt={label} style={media} />
              </div>
            ))}
          </div>
          <p style={{ ...note, margin: '10px 0 0' }}>
            ⚠️ ★<b>真横のカメラは必ず走路の横に置かれます。</b>★そのままだと発馬機の房が
            ★一直線に奥へ並び、★<b>手前の 1 房が残り 11 房を隠します</b>（★実測・1 頭しか見えませんでした）。
            → ★走路方向へ 26m ずらし、★仕切りを ★<b>板から枠</b>へ変えて解いています。<br />
            ⚠️ ★⑨ の原因は ★<b>2 つ</b>ありました。<br />
            ★① ★<b>背景の作り方</b>。★真横のカットは 1 枚絵の板で描いており、板は走路を
            ★<b>水平の帯</b>として持ちます。★高い位置から見ると馬は斜めに並ぶので、
            ★先頭が芝の外に出ました。→ ★そのカットだけ ★<b>透視ワールド</b>へ回しています。<br />
            ★② ★<b>走路が画面で傾いていた</b>（★オーナー「芝の進行方向に対して馬が右に向いているのがおかしい」）。
            ★馬の絵は画面に対してまっすぐ立つ板で ★<b>回りません</b>。★走路が寝ると馬だけが水平を向きます。
            → ★高い真横のカットから ★<b>走路方向へのずらしを抜きました</b>。<br />
            ⚠️ ★傾きは ★<b>ずらし × 高さ</b>で出ます。★低いゲートは 26m ずらしても ★3.4° しか傾きません
            （★実測）。★だからゲートはずらしたまま、★高いカットだけ 0 にしています。
          </p>

          <p style={{ ...note, margin: '18px 0 6px', color: '#eef2f6' }}>
            <b>★⑤ 4 コーナー（★表示 35〜43 秒・★等速）</b>
          </p>
          <p style={note}>
            ★<b>脚質のカットイン</b> → ★コーナー（引きの俯瞰・9.2%）→ ★<b>直線へのカットイン</b>。<br />
            ⚠️ ★ここだけは ★<b>真横に回せません</b>。★回すと弧が消えて、ただの直線に見えます。
          </p>
          <Pair base="staging2-corner" />

          <p style={{ ...note, margin: '18px 0 6px', color: '#eef2f6' }}>
            <b>★⑧ 最後の直線（★表示 46〜58 秒・★等速）</b>
          </p>
          <p style={note}>
            ★測った結果、★<b>エンジンもカメラも足りていました</b>。<br />
            ★エンジン … 直線での追い抜き <b>3〜8 回</b>／上位 5 頭の伸びが 17〜25m → 1.3〜14.7m
            （<code>audit-real-overtakes</code>・8 seed）<br />
            ★カメラ … 競り合いカットで主役 2 頭以上が <b>100%</b> 画面内（<code>audit-contest-focus</code>）<br />
            ★足りていなかったのは <b>実況</b>でした。★「迫る」と呼ぶ相手は
            ★<b>常に 2 着馬</b>で、★後方から来る馬の名前は一度も出ませんでした。<br />
            → ★<b>いちばん詰めている馬を、3 番手以降のときだけ一度名指し</b>します。
            ★6 seed で確かめると、★名指しされるのは 1 頭だけで、
            ★<b>そのうち 3 頭は実際の勝ち馬</b>でした（★seed 42 → 10 番 アオバハヤテ）。
          </p>
          <Pair base="staging2-straight" />

          <p style={{ ...note, margin: '18px 0 6px', color: '#eef2f6' }}>
            <b>★②-b カットイン 4 枚（★毎回ちがう中身・★1 枚 1.2 秒）</b>
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {([
              ['cutin-a-own', 'A 発走直後 — あなたの馬'],
              ['cutin-b-formation', 'B 位置取り — 現在の隊列'],
              ['cutin-c-style', 'C 4 角入り — ここから動く馬'],
              ['cutin-d-straight', 'D 直線へ — 残り距離と差'],
            ] as const).map(([id, label]) => (
              <div key={id}>
                <p style={{ ...note, margin: '0 0 4px', color: '#eef2f6' }}><b>{label}</b></p>
                <img src={`/gait-review/${id}.jpg`} alt={label} style={media} />
              </div>
            ))}
          </div>
          <p style={{ ...note, margin: '10px 0 0' }}>
            ⚠️ ★<b>最後の直線には入れません</b>。★佳境でいちばん見たい場面から目を離させないためです。
            ★⑥ の継ぎ目は ★<b>カメラの高さ</b>で解いています。
          </p>

          <p style={{ ...note, margin: '18px 0 6px', color: '#eef2f6' }}>
            <b>★⑥ 継ぎ目 3 か所（★左＝切り替え前／右＝切り替え後）</b>
          </p>
          <img src="/gait-review/seam-fixed.jpg" alt="継ぎ目 3 か所" style={media} />
          <p style={{ ...note, margin: '8px 0 0' }}>
            ★上段＝勝負所→せめぎ合い／中段＝せめぎ合い→引き／下段＝位置取り→勝負所。
            ★どれも背景（芝・ラチ・木立）が繋がっています。
          </p>

          <p style={{ ...note, margin: '18px 0 6px', color: '#eef2f6' }}>
            <b>★① タイトル画面</b>
          </p>
          <img src="/gait-review/title-fixed.jpg" alt="タイトル画面" style={media} />

          <p style={{ ...note, margin: '14px 0 0' }}>
            ★開発サーバーでそのまま見る:{' '}
            <a href="/race?dev=1" style={{ color: '#4dd2ff' }}>/race?dev=1</a>（★既定）／{' '}
            <a href="/race?dev=1&corner=front" style={{ color: '#4dd2ff' }}>?corner=front</a>（★前のコーナーへ戻す）／{' '}
            <a href="/race?dev=1&cutin=off" style={{ color: '#4dd2ff' }}>?cutin=off</a>（★カットインを止める）
          </p>
        </section>

        <section style={{ ...card, marginBottom: 8 }}>
          <h2 style={h2}>★この頁が言っていないこと</h2>
          <p style={{ ...note, margin: 0 }}>
            ★どの脚が支持しているかは ★<b>同定できていません</b>（★正面寄りで脚が重なるため）。<br />
            ★ギャロップで接地コマが 8 中いくつであるべきか、★<b>根拠を持っていません</b>。<br />
            ★v4 と v2 の違いは記述しましたが、★<b>どちらが正しいかは判定していません</b>。<br />
            ★方向（★進路と画像方向の関係）の対照は ★<b>未着手</b>です。<br />
            ★⑫ の引きは ★<b>脚さばきを直していません</b>。★<b>小さくして見えなくしただけ</b>です。<br />
            ★引いたコーナーが「コーナーに見えるか」は ★<b>オーナーの目でしか決まりません</b>。
            ★弧が読めるところまでは持っていけていません。<br />
            ★1 頭・1 カット・2.5 秒の観察です。★全会場・全シードではありません。
          </p>
        </section>
      </div>
    </main>
  );
}
