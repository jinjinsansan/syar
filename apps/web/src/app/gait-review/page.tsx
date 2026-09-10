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
