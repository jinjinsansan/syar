/**
 * ★**診断用のレース映像を撮る**（★2026-09-09・レビュー側の指示）
 *
 * 【★なぜ要るか】
 *   ★オーナー評「★コーナーが不自然」。★原因は未確定です。
 *   ⚠️ ★開発側が最初に出した映像は ★**等速ではありませんでした**:
 *      ★80ms 間隔で撮ったつもりが、★1 コマの取得に時間がかかり、
 *      ★実際の経過は約 30 秒。★それを 20fps で 6.5 秒に書き出したので、
 *      ★**倍率が不明で、しかも一定でない**映像になっていました。
 *   → ★**各コマの実時刻（レースの表示秒）を記録**し、★等速で書き出します。
 *
 * 【★何を出すか】
 *   ★① 矢印なしの映像
 *   ★② ★**各馬の足元に、走路の接線方向の矢印**を重ねた映像
 *      ★馬番・使用素材・カメラに対する角度も出します
 *   ★③ 各コマの表示秒を書いた `frames.json`
 *
 * ★実行: npx tsx tools/capture-race-diagnostic.mjs --from 12 --to 22 [--fps 10]
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { launch } from './lib/cdp.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const FROM = Number(arg('from', 12));
const TO = Number(arg('to', 22));
/** ★出す映像のコマ数／秒。★レースの 1 秒を映像の 1 秒にします（★等速） */
const FPS = Number(arg('fps', 10));
const OUT = String(arg('out', 'tmp/race-diagnostic'));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/plain`, { recursive: true });

const browser = await launch({ port: 9451, width: 1400, height: 950, timeoutMs: 20000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * ⚠️ ★**文字の完全一致で押します。** ★部分一致は「ほかのコースを観る」を掴みます（★2026-09-09）。
 */
const click = (t) => browser.evaluate(`(function(){var b=[].slice.call(document.querySelectorAll('button')).filter(function(x){return x.textContent.trim()===${JSON.stringify(t)};});if(b[0]){b[0].click();return true;}return false;})()`);
try {
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
  /** ★`--url` で開き先を変えられます（★`?types=0` との A/B 用・★既定は本番と同じ経路） */
  await browser.goto(String(arg('url', 'http://localhost:3210/race?dev=1')), "!!document.querySelector('canvas')", { timeoutMs: 120000, settleMs: 4000 });
  await browser.send('Page.bringToFront');
  /**
   * ⚠️ ★**「観る」が出るまで待ちます**（★2026-09-09・直しました）。
   *
   *   ★以前は ★**先頭のボタンの文字**が「読み込み中」でないことを見ていました。
   *   ★ところが `?dev=1` では ★先頭が「調整を初期値に戻す」（開発用の操作）になり、
   *   ★**素材を読み終える前に抜けて**しまいます。★素材が増えた日に、
   *   ★**画面が真っ黒のまま 3 コマ撮れて**しまいました。
   * → ★押す当のボタンそのものを待ちます。
   */
  /**
   * ⚠️ ★**「観る」は完全一致で探します**（★2026-09-09）。
   *    ★同じ画面に ★**「ほかのコースを観る」**があり、★部分一致だと ★そちらを押して
   *    ★**コース一覧が開くだけ**でした（★キャンバスは真っ黒のまま 3 コマ撮れました）。
   *    ★素材を読み終える前は ★「読み込み中…」という別の文字になります。
   */
  /**
   * ⚠️ ★**PC では入場カード（「観る」）が出ません**（★2026-09-09 に実測して分かりました）。
   *    ★PC の画面に出るのは ★**開発用の操作**だけです。★だから
   *    ★**実際に使う撮影用シークのつまみ**が出るまで待ちます。
   *
   *    ★以前は「観る」を ★**部分一致**で探していました。★同じ画面の
   *    ★「ほかのコースを観る」を掴んで ★**コース一覧を開くだけ**になり、
   *    ★キャンバスが真っ黒のまま 3 コマ撮れました。
   */
  let ready = false;
  for (let i = 0; i < 90; i += 1) {
    const n = await browser.evaluate("[].slice.call(document.querySelectorAll('input[type=range]')).filter(function(x){return Number(x.max)>30;}).length");
    if (Number(n) > 0) { ready = true; break; }
    await sleep(2000);
  }
  if (!ready) {
    console.error('★★撮影用シークのつまみが出ませんでした（★180 秒）— ★素材が組めていません');
    await browser.close();
    process.exit(1);
  }
  /**
   * ⚠️ ★**「観る」を押さないとレース画面が始まりません**（★2026-09-09）。
   *    ★開発側は「開発用の操作」だけ出して撮り、★101 コマ全部同じ絵になりました。
   */
  /**
   * ⚠️ ★「開発用の操作を出す」は ★**ボタンではなくリンク**です。
   *    ★開発側は button として押そうとして失敗し続けました（★戻り値 false）。
   * → ★`?dev=1` を付けて開きます。
   */
  /**
   * ★**PC と携帯で、始め方が違います**（★2026-09-09・実測）。
   *   ★携帯 … 入場カードの ★「観る」
   *   ★PC  … 入場カードが出ないので、★開発用の ★「演出開始」
   * ⚠️ ★どちらも押さないと ★**キャンバスは真っ黒のまま**で、
   *    ★それでもシークは動くので ★**黒いコマが撮れてしまいます**。
   */
  /** ⚠️ ★つまみは素材より先に出ます。★早く押すと効きません（★実測）。★少し置いてから押します */
  await sleep(8000);
  const started = (await click('観る')) === true || (await click('演出開始')) === true;
  if (!started) {
    console.error('★★レースを始められませんでした（「観る」も「演出開始」も押せません）');
    await browser.close();
    process.exit(1);
  }
  await sleep(3000);
  await click('停止'); await sleep(500);
  /**
   * ★**調整卓のつまみを外から設定します**（★2026-09-10・★斜め前の切り分け用）。
   *   ★`--slider "上下動・浮き=0"` のように、★**画面の表示名**で指定します。
   * ⚠️ ★min/max では見分けません（★「上下動・浮き」と「発走時のカメラ揺れ」は同じ 0〜2 です）。
   *    ★つまみには `aria-label` が付いているので、★それで選びます。
   * ⚠️ ★入ったことを読み返して確かめ、★入らなければ止まります（★設定したつもりを作らない）。
   */
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] !== '--slider') continue;
    const [name, value] = String(process.argv[i + 1] ?? '').split('=');
    const got = await browser.evaluate(`(function(){
      var i=document.querySelector('input[type=range][aria-label=' + JSON.stringify(${JSON.stringify(name)}) + ']');
      if(!i) return 'なし';
      var set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      set.call(i, ${JSON.stringify(String(value))});
      i.dispatchEvent(new Event('input',{bubbles:true}));
      i.dispatchEvent(new Event('change',{bubbles:true}));
      return i.value;
    })()`);
    if (String(got) === 'なし' || Math.abs(Number(got) - Number(value)) > 1e-9) {
      console.error(`★★つまみが設定できません: ${name} → ${got}（★狙い ${value}）`);
      await browser.close();
      process.exit(1);
    }
    console.log(`★つまみ ${name} = ${got}`);
    await sleep(400);
  }
  /**
   * ★**シークで 1 コマずつ出します**（★再生しながら撮ると等速になりません）。
   *   ★`seekPos` のつまみに値を入れて、★その表示秒の絵を撮ります。
   */
  /**
   * ⚠️ ★**シークのつまみは、演出を開始しないと出ません**（★2026-09-09）。
   *    ★開発側は最初「いちばん後ろのつまみ」を掴み、★**馬の大きさのつまみ**を
   *    ★動かしていました（★12〜22 は範囲外なので何も起きず、★101 コマ全部同じ絵）。
   *    ★出す前に測って気づきました。
   * → ★**範囲で見分けます**（★シークは max がレースの長さ ＝ 数十秒）。
   */
  const seekTo = (sec) => browser.evaluate(`(function(){
    var is=[].slice.call(document.querySelectorAll('input[type=range]'));
    var i=is.filter(function(x){return Number(x.max)>30;})[0];
    if(!i) return 'シークのつまみが無い';
    var set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    set.call(i, ${JSON.stringify(String(sec))});
    i.dispatchEvent(new Event('input',{bubbles:true}));
    i.dispatchEvent(new Event('change',{bubbles:true}));
    return i.value;
  })()`);
  const frames = [];
  const step = 1 / FPS;
  let n = 0;
  for (let t = FROM; t <= TO + 1e-9; t += step) {
    const got = await seekTo(t.toFixed(2));
    await sleep(260);
    await browser.send('Page.bringToFront');
    const f = await browser.evaluate("(function(){var c=document.querySelector('canvas');return c.toDataURL('image/jpeg',0.92);})()");
    writeFileSync(`${OUT}/plain/f${String(n).padStart(4, '0')}.jpg`, Buffer.from(f.split(',')[1], 'base64'));
    /**
     * ★**各馬の「本来向くべき向き」を、画面座標で取り出します**（★レビュー側の指示②）。
     *   ★足元（走路上の点）と、★そこから接線方向に 3m 進んだ点を、★同じカメラで投影します。
     *   ★2 点を結べば ★**走路の接線方向の矢印**になります。
     * ⚠️ ★描画には一切影響しません。★読むだけです。
     */
    const marks = await browser.evaluate("window.__raceDiag ? JSON.stringify(window.__raceDiag) : 'null'");
    frames.push({
      index: n, displaySec: Number(t.toFixed(2)), slider: String(got),
      marks: marks === 'null' ? null : JSON.parse(String(marks)),
    });
    n += 1;
  }
  writeFileSync(`${OUT}/frames.json`, JSON.stringify({
    from: FROM, to: TO, fps: FPS,
    note: '★レースの表示秒 1 秒 = 映像 1 秒（等速）。★書き出し倍率 1.0',
    frames,
  }, null, 1));
  /**
   * ⚠️ ★**真っ黒なコマを「撮れた」と言わない**（★2026-09-09・実際にやりました）。
   *    ★レースを始め損ねてもシークは動くので、★黒いまま所定の枚数が撮れます。
   */
  const dark = await browser.evaluate(`(function(){
    var c=document.querySelector('canvas'); var g=c.getContext('2d');
    var d=g.getImageData(0,0,c.width,c.height).data; var s=0;
    for(var i=0;i<d.length;i+=4000){ s+=d[i]+d[i+1]+d[i+2]; }
    return s/(d.length/4000)/3;
  })()`);
  if (Number(dark) < 8) {
    console.error(`★★真っ黒でした（★平均輝度 ${Number(dark).toFixed(1)}）— ★レースが始まっていません。★出しません`);
    process.exit(1);
  }
  console.log(`★${n} コマ（★表示秒 ${FROM}〜${TO}・${FPS}fps・★等速・★平均輝度 ${Number(dark).toFixed(0)}）→ ${OUT}/plain`);
} finally { await browser.close(); }
