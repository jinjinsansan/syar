/**
 * ★**勝ち上がりの流量を測る**（CL-7）— 指示書 `DEV_INSTRUCTIONS_RACE_CLASS_20260918.md`
 *
 * 【★何を測るか】
 *   ① ★**各クラスの「出走可能な馬の数」** と ★**「1 日の枠数 × 平均頭数」**の比（★枠が余るのか、溢れるのか）
 *   ② ★**新馬戦から 1 勝クラスへ上がる頭数／日**と、1 勝クラスが受けられる数
 *   ③ ★**上のクラスほど馬が減るはず** — ★減りすぎて枠が埋まらないクラスが無いか
 *   ④ 🔴 ★**オープン 50 ＋ 重賞 30 ＝ 80 本/日 を 4 勝以上の馬が埋められるか**
 *      （★裁定 `REVIEW_RACE_CLASS_1_VERDICT_20260918.md`。★埋まらなければ「重賞＝オープン馬」の読みが成立しません）
 *
 * 【★この道具は DB に触りません（読むだけ）】R-24: readonly。★`--env` は必須です。
 *
 * 【★値の良し悪しは判定しません】★較正の話なので、★**測って報告するだけ**です（CL-7 の指示どおり）。
 *
 * 実行: npx tsx tools/measure-class-flow.mjs --env staging
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';
import {
  CAREER_RACE_LIMIT, LIFECYCLE_WEEKS, RACES_BY_CLASS, RACES_PER_DAY, WEEKS_PER_DAY,
  raceClassOfWins, winsRangeFor,
} from '@star/scheduler';

/** ★出走表の平均頭数（★`race-field.ts` の註記と同じ「平均13頭立て」） */
const AVG_FIELD = 13;
/** ★クラスの並び（★下から上へ。★表示の順） */
const CLASSES = ['maiden', 'win1', 'win2', 'win3', 'open', 'graded'];
const LABEL = {
  maiden: '新馬・未勝利', win1: '1勝クラス', win2: '2勝クラス',
  win3: '3勝クラス', open: 'オープン', graded: '重賞',
};

const env = loadEnv();
const client = new pg.Client({ connectionString: env.DATABASE_URL });
await client.connect();
try {
  const envRow = await client.query('select environment from app_environment limit 1');
  console.log(`接続先: ${env.file}（DB の申告: ${envRow.rows[0]?.environment ?? '不明'}）`);

  // ★ワーカーが出走表を作るときに読むプールと**同じ SQL**（`horse-repo.ts` の `loadRaceablePool`）
  const poolRes = await client.query(
    `select id from horses where generation >= (select max(generation) - 2 from horses) order by id limit 3000`,
  );
  const poolIds = poolRes.rows.map((r) => r.id);
  // ★勝利数（★確定した 1 着だけ。`finish_pos` は確定時にしか書かれない）
  const winsRes = await client.query(
    `select horse_id, count(*)::int as wins from race_entries where finish_pos = 1 group by horse_id`,
  );
  const winsByHorse = new Map(winsRes.rows.map((r) => [r.horse_id, r.wins]));
  // ★出走の有無（★初期馬の候補は「未出走」に狭めた・CL-5'）
  const ranRes = await client.query(
    `select distinct horse_id from race_entries where finish_pos is not null`,
  );
  const hasRun = new Set(ranRes.rows.map((r) => r.horse_id));

  const byClass = new Map(CLASSES.map((c) => [c, 0]));
  let unraced = 0;
  for (const id of poolIds) {
    const w = winsByHorse.get(id) ?? 0;
    byClass.set(raceClassOfWins(w), (byClass.get(raceClassOfWins(w)) ?? 0) + 1);
    if (!hasRun.has(id)) unraced += 1;
  }

  console.log('');
  console.log(`# CL-7 勝ち上がりの流量  （出走可能な馬 ${poolIds.length} 頭 ／ 1 日 ${RACES_PER_DAY} R）`);
  console.log(`  ★出走可能な馬は loadRaceablePool と同じ SQL で数えています（generation >= max-2・上限 3,000）`);
  console.log('');
  console.log(
    `  ${'クラス'.padEnd(14)}${'資格のある馬'.padStart(12)}${'枠/日'.padStart(8)}${'延べ出走/日'.padStart(12)}` +
      `${'1頭あたり/日'.padStart(13)}${'判定の材料'.padStart(12)}`,
  );

  for (const c of CLASSES) {
    const races = RACES_BY_CLASS[c] ?? 0;
    const need = races * AVG_FIELD;
    // ★重賞はオープン馬から出る（★開発側の解釈・裁定で採用）。★資格のある馬は open と同じ
    const eligible = c === 'graded' ? (byClass.get('open') ?? 0) : (byClass.get(c) ?? 0);
    const perHorse = eligible > 0 ? need / eligible : Infinity;
    const note = eligible === 0 ? '🔴 0 頭' : perHorse > 2 ? '🔴 足りない' : perHorse < 0.2 ? '余っている' : '';
    console.log(
      `  ${LABEL[c].padEnd(14)}${String(eligible).padStart(12)}${String(races).padStart(8)}${String(need).padStart(12)}` +
        `${(eligible > 0 ? perHorse.toFixed(2) : '—').padStart(13)}${note.padStart(12)}`,
    );
  }

  console.log('');
  console.log('  ★読み方: 「1頭あたり/日」＝ その馬が 1 日に走らされる回数の期待値。');
  console.log('    ★1.0 を大きく超えると、同じ馬が 1 日に何度も出ることになります（★枠が余っている＝馬が足りない）。');
  console.log('    ★0 に近いほど、枠に入れない馬が多い（★馬が余っている）。');
  console.log('');

  // ── ② 勝ち上がりの流れ（★1 日に何頭が上の段へ動くか）─────────────────
  const maidenRaces = RACES_BY_CLASS.maiden ?? 0;
  const win1Races = RACES_BY_CLASS.win1 ?? 0;
  console.log('  ★② 勝ち上がりの流れ（★1 レースに 1 着は 1 頭）');
  console.log(`    新馬・未勝利 ${maidenRaces} 本/日 → ★**1 日 ${maidenRaces} 頭**が 1 勝クラスへ上がる`);
  console.log(`    1 勝クラスが受けられる延べ出走 = ${win1Races} 本 × ${AVG_FIELD} 頭 = ${win1Races * AVG_FIELD}`);
  console.log(`    → ★上がってくる頭数に対する枠の余裕: ${((win1Races * AVG_FIELD) / Math.max(1, maidenRaces)).toFixed(1)} 倍`);
  console.log('');

  // ── ④ オープン＋重賞の 80 本/日（★裁定が必ず測れと指示）────────────────
  const openRaces = (RACES_BY_CLASS.open ?? 0) + (RACES_BY_CLASS.graded ?? 0);
  const openHorses = byClass.get('open') ?? 0;
  const openNeed = openRaces * AVG_FIELD;
  console.log('  🔴 ★④ オープン ＋ 重賞（★裁定: この読みが成立するかの判定材料）');
  console.log(`    枠 ${openRaces} 本/日 × ${AVG_FIELD} 頭 = 延べ ${openNeed} 出走/日`);
  console.log(`    4 勝以上の馬: ★**${openHorses} 頭**`);
  console.log(
    `    → 1 頭あたり ${openHorses > 0 ? (openNeed / openHorses).toFixed(2) : '—'} 回/日` +
      `${openHorses === 0 ? '  🔴 ★埋められません（★「重賞＝オープン馬」の読みが成立しません）' : ''}`,
  );
  console.log('');
  // ── ★CF-1: 定常状態が存在するか（★裁定 REVIEW_RACE_CLASS_FLOW_VERDICT_20260918）──
  //    ⚠️ ★数字は**写さず、コードの定数から独立に**計算します（R-13）。
  const fieldRes = await client.query(
    `select avg(n)::float8 as avg_field, count(*)::int as races from (
       select race_id, count(*)::int as n from race_entries
        where finish_pos is not null group by race_id
     ) t`,
  );
  const measuredField = fieldRes.rows[0]?.avg_field ?? null;
  const settledRaces = fieldRes.rows[0]?.races ?? 0;
  const aliveRes = await client.query(
    `select count(*)::int n from horses
      where generation >= (select max(generation) - 2 from horses) and retired_at_week is null`,
  );
  const alive = aliveRes.rows[0]?.n ?? 0;

  /** ★現役の週数（★正典 §7.1・862 行「104〜260週が現役期間」＝ コードの LIFECYCLE_WEEKS） */
  const racingWeeks = LIFECYCLE_WEEKS.retireAt - LIFECYCLE_WEEKS.raceableFrom;
  const field = measuredField ?? AVG_FIELD;

  console.log('');
  console.log('  ★CF-1 定常状態が存在するか（★回す前に出す・裁定の条件）');
  console.log(
    `    平均頭数: ${measuredField === null ? `${AVG_FIELD}（★実測なし・既定）` : `${measuredField.toFixed(2)}（★確定した ${settledRaces} レースの実測）`}`,
  );
  for (const [label, weeks] of [
    [`正典 §7.1（${LIFECYCLE_WEEKS.raceableFrom}〜${LIFECYCLE_WEEKS.retireAt}週＝${racingWeeks}週）`, racingWeeks],
    ['D-007 改訂の文（現役 90 週）', 90],
  ]) {
    const k = (CAREER_RACE_LIMIT / weeks) * WEEKS_PER_DAY;
    let total = 0;
    const parts = [];
    for (const c of ['maiden', 'win1', 'win2', 'win3', 'open', 'graded']) {
      const n = ((RACES_BY_CLASS[c] ?? 0) * field) / k;
      total += n;
      if (c !== 'graded') parts.push(`${LABEL[c]} ${Math.round(n)}`);
    }
    const margin = ((alive - total) / Math.max(1, alive)) * 100;
    console.log(
      `    ${label}: k=${k.toFixed(2)} 走/日 → 要る頭数 合計 ★**${Math.round(total)}**` +
        `（${parts.join(' / ')}・オープン＋重賞 ${Math.round(((RACES_BY_CLASS.open + RACES_BY_CLASS.graded) * field) / k)}）`,
    );
    console.log(
      `      母数（現役）${alive} 頭に対して ${((total / Math.max(1, alive)) * 100).toFixed(1)}%` +
        `  → ${total <= alive ? `✅ 存在しうる（余裕 ${margin.toFixed(1)}%）` : '🔴 ★存在しない（母数が足りない）'}`,
    );
    console.log(
      `      ⚠️ ★ただし loadRaceablePool は **上限 3,000 頭**しか読みません` +
        ` → ${total <= 3000 ? '✅ 上限の内側' : '🔴 ★上限を超える（★読まれない馬は枠を埋められない）'}`,
    );
  }
  console.log('');
  console.log(`  ★未出走の馬（初期馬の候補になりうる・CL-5'）: ${unraced} 頭 / ${poolIds.length} 頭`);
  console.log(`  ★参考: 資格の範囲（winsRangeFor）… ` +
    CLASSES.map((c) => `${LABEL[c]} ${winsRangeFor(c).min}〜${winsRangeFor(c).max ?? '上限なし'}`).join(' / '));
} finally {
  await client.end();
}
