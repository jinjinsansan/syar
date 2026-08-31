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
const DYNAMIC = RID === '' ? [] : [
  [`/races/${RID}`, '★レース詳細'],
  [`/races/${RID}/bet`, '★投票'],
  [`/races/${RID}/odds`, '★オッズ'],
  [`/stable/${HID}`, '★馬の詳細'],
];

const READY = "(()=>document.readyState==='complete' && document.body && document.body.children.length>0)()";

const MEASURE = `(() => {
  const vw = window.innerWidth;
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
  return JSON.stringify({
    vw, sw: de.scrollWidth, overflow: de.scrollWidth - vw,
    over: over.slice(0, 3), overCount: over.length, clipped, canvases,
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
    const ok = await browser.goto(`${BASE}${path}`, READY, { timeoutMs: 60000, settleMs: 1200 });
    if (!ok) { rows.push({ path, label, failed: '★開けませんでした' }); continue; }
    for (const w of WIDTHS) {
      await browser.send('Emulation.setDeviceMetricsOverride', {
        width: w, height: 844, deviceScaleFactor: 2, mobile: true,
      });
      await new Promise((r) => { setTimeout(r, 700); });
      let m;
      try { m = JSON.parse(String(await browser.evaluate(MEASURE))); } catch (e) { m = { error: String(e).slice(0, 60) }; }
      rows.push({ path, label, w, ...m });
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
  const hurts = r.overflow > 1 || r.overCount > 0;
  if (hurts) broken += 1;
  const flag = r.overflow > 1 ? `★+${r.overflow}px` : (r.overCount > 0 ? '★切落し' : 'なし');
  const canv = r.canvases.length === 0 ? '—' : r.canvases.map((c) => `${c.iw}→${c.dw}px ★${c.scale}%`).join(' ');
  console.log(
    `  ${r.path.padEnd(20, ' ')} ${String(r.w).padStart(4)}  ${flag.padStart(8)}`
    + `  ${String(`${r.small}/${r.taps}`).padStart(7)}`
    + `  ${String(r.minFont ?? '—').padStart(5)}`
    + `  ${canv}`,
  );
  if (r.overCount > 0) {
    for (const o of r.over) console.log(`  ${' '.repeat(20)}       ↳ ★+${o.o}px  <${o.t}${o.c === '' ? '' : ` class="${o.c}"`}> 幅 ${o.w}px`);
    console.log(`  ${' '.repeat(20)}       ↳ ★はみ出した要素 ${r.overCount} 個${r.clipped.length > 0 ? ` / ⚠️ ★overflow-x を隠しているのは <${r.clipped.join('> <')}>（★切り落とされます）` : ''}`);
  }
}

console.log('');
console.log(`★横あふれが出た組み合わせ: ★**${broken} / ${checked}**`);
if (DYNAMIC.length === 0) console.log('⚠️ ★動的な経路 4 本（レース詳細 / 投票 / オッズ / 馬の詳細）は調べていません。★--rid <id> で実在の id を渡してください');
console.log('⚠️ ★合否は出しません（★どこまで許すかは正典・オーナーの判断）。★この道具は測るだけです。');
