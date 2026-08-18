// STAR レース中継 HUD のデザインシステム（Claude Design 用プレビュー）を生成する
//   node design/hud-ds/build.mjs  → design/hud-ds/{tokens,components}/**/index.html
// 描画の本体は packages/render/src/oblique-ui.ts（Canvas）。ここは見た目の合意用モック。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const T = `:root{--gold:#fad728;--paper:#f6f2e7;--paper-2:#efe9dc;--ink:#22201c;--panel:rgba(4,8,6,.76);--band:rgba(3,7,5,.82);--board:rgba(6,10,8,.86);--line:rgba(236,232,211,.4);--turf:#6b9152;--pink:#c81e78;--f1:#f5f5f5;--f2:#191919;--f3:#d62828;--f4:#1446b4;--f5:#fad728;--f6:#148c46;--f7:#f08219;--f8:#f596be;--font:system-ui,-apple-system,"Segoe UI","Hiragino Sans","Noto Sans JP",sans-serif}
*{box-sizing:border-box}body{margin:0;font-family:var(--font);color:var(--paper)}
.stage{position:relative;background:linear-gradient(#5f8f45,#4c7a3a);overflow:hidden}
.frame{display:inline-block;width:24px;height:20px;line-height:20px;text-align:center;font-weight:700;font-size:13px;border-radius:2px}
.frame.f1{background:var(--f1);color:#111}.frame.f2{background:var(--f2)}.frame.f3{background:var(--f3)}.frame.f4{background:var(--f4)}.frame.f5{background:var(--f5);color:#111}.frame.f6{background:var(--f6)}.frame.f7{background:var(--f7)}.frame.f8{background:var(--f8);color:#111}`;

const page = (group, title, body, w, h) => `<!-- @dsCard group="${group}" -->
<title>${title}</title>
<style>${T}</style>
<div class="stage" style="width:${w}px;height:${h}px">${body}</div>
`;
const out = (rel, s) => {
  const p = join(HERE, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, s);
};

out('tokens/index.html', `<!-- @dsCard group="Tokens" -->
<title>Tokens</title>
<style>${T}.sw{display:inline-block;width:64px;height:40px;margin:4px;border:1px solid var(--line)}.row{display:flex;flex-wrap:wrap;align-items:center;padding:8px}.k{font-size:11px;color:#333;width:72px}</style>
<div style="background:#14120f;padding:12px;width:720px">
<h3 style="margin:0 0 8px;color:var(--gold)">STAR レース中継 HUD — Tokens</h3>
<div class="row" style="background:#fff;color:#111"><span class="k">gold</span><span class="sw" style="background:#fad728"></span><span class="k">paper</span><span class="sw" style="background:#f6f2e7"></span><span class="k">panel</span><span class="sw" style="background:rgba(4,8,6,.76)"></span><span class="k">turf</span><span class="sw" style="background:#6b9152"></span><span class="k">v2 badge</span><span class="sw" style="background:#c81e78"></span></div>
<div class="row" style="background:#fff;color:#111"><span class="k">枠色 1〜8</span><span class="frame f1">1</span><span class="frame f2">2</span><span class="frame f3">3</span><span class="frame f4">4</span><span class="frame f5">5</span><span class="frame f6">6</span><span class="frame f7">7</span><span class="frame f8">8</span></div>
<p style="font-size:12px;color:var(--paper-2)">画面は 1280×720 の Canvas。文字はシステム UI フォント（bold）。パネルは半透明の暗色に金の細線／左縁のアクセント。</p></div>
`);

out('components/section-tag/index.html', page('HUD', '区間タグ',
  `<div style="position:absolute;left:24px;top:22px;width:250px;height:46px;background:var(--panel)"><div style="position:absolute;left:0;top:0;width:6px;height:46px;background:var(--gold)"></div><div style="position:absolute;left:24px;top:12px;font:700 20px var(--font)">第3コーナー</div></div>`, 320, 90));

const standingRows = [['1', '3', 'f3', '★'], ['2', '11', 'f3', '0.7馬身'], ['3', '7', 'f7', '1.2馬身'], ['4', '8', 'f8', '3.1馬身'], ['5', '12', 'f4', '3.9馬身']];
out('components/standings/index.html', page('HUD', '順位パネル（上位5頭）',
  `<div style="position:absolute;right:24px;top:24px;width:166px;background:rgba(22,20,17,.86);padding:8px 10px;font-size:13px">${standingRows.map(([p, g, c, m]) => `<div style="display:flex;align-items:center;gap:8px;height:22px"><b style="width:12px">${p}</b><span class="frame ${c}">${g}</span><span style="opacity:.85">${m}</span></div>`).join('')}</div>`, 220, 150));

out('components/call-band/index.html', page('HUD', '実況帯',
  `<div style="position:absolute;left:0;bottom:0;width:1280px;height:112px;background:var(--band)"><div style="height:3px;background:var(--gold)"></div><div style="position:absolute;left:18px;bottom:0;width:104px;height:104px;background:#3a4a3f;border-radius:4px 4px 0 0"></div><div style="position:absolute;left:150px;top:26px;font-size:14px;line-height:1.7"><div><span style="color:#ff6a6a;font-weight:700">3番</span> が先頭。　★第3コーナー</div><div><span style="color:#ff6a6a;font-weight:700">3番</span> は前と0.5馬身、詰めています</div><div style="opacity:.6">（自馬）　余力 ▮▮▮▮▯　減り方 ▂▄▆</div></div></div>`, 1280, 130));

out('components/winner-lower-third/index.html', page('HUD', '勝馬テロップ',
  `<div style="position:absolute;left:0;bottom:0;width:1280px;height:150px;background:rgba(3,7,5,.9)"><div style="height:4px;background:var(--gold)"></div><div style="position:absolute;left:48px;top:20px;color:var(--gold);font:700 22px var(--font)">1着　10番</div><div style="position:absolute;left:48px;top:58px;font:700 34px var(--font)">アオバハヤテ</div><div style="position:absolute;left:48px;top:104px;font-size:20px">騎手　吉田 直樹</div><div style="position:absolute;right:48px;top:66px;font:700 22px var(--font)">99.9秒</div></div>`, 1280, 160));

const resultRows = [['1', '10', 'f2', 'アオバハヤテ', '吉田 直樹', '99.9秒', ''], ['2', '4', 'f4', 'ミライノツバサ', '中村 駿', '100.4秒', '2馬身'], ['3', '2', 'f2', 'サクラブリーズ', '佐藤 翼', '101.0秒', '2馬身'], ['4', '5', 'f5', 'グリーンアロー', '高橋 蓮', '101.0秒', 'アタマ'], ['5', '6', 'f6', 'オウカノキセキ', '松本 拓海', '101.1秒', '1/2馬身']];
out('components/results-board/index.html', page('HUD', '着順ボード',
  `<div style="position:absolute;left:230px;top:40px;width:820px;background:var(--board);border:1px solid var(--line);border-top:4px solid var(--gold);padding:12px 24px 16px"><div style="color:var(--gold);font:700 15px var(--font)">スターパーク競馬場　11R　芝1600m</div><div style="font:700 26px var(--font);margin-top:4px">桜星賞　確定</div><div style="border-top:1px solid rgba(236,232,211,.25);margin:10px 0 6px"></div>${resultRows.map(([p, g, c, n, j, t, m], i) => `<div style="display:flex;align-items:center;height:36px;gap:14px;${i % 2 ? '' : 'background:rgba(255,255,255,.04)'}"><b style="width:28px;text-align:right;color:${i === 0 ? 'var(--gold)' : 'inherit'};font-size:${i === 0 ? 20 : 17}px">${p}</b><span class="frame ${c}" style="width:26px;height:22px;line-height:22px">${g}</span><span style="width:220px;font-size:18px;font-weight:${i === 0 ? 700 : 400}">${n}</span><span style="width:160px;font-size:15px;opacity:.85">${j}</span><span style="flex:1;text-align:right;font:700 16px var(--font)">${t}</span><span style="width:90px;text-align:right;font-size:15px;opacity:.75">${m}</span></div>`).join('')}<div style="opacity:.5;font-size:12px;margin-top:6px">…（12 頭分）</div></div>`, 1280, 420));

out('components/minimap/index.html', page('HUD', 'コース図ミニマップ',
  `<div style="position:absolute;left:24px;top:112px;width:190px;height:112px;background:rgba(5,10,8,.62);border:1px solid rgba(236,232,211,.35)"><div style="position:absolute;left:6px;top:2px;font:700 10px var(--font);opacity:.85">コース</div><svg width="190" height="112" style="position:absolute;left:0;top:0"><path d="M30 30 H150 A26 26 0 0 1 150 82 H30" fill="none" stroke="#5f8f45" stroke-width="12"/><path d="M30 30 H150 A26 26 0 0 1 150 82 H30" fill="none" stroke="rgba(240,240,236,.8)" stroke-width="1"/><line x1="30" y1="22" x2="30" y2="38" stroke="#fff" stroke-width="2"/><line x1="30" y1="74" x2="30" y2="90" stroke="#fad728" stroke-width="2"/><circle cx="96" cy="30" r="2.6" fill="#d62828"/><circle cx="102" cy="30" r="2.6" fill="#1446b4"/><circle cx="108" cy="30" r="2.6" fill="#f08219"/><circle cx="90" cy="30" r="4.2" fill="none" stroke="#fff" stroke-width="1.5"/><polygon points="98,20 93,30 103,30" fill="rgba(200,30,120,.95)"/></svg></div>`, 240, 240));

out('components/title-card/index.html', page('Screens', 'レース名タイトル',
  `<div style="position:absolute;inset:0;background:linear-gradient(#7d94a8,#3f5a3a)"></div><div style="position:absolute;left:64px;top:110px;width:720px;height:420px;background:rgba(6,10,8,.72);border:1px solid var(--line);border-left:6px solid var(--gold);padding:36px 40px"><div style="font:700 22px var(--font);color:var(--paper-2)">スターパーク競馬場　11R</div><div style="font:700 64px var(--font);margin-top:12px">桜星賞</div><div style="height:3px;background:var(--gold);width:560px;margin:14px 0 22px"></div><div style="font:700 26px var(--font)">芝 1600m　左回り</div><div style="font-size:20px;margin-top:14px;opacity:.9">天候 晴　　馬場 良</div><div style="font-size:14px;margin-top:40px;letter-spacing:.1em;opacity:.7">GRADE I ・ TURF CHAMPIONSHIP</div></div>`, 1280, 720));

out('README.md', `# STAR レース中継 HUD デザインシステム

\`node design/hud-ds/build.mjs\` で Claude Design 用のプレビュー（HTML）を生成し、DesignSync で同期する。
描画の本体は \`packages/render/src/oblique-ui.ts\`（Canvas）。ここは見た目の合意用のモックで、変更は Canvas 実装へ反映する。
`);
console.log('built');
