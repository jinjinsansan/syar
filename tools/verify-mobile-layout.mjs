/**
 * ★**全ページがモバイル幅で壊れていないか**を実ブラウザで測る（読取専用）
 *
 * 【★なぜ要るか】
 *   ★2026-08-31、オーナー指示:
 *     > ★**このアプリはモバイルアプリです。**★ブラウザ版も出しますが**基本的にはモバイルユーザー**です。
 *     > ★開発サーバーでレースページを駆使してきましたが ★**モバイル表示のことは考慮していません。**
 *   → ★まず ★**どこがどれだけ壊れているか**を数えます。★直すのはその後です。
 *
 * 【★何を測るか】★見た目の感想ではなく、★**3 つの数**だけを出します:
 *   ★① ★**横あふれ** … `documentElement.scrollWidth − innerWidth`。
 *        ★0 より大きい＝ ★**横スクロールが出る**（モバイルで最も致命的な壊れ方）。
 *        ★併せて ★**画面の右端をはみ出している要素**を、はみ出しの大きい順に出します。
 *   ★② ★**指で押せない大きさの操作要素** … `a / button / select / input` の短辺が **44px 未満**の数。
 *        ★44px は Apple の指針。★Material は 48dp。★**ここでは 44 で数えます**（緩いほう）。
 *   ★③ ★**小さすぎる文字** … 葉ノードの `font-size` の最小値。★モバイルの目安は 12px 以上。
 *
 * ⚠️ ★**合否は出しません。** ★どこまで許すかは正典・オーナーの判断です（D-065 の手順）。
 *    ★この道具は ★**測って報告する**までです。
 *
 * ⚠️ ★開発サーバーが要ります（★別の窓）: `cd apps/web ; npm run dev`
 * ⚠️ ★読むだけです。★製品コードにも DB にも触れません。
 *
 *   npx tsx tools/verify-mobile-layout.mjs
 *   npx tsx tools/verify-mobile-layout.mjs --widths 360,390,430 --path /race
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './lib/cdp.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3210';
const ONLY = arg('path', '');
/** ★360 = 小さめの Android ／ ★390 = iPhone 14 ／ ★430 = iPhone Pro Max */
const WIDTHS = String(arg('widths', '360,390')).split(',').map((s) => Number(s.trim()));

/**
 * ★調べるページ。★`apps/web/src/app` の `page.tsx` から引いた一覧です。
 * ⚠️ ★動的な経路（`[id]` / `[horseId]`）は ★**実在の id が要る**ので、ここでは開けません。
 *    ★開けなかったことを結果に出します（★黙って飛ばすと「全部通った」に見えます）。
 */
const PAGES = [
  ['/', '★TOP（未ログインの LP）'],
  ['/race', '★レース（キャンバス）'],
  ['/races', '★レース一覧'],
  ['/stable', '★厩舎'],
  ['/training', '★調教'],
  ['/entry', '★出走登録'],
  ['/records', '★戦績'],
  ['/prizes', '★賞金'],
  ['/watch', '★観戦'],
  ['/setup', '★初回セットアップ'],
  ['/login', '★ログイン'],
  ['/signup', '★新規登録'],
  ['/race-next', '★次走'],
  ['/course', '★コース（研究）'],
  ['/camera', '★カメラ（研究）'],
  ['/still', '★静止画（研究）'],
  ['/art-lab', '★素材（研究）'],
  ['/race-quality-lab', '★画質（研究）'],
  ['/race-world-lab', '★ワールド（研究）'],
];
/**
 * ★動的な経路。★`--rid` / `--hid` で実在の id を渡すと調べます。
 *   ★id は `/races` `/stable` の href から拾えます（★直書きしないこと）。
 */
const RID = arg('rid', '');
const HID = arg('hid', 'h1');
/** ★折り返した結果を目で見るための撮影（★out/_mobile/） */
const SHOTS = process.argv.includes('--shots');
const DYNAMIC = RID === '' ? [] : [
  [`/races/${RID}`, '★レース詳細'],
  [`/races/${RID}/bet`, '★投票'],
  [`/races/${RID}/odds`, '★オッズ'],
  [`/stable/${HID}`, '★馬の詳細'],
];

const READY = "(()=>document.readyState==='complete' && document.body && document.body.children.length>0)()";

const MEASURE = (REQW) => `(() => {
  /**
   * ⚠️ ★測るあいだだけ overflow-x のクリップを解きます。
   *   ★html に overflow-x: hidden が掛かっていると scrollWidth が頭打ちになり、
   *   ★はみ出しを 0 と報告します（★実際に 1 回それで騙されました）。
   *   ★測り終えたら元に戻します（★製品の CSS は変えません）。
   */
  const de0 = document.documentElement;
  /**
   * ⚠️⚠️ ★**幅は、何かを触る前に読みます。**
   *   ★最初は overflow-x を解いた**あと**に innerWidth を読んでいました。
   *   ★解いた瞬間に切り落とされていた内容が版面に戻り、★**その場でブラウザが縮めます。**
   *   → ★**道具が、自分で測っている対象を変えていました。**
   *     ★実測: /race は「解いてから読む」と 669px、★「読んでから解く」と **390px**。
   *     ★3 回とも 669 で再現したので機構だと思いましたが、★**再現したのは私の注入**でした。
   */
  const vw = window.innerWidth;
  const prevHtml = de0.style.overflowX;
  const prevBody = document.body.style.overflowX;
  de0.style.setProperty('overflow-x', 'visible', 'important');
  document.body.style.setProperty('overflow-x', 'visible', 'important');
  void de0.offsetWidth;
  const de = document.documentElement;
  const over = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const o = Math.round(r.right - vw);
    if (o > 1) {
      const cls = typeof el.className === 'string' ? el.className : '';
      over.push({ t: el.tagName.toLowerCase(), c: cls.slice(0, 28), w: Math.round(r.width), o });
    }
  }
  over.sort((a, b) => b.o - a.o);
  /**
   * ★はみ出した葉ノードを並べても直せません。★直す相手は ★**幅を作っている容器**です。
   *   ★自分の幅が画面より広い要素だけを、★外側から順に拾います。
   */
  const seen = new Map();
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right <= vw + 1) continue;
    const par = el.parentElement;
    if (!par) continue;
    const st = getComputedStyle(par);
    if (st.display !== 'flex' && st.display !== 'inline-flex' && st.display !== 'grid') continue;
    const cls = typeof par.className === 'string' ? par.className : '';
    const key = par.tagName + '|' + cls + '|' + st.display + '|' + st.flexWrap + '|' + st.gridTemplateColumns;
    const cur = seen.get(key) ?? {
      t: par.tagName.toLowerCase(), c: cls.slice(0, 26), disp: st.display,
      flex: st.flexWrap, grid: st.gridTemplateColumns.slice(0, 40),
      w: Math.round(par.getBoundingClientRect().width), n: 0,
    };
    cur.n += 1;
    seen.set(key, cur);
  }
  const wide = [...seen.values()].sort((a, b) => b.n - a.n);
  /**
   * ★ズームアウトしているときは「はみ出した要素」が 0 になります（★viewport が広がったので）。
   *   → ★**要求した幅より広い要素**そのものを、外側から順に出します。
   */
  const REQ = ${REQW};
  const fat = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width <= REQ + 1 || r.height === 0) continue;
    const cls = typeof el.className === 'string' ? el.className : '';
    const st = getComputedStyle(el);
    let depth = 0; for (let n = el; n && n !== document.body; n = n.parentElement) depth += 1;
    fat.push({ t: el.tagName.toLowerCase(), c: cls.slice(0, 24), w: Math.round(r.width), depth,
      mw: st.minWidth, fb: st.flexBasis, disp: st.display });
  }
  fat.sort((a, b) => a.depth - b.depth || b.w - a.w);
  let small = 0, smallest = 9999, taps = 0;
  for (const el of document.querySelectorAll('a,button,select,input,textarea,[role=button]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    taps += 1;
    const m = Math.min(r.width, r.height);
    if (m < 44) small += 1;
    if (m < smallest) smallest = Math.round(m);
  }
  let minFont = 99;
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length > 0) continue;
    if (!el.textContent || el.textContent.trim() === '') continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs > 0 && fs < minFont) minFont = fs;
  }
  /**
   * ⚠️ ★**「横あふれ 0」を鵜呑みにしないための 2 つ。**
   *   ★① overflow-x: hidden が親に掛かっていると、★はみ出しは**切り落とされて**
   *      scrollWidth に出ません。★スクロールが出ないぶん**もっと悪い**（読めない）。
   *   ★② だから ★**右端をはみ出した要素の数**を、scrollWidth とは別に数えます。
   */
  const clipped = [...document.querySelectorAll('html,body,main,header')]
    .filter((el) => ['hidden', 'clip'].includes(getComputedStyle(el).overflowX))
    .map((el) => el.tagName.toLowerCase());
  /**
   * ★**キャンバスが何倍に縮んで表示されるか**（★このアプリの本体）。
   *   ★HUD の文字はキャンバスに**焼かれている**ので、★縮めばそのまま読めなくなります（台帳 B-3）。
   */
  const canvases = [...document.querySelectorAll('canvas')].map((c) => {
    const r = c.getBoundingClientRect();
    return { iw: c.width, ih: c.height, dw: Math.round(r.width), scale: c.width > 0 ? Math.round((r.width / c.width) * 100) : null };
  });
  /** ★Next のエラー画面が出ていないか（★出ていたら測っても意味がありません） */
  const errored = document.body.innerText.includes('Unhandled Runtime Error')
    || document.body.innerText.includes('Application error')
    || document.title.includes('404');
  /**
   * ⚠️ ★**縦にも溢れます。**
   *   ★行に inline で height が指定されていると、★折り返して 2 行になった中身が
   *   ★箱から溢れ、★**下の行と重なって文字が二重に見えます**（★/entry で実測）。
   *   ★横だけ測っていて見落としました。★箱より中身が高い要素を数えます。
   */
  const tall = [];
  for (const el of document.querySelectorAll('body *')) {
    const st = getComputedStyle(el);
    if (st.overflowY !== 'visible' || st.position === 'absolute' || st.position === 'fixed') continue;
    if (el.scrollHeight <= el.clientHeight + 8) continue;   /* ★4px 程度は行間の丸め。★重なりとして見えるのは 8px 以上 */
    if (el.clientHeight === 0) continue;
    const cls = typeof el.className === 'string' ? el.className : '';
    tall.push({ t: el.tagName.toLowerCase(), c: cls.slice(0, 22), h: el.clientHeight, sh: el.scrollHeight, disp: st.display });
  }
  tall.sort((a, b) => (b.sh - b.h) - (a.sh - a.h));
  const swTrue = Math.max(de.scrollWidth, document.body.scrollWidth);
  de0.style.overflowX = prevHtml;
  document.body.style.overflowX = prevBody;
  return JSON.stringify({
    vw, sw: swTrue, overflow: swTrue - vw,
    over: over.slice(0, 3), overCount: over.length, wide: wide.slice(0, 5), wideCount: wide.length, fat: fat.slice(0, 4), fatCount: fat.length, tall: tall.slice(0, 3), tallCount: tall.length, clipped, canvases,
    small, taps, smallest: smallest === 9999 ? null : smallest,
    minFont: minFont === 99 ? null : Math.round(minFont * 10) / 10,
    errored, text: document.body.innerText.trim().length,
  });
})()`;

const pages = (ONLY === '' ? [...PAGES, ...DYNAMIC] : [...PAGES, ...DYNAMIC].filter(([p]) => p === ONLY));

console.log('\n=== ★モバイル幅での崩れ（実ブラウザ・読取専用）===\n');
console.log(`  ★${BASE} / ★幅 ${WIDTHS.join(', ')}px`);
console.log('  ★横あふれ = documentElement.scrollWidth − innerWidth（★0 より大きい＝横スクロールが出る）\n');

const browser = await launch({ width: 500, height: 900 });
const rows = [];
try {
  await browser.goto('about:blank', 'true', { timeoutMs: 20000, settleMs: 200 });
  for (const [path, label] of pages) {
    for (const w of WIDTHS) {
      /**
       * ⚠️⚠️ ★**幅を決めてから開きます。**
       *   ★最初は「開いてから縮める」順でした。★実機は**最初からその幅で開く**ので、別物です。
       *   ★ブラウザの「収まらないから全体を縮める」判断は ★**最初の組版で決まり、あとで戻りません。**
       *   → ★順序で答えが変わります。★実機に合わせるなら**先に幅**です。
       */
      await browser.send('Emulation.setDeviceMetricsOverride', {
        width: w, height: 844, deviceScaleFactor: 2, mobile: true,
        screenWidth: w, screenHeight: 844, positionX: 0, positionY: 0, dontSetVisibleSize: false,
      });
      const ok = await browser.goto(`${BASE}${path}`, READY, { timeoutMs: 60000, settleMs: 1200 });
      if (!ok) { rows.push({ path, label, w, failed: '★開けませんでした' }); continue; }
      await new Promise((r) => { setTimeout(r, 700); });
      let m;
      try { m = JSON.parse(String(await browser.evaluate(MEASURE(w)))); } catch (e) { m = { error: String(e).slice(0, 60) }; }
      /**
       * ⚠️⚠️ ★**要求した幅で測れているかを必ず確かめます。**
       *   ★モバイルでは、内容が収まらないとブラウザが ★**ページ全体をズームアウト**します。
       *   ★すると `innerWidth` が要求した幅より**大きく**なり、★はみ出しが消えて見えます。
       *   ★実測: `/setup` は 390px を要求して ★**465px** で測れていました（★「あふれ 0」と誤報）。
       *   → ★これは「収まっている」ではなく ★**「収まらないので縮められた」**です。
       */
      m.zoomedOut = typeof m.vw === 'number' && m.vw > w + 1 ? m.vw - w : 0;
      rows.push({ path, label, w, ...m });
      /**
       * ★**数だけでは足りません。** ★折り返した結果が読める並びかどうかは目で見る話です。
       *   ★`--shots` を付けると、★ページ全体（★画面の外まで）を 1 枚に撮ります。
       */
      if (SHOTS) {
        const png = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        const name = `${path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'top'}-${w}.png`;
        mkdirSync('out/_mobile', { recursive: true });
        writeFileSync(`out/_mobile/${name}`, Buffer.from(png.data, 'base64'));
      }
    }
    await browser.send('Emulation.clearDeviceMetricsOverride');
  }
} finally {
  await browser.close();
}

// ---------------------------------------------------------------- 出力

console.log('  ページ                        幅    ★横あふれ  ★44px 未満の操作  ★最小文字  中身');
let broken = 0, checked = 0;
for (const r of rows) {
  if (r.failed !== undefined) { console.log(`  ${r.path.padEnd(22, ' ')} ${'—'.padStart(6)}  ${r.failed}`); continue; }
  if (r.error !== undefined) { console.log(`  ${r.path.padEnd(22, ' ')} ${String(r.w).padStart(5)}  ⚠️ ${r.error}`); continue; }
  checked += 1;
  /** ★はみ出しは「スクロールが出た」だけでなく「★切り落とされた」も数える */
  const hurts = r.overflow > 1 || r.overCount > 0 || r.zoomedOut > 0 || (r.tallCount ?? 0) > 0;
  if (hurts) broken += 1;
  const flag = r.zoomedOut > 0
    ? `★ズーム${r.vw}px`
    : (r.overflow > 1 ? `★+${r.overflow}px` : (r.overCount > 0 ? '★切落し' : 'なし'));
  const canv = r.canvases.length === 0 ? '—' : r.canvases.map((c) => `${c.iw}→${c.dw}px ★${c.scale}%`).join(' ');
  console.log(
    `  ${r.path.padEnd(20, ' ')} ${String(r.w).padStart(4)}  ${flag.padStart(8)}`
    + `  ${String(`${r.small}/${r.taps}`).padStart(7)}`
    + `  ${String(r.minFont ?? '—').padStart(5)}`
    + `  ${canv}`+ `   [vw ${r.vw} / sw ${r.sw}]`,
  );
  if (r.zoomedOut > 0) {
    console.log(`  ${' '.repeat(20)}       ↳ ⚠️ ★${r.w}px を要求したのに ★${r.vw}px で描かれました`
      + `＝ ★内容が収まらず、ブラウザがページ全体を ★${Math.round((r.w / r.vw) * 100)}% に縮めています`);
    for (const f of (r.fat ?? [])) {
      console.log(`  ${' '.repeat(20)}         ★幅 ${f.w}px  <${f.t}${f.c === '' ? '' : ` class="${f.c}"`}>`
        + `  display:${f.disp}${f.mw === '0px' || f.mw === 'auto' ? '' : ` min-width:${f.mw}`}`
        + `${f.fb === 'auto' ? '' : ` flex-basis:${f.fb}`}`);
    }
  }
  if ((r.tallCount ?? 0) > 0) {
    console.log(`  ${' '.repeat(20)}       ↳ ⚠️ ★中身が箱より高い要素 ${r.tallCount} 個（★行が重なって文字が二重に見えます）`);
    for (const t of r.tall) {
      console.log(`  ${' '.repeat(20)}         <${t.t}${t.c === '' ? '' : ` class="${t.c}"`}> 箱 ${t.h}px / 中身 ${t.sh}px  ★+${t.sh - t.h}px`);
    }
  }
  if (r.overCount > 0) {
    for (const o of (r.wide ?? [])) {
      console.log(`  ${' '.repeat(20)}       ↳ ★子 ${o.n} 個が外へ  <${o.t}${o.c === '' ? '' : ` class="${o.c}"`}> 幅${o.w}px`
        + `  display:${o.disp}${o.disp === 'grid' ? ` cols:${o.grid}` : ` wrap:${o.flex}`}`);
    }
    if ((r.wideCount ?? 0) > 5) console.log(`  ${' '.repeat(20)}       ↳ ★はみ出させている親は全部で ${r.wideCount} 種類`);
    console.log(`  ${' '.repeat(20)}       ↳ ★はみ出した要素 ${r.overCount} 個${r.clipped.length > 0 ? ` / ⚠️ ★overflow-x を隠しているのは <${r.clipped.join('> <')}>（★切り落とされます）` : ''}`);
  }
}

console.log('');
console.log(`★横あふれが出た組み合わせ: ★**${broken} / ${checked}**`);
if (DYNAMIC.length === 0) console.log('⚠️ ★動的な経路 4 本（レース詳細 / 投票 / オッズ / 馬の詳細）は調べていません。★--rid <id> で実在の id を渡してください');
console.log('⚠️ ★合否は出しません（★どこまで許すかは正典・オーナーの判断）。★この道具は測るだけです。');
