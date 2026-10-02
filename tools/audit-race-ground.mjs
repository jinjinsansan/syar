/**
 * ★**芝とカメラの監査**（★2026-10-02・オーナー「芝・ダートが 逆回転・超高速になる」「最後の直線で カメラがどんどん離れていく」
 *   「完璧に仕上げたい・そうでないとリリースできない」）。
 *
 *   `/race?audit=ground&...` を 画面の裏で開き、★時計を 1/60 秒ずつ 仮想で進めた ★全コマの記録（`noteAuditGround`）を読んで、
 *   ★**画面に描いた芝**の見かけの速さと ★カメラの離れ方を 場面ごとに調べる。★実機のコマ落ちに左右されない（決定論）。
 *
 *   ★見つけるもの（★同じ場面の中のコマだけ）:
 *     逆回転   … 芝が 走る向きと逆に動く（★見かけの速さ < -0.5 m/秒）
 *     超高速   … 芝が 本当の速さの 1.6 倍を超える
 *     超スロー … 芝が 本当の速さの 0.4 倍を下回る（★馬が走っているのに芝が止まって見える）
 *     急変     … 1 コマで 見かけの速さが 50% かつ 5 m/秒 を超えて変わる
 *     離れる   … 直線の場面で ★馬の大きさが 場面の始めから 40% 以上 縮む
 *
 * 実行: node tools/audit-race-ground.mjs [--base http://localhost:3210] [--query "seed=7&venue=..."] [--out out/gen/audit/x.json]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { launch } from './lib/cdp.mjs';

const arg = (name, def) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; };
const base = arg('--base', 'http://localhost:3210');
const query = arg('--query', '');
const out = arg('--out', 'out/gen/audit/ground.json');
const port = Number(arg('--port', '9460'));
const url = `${base}/race?audit=ground${query === '' ? '' : `&${query}`}`;

const b = await launch({ width: Number(arg('--w', '640')), height: Number(arg('--h', '360')), port });
const errors = [];
b.on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
await b.send('Runtime.enable');
await b.send('Page.enable');
await b.send('Page.navigate', { url });
const t0 = Date.now();
let data = null, lastP = -1;
while (Date.now() - t0 < 30 * 60 * 1000) {
  await new Promise((r) => setTimeout(r, 2000));
  data = await b.evaluate('globalThis.__raceAuditGround ?? null').catch(() => null);
  if (data !== null) break;
  const p = await b.evaluate('globalThis.__raceAuditProgress ?? null').catch(() => null);
  if (p !== null && Math.floor(p * 10) !== lastP) { lastP = Math.floor(p * 10); process.stderr.write(`  ${Math.round(p * 100)}%`); }
  if (errors.length > 0 && Date.now() - t0 > 60000 && p === null) break;
}
await b.close();
if (data === null) { console.error(`\n★記録が取れませんでした ${url}\n${errors.slice(0, 3).join('\n')}`); process.exit(1); }
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ url, ...data }));

/** ★集計は 画面の `race-audit.ts`（★1 か所）。★ここは 読んで出すだけ */
const { shots, findings } = data.summary;
writeFileSync(out.replace(/\.json$/, '.summary.json'), JSON.stringify({ url, shots, findings }, null, 1));
console.log(`
${url}`);
console.log('場面                         秒        芝/本当(10%/中央/90%)  馬の大きさ 始→終(最小)  カメラ距離');
for (const s of shots) console.log(`${(s.persp ? '透 ' : '板 ') + s.shot.padEnd(26)} ${String(s.from).padStart(6)}〜${String(s.to).padEnd(6)} ${String(s.ratioP10).padStart(5)} ${String(s.ratioMed).padStart(5)} ${String(s.ratioP90).padStart(5)}   ${s.horseStart}→${s.horseEnd}(${s.horseMin})  ${s.camStart}→${s.camEnd}m`);
console.log(`
★見つけたもの ${findings.length} 件`);
for (const g of findings) console.log(`  ${g.kind} レース ${g.raceSec}〜${g.raceSecTo}秒（${g.frames} コマ） ${g.persp ? '透' : '板'} ${g.shot}: ${g.detail}`);
