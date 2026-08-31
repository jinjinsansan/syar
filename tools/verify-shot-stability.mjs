/**
 * ★**その秒で撮った 1 コマが、繰り返し撮って同じになるか**を測る（読取専用・台帳 B-2）
 *
 * 【★なぜ要るか】
 *   ⚠️ ★2026-08-30、★`--sec 32` で**同じ URL を 2 枚**撮ったら、
 *      ★帯の平均輝度が **最大 20%** 動きました。★`homestretch-front` は 1312〜1392m の
 *      ★**80m しかなく**、★32 秒はその境目で、★1 コマずれると**別のカメラの絵**になります。
 *   ★そこで測った「馬場の濃さ 芝 100 / 89.1 / 81.8」は、★**2 回とも同じ側に落ちたから**
 *      再現しただけで、★**保証はありませんでした**（`REPORT_P4_TRACK_CONDITION_20260830.md` §6）。
 *
 * 【★なぜ「安全な秒の一覧」を配らないのか】
 *   ⚠️ ★カットは**距離の割合**で切られるので、★**境目は鞍ごとに違います**（台帳 A-8）。
 *      ★`_cuts.mjs` は 1600m の既定オーバルに直書きで、★50 鞍には使えません。
 *   ⚠️ ★`--sec` は**画面の時計**で、★発走前に約 10 秒の前置きがあります。
 *      ★`verify-cut-timing.mjs` は**レースの時計**なので、★そのまま `--sec` に使えません。
 *   → ★**秒の安全性は、暦の上で計算するより、撮って確かめるほうが確実です。**
 *     ★この道具は ★**覚えている状態をやめる**ためのものです。
 *
 * 【★測り方】★**2 通りを別々に出します。** ★混ぜると、道具が何を測ったのか分からなくなります。
 *   ★**A「読み込み直して撮る」** … ★`_realshot.mjs` の手順そのもの（★毎回ページを読み直す）。
 *     → ★**手順書の再現性はこちらです。** ★合否に使うのはこの列。
 *   ★**B「シークで寄せる」** … ★1 回読み込んだまま、★別の秒から寄せて止める。
 *     → ★**こちらは A より厳しく出ます。** ★描画に前のコマが効いている（★砂煙・ぼかし・カメラの慣らし）ためです。
 *
 * ⚠️ ★**開発側は最初 B だけで測り、★5/5 を「使えない」と出しました。**
 *    ★既知の真実（★10 秒は安全・A-10 で 2 回撮って一致）と食い違ったので、★道具のほうを疑いました。
 *    → ★**B は「スクラブで寄せると絵が変わる」ことを測っていて、手順の再現性ではありませんでした。**
 *
 * ⚠️ ★開発サーバーが要ります（★別の窓）: `cd apps/web ; npm run dev`
 * ⚠️ ★読むだけです。★製品コードにも DB にも触れません。
 *
 *   npx tsx tools/verify-shot-stability.mjs
 *   npx tsx tools/verify-shot-stability.mjs --race g1-ousei --secs 10,14,18,22,32
 */
import { launch } from './lib/cdp.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3210';
const RACE = arg('race', '');
/** ★当時の条件を再現するための追加の口（例: `--query "surface=dirt&condition=soft"`） */
const QUERY = arg('query', '');
const SEED = Number(arg('seed', 42));
/** ★既定は、これまでの便で実際に使われた秒（★10 / 14 / 18 は安全・★22 / 32 は境目の直後） */
const SECS = String(arg('secs', '10,14,18,22,32')).split(',').map((s) => Number(s.trim()));
/** ★1 つの秒につき何回止めるか。★3 回で「入り方に依らない」を見ます */
const TRIES = Number(arg('tries', 3));

const READY = "(()=>{const c=document.querySelector('canvas');if(!c)return false;"
  + "const x=c.getContext('2d');const d=x.getImageData(0,0,c.width,c.height).data;"
  + "let n=0;for(let i=0;i<d.length;i+=4000)if(d[i]>20)n++;return n>50;})()";

/** ★`from` 秒に一度寄せてから `sec` へ止める（★入り方を変える） */
const SEEK = (from, sec) => `(()=>{
  const el = document.querySelector('input[type=range]');
  if (!el) return 'no-slider';
  el.step = 'any';
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const fire = (v) => { set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); };
  fire(${from});
  fire(${sec});
  return el.value;
})()`;

const SHOT = "document.querySelector('canvas').toDataURL('image/png')";

/** ★2 枚の PNG（data URL）が何画素違うか。★同じなら 0 */
function differingPixels(a, b) {
  if (a === b) return 0;
  const ba = Buffer.from(a.split(',')[1], 'base64');
  const bb = Buffer.from(b.split(',')[1], 'base64');
  /**
   * ⚠️ ★PNG は圧縮済みなので、★バイト差は画素差ではありません。
   *   ★ここでは「一致したか」だけを厳密に見て、★違った場合は**バイト数の差**を目安に出します。
   */
  return ba.length === bb.length ? -1 : Math.abs(ba.length - bb.length);
}

const url = `${BASE}/race?badge=0&auditSec=${SECS[0]}&seed=${SEED}${RACE === '' ? '' : `&race=${RACE}`}${QUERY === '' ? '' : `&${QUERY}`}`;
console.log(`\n=== ★1 コマの安定性（台帳 B-2）===\n`);
console.log(`  ★${url}`);
console.log(`  ★1 つの秒につき ${TRIES} 回、★別の秒から入って止めます\n`);

const browser = await launch({ width: 1400, height: 900 });
let unstable = 0;
try {
  await browser.goto('about:blank', 'true', { timeoutMs: 20000, settleMs: 200 });
  if (!await browser.goto(url, READY, { timeoutMs: 180000, settleMs: 2000 })) {
    throw new Error(`★ページが用意できませんでした: ${url}`);
  }
  const sels = await browser.evaluate("(()=>JSON.stringify([...document.querySelectorAll('select')].map(s=>s.value)))()");
  console.log(`  ★画面の選択: ${sels}\n`);

  /** ★1 枚撮る。★`reload` なら手順どおりページを読み直してから */
  const shoot = async (sec, from, reload) => {
    if (reload) {
      const u = `${BASE}/race?badge=0&auditSec=${sec}&seed=${SEED}${RACE === '' ? '' : `&race=${RACE}`}${QUERY === '' ? '' : `&${QUERY}`}`;
      if (!await browser.goto(u, READY, { timeoutMs: 180000, settleMs: 2000 })) {
        throw new Error(`★ページが用意できませんでした: ${u}`);
      }
    }
    if (await browser.evaluate(SEEK(from, sec)) === 'no-slider') throw new Error('★シークバーが見つかりません');
    await new Promise((r) => { setTimeout(r, 450); });
    return String(await browser.evaluate(SHOT));
  };

  console.log('  秒    ★A 読み込み直して撮る（★合否はこちら）      ★B シークで寄せる');
  for (const sec of SECS) {
    /** ★A: 手順そのもの。★毎回読み込み直し、★入り方も `_realshot.mjs` と同じ */
    const a = [];
    for (let t = 0; t < TRIES; t += 1) a.push(await shoot(sec, sec + 0.37, true));
    const aSame = a.every((s) => s === a[0]);

    /** ★B: 1 回の読み込みのまま、★入り方を変えて寄せる */
    const approaches = [sec + 0.37, Math.max(0, sec - 4), sec + 6];
    const b = [];
    for (let t = 0; t < TRIES; t += 1) b.push(await shoot(sec, approaches[t % approaches.length], t === 0));
    const bSame = b.every((s) => s === b[0]);

    if (!aSame) unstable += 1;
    const fmt = (ok, arr) => (ok
      ? `★一致（${TRIES} 枚とも 1 バイトまで）`
      : `⚠️ ★変わる（${arr.map((s) => (s === arr[0] ? '=' : `≠${differingPixels(arr[0], s)}B`)).join(' ')}）`);
    console.log(`  ${String(sec).padStart(4)}s  ${(aSame ? '★安全 ' : '★使えない')} ${fmt(aSame, a).padEnd(34, ' ')}  ${bSame ? '一致' : '変わる'}`);
  }
} finally {
  await browser.close();
}

console.log('');
if (unstable > 0) {
  console.log(`⚠️ ★**${unstable} / ${SECS.length} の秒が測定に使えません。**`);
  console.log('   ★その秒はカットの境目（★閃光・重ねる・切り替え）の直後です。★別の秒で撮り直してください。');
} else {
  console.log(`★${SECS.length} 個の秒はすべて安定でした（★この鞍・この seed で）。`);
}
console.log('⚠️ ★安定は「この鞍・この seed で」です。★鞍を変えたら測り直してください（★境目は鞍ごとに違います）。');
