/**
 * ★**1 周の所要を、頭数に対して測る**（CF-5）— 裁定 `REVIEW_CF1_STEADY_STATE_VERDICT_20260918.md`
 *
 * 【★なぜ AL-6 と別に要るのか】
 *   ★**AL-6 は「1 レースのオッズ計算」**の話でした（★CPU・M = 3,896,104 試行）。
 *   ★**1 周にはそれ以外もあります** — ★プールの読み込み・調子/疲労の読み込み・勝利数の集計・週送り。
 *   ★**これらは頭数に比例します。** ★母数を 2,500 → 7,000 にするなら、★ここを先に測る必要があります。
 *   ⚠️ ★**正典 D-104 が既に警告していました** — 「★週進行のバッチ（NPC 2,500 頭 ＋ 利用者の持ち馬）の所要は、
 *      ★**頭数と間隔の掛け算で増える**（§14.1-2）→ D-100 の間隔を決める測定と一緒に測る」。
 *      ★**その測定は行われていませんでした。** ★本ツールがその一部です。
 *
 * 【★測る量】★**読み取りだけ**（R-24: readonly）。★DB を変えません。
 *   ① `loadRaceablePool` と同じ SQL（★上限を振って、頭数に対する伸びを見る）
 *   ② 調子・疲労の読み込み（`loadTrainingStates` と同じ SQL）
 *   ③ 勝利数の集計（`loadWinsByHorse` と同じ SQL・★CL-1 でこの便が足したもの）
 *
 * 【★測れないもの（★正直に書きます）】
 *   ★**週送りの書き込み側**（`training-runner` の UPDATE）は ★**状態を変える**ので、ここでは測れません（R-24）。
 *   ★**本当の 1 周は配備して読むのが唯一の方法**です（R-28）。★本ツールは「読み込みの側」だけを測ります。
 *
 * 実行: npx tsx tools/measure-cycle-load.mjs --env staging
 */
import pg from 'pg';
import { loadEnv } from './lib/env.mjs';

/** ★測る上限（★頭数に対する伸びを見るため複数点） */
const LIMITS = [500, 1000, 2000, 3000, 5000];
/** ★換算の目標（★CF-1 で出た「要る頭数」） */
const TARGET = 7000;
/** ★1 点あたりの試行回数（★1 回の値で言わない） */
const REPEAT = 3;

const env = loadEnv();
const client = new pg.Client({ connectionString: env.DATABASE_URL });
await client.connect();
try {
  const envRow = await client.query('select environment from app_environment limit 1');
  console.log(`接続先: ${env.file}（DB の申告: ${envRow.rows[0]?.environment ?? '不明'}）`);

  /**
   * ★**DB 側の実行時間だけを取る**（★`explain analyze` の Execution Time）。
   *
   * 【★なぜ要るか】
   *   🔴 ★この機械から測ると ★**網の往復が支配的**で、★2 回の実行で 1 頭あたり 0.97ms と 0.22ms に割れました。
   *   ★**同じ DB を本番のワーカー（VPS）も読みます** — ★違うのは網だけです。
   *   → ★**DB 側の実行時間は、VPS でもそのまま効く量**です（★網の分はワーカーの方が小さいはず）。
   *   ⚠️ ★**往復を含む値を「ワーカーの所要」として報告しない**（R-30・★ES-6 の「1.28 倍」と同じ轍）。
   */
  const dbMs = async (sql, params = []) => {
    let best = Infinity;
    for (let i = 0; i < REPEAT; i += 1) {
      const r = await client.query(`explain (analyze, buffers, format json) ${sql}`, params);
      const plan = r.rows[0]['QUERY PLAN'][0];
      const t = Number(plan['Execution Time']) + Number(plan['Planning Time'] ?? 0);
      if (t < best) best = t;
    }
    return best;
  };

  const ms = async (sql, params = []) => {
    let best = Infinity;
    let rows = 0;
    for (let i = 0; i < REPEAT; i += 1) {
      const t0 = process.hrtime.bigint();
      const r = await client.query(sql, params);
      const dt = Number(process.hrtime.bigint() - t0) / 1e6;
      rows = r.rowCount ?? r.rows.length;
      if (dt < best) best = dt;
    }
    return { ms: best, rows };
  };

  console.log('');
  console.log(`# CF-5 1 周の読み込みの所要（★最小値 / ${REPEAT} 回）`);
  console.log(`  ${'上限'.padStart(7)}${'読めた頭数'.padStart(12)}${'網こみ'.padStart(13)}${'★DB 側'.padStart(13)}${'1頭あたり'.padStart(12)}`);

  const points = [];
  for (const limit of LIMITS) {
    const r = await ms(
      `select * from horses
        where generation >= (select max(generation) - 2 from horses)
          and retired_at_week is null
        order by id limit $1`,
      [limit],
    );
    const db = await dbMs(
      `select * from horses
        where generation >= (select max(generation) - 2 from horses)
          and retired_at_week is null
        order by id limit $1`,
      [limit],
    );
    points.push({ n: r.rows, ms: db });
    console.log(
      `  ${String(limit).padStart(7)}${String(r.rows).padStart(12)}${`${r.ms.toFixed(0)} ms`.padStart(13)}` +
        `${`${db.toFixed(1)} ms`.padStart(13)}${`${((db / Math.max(1, r.rows)) * 1000).toFixed(1)} μs`.padStart(12)}`,
    );
  }

  // ★頭数に対する伸び（★最小二乗で 1 次を当てる。★「線形か」を目で見ずに数字で言う）
  const n = points.length;
  const sx = points.reduce((a, p) => a + p.n, 0);
  const sy = points.reduce((a, p) => a + p.ms, 0);
  const sxx = points.reduce((a, p) => a + p.n * p.n, 0);
  const sxy = points.reduce((a, p) => a + p.n * p.ms, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;

  /**
   * ⚠️ ★**表の名前を推測しないこと。** ★初版は `horse_training_state` と書いて「表が無い」と出しました
   *    （★R-21: 0 件・エラーを「該当なし」と読まない）。★実体は `horses` の列です
   *    （✔ `apps/worker/src/horse-repo.ts:124` の `loadTrainingStates` と**同じ SQL**）。
   */
  const training = await ms(`select id, condition, fatigue from horses`);
  const trainingDb = await dbMs(`select id, condition, fatigue from horses`);
  const winsSql = `select horse_id, count(*)::int as wins from race_entries where finish_pos = 1 group by horse_id`;
  const wins = await ms(winsSql);
  const winsDb = await dbMs(winsSql);
  const entryRows = (await client.query(`select count(*)::int n from race_entries`)).rows[0].n;

  console.log('');
  console.log(`  ★伸び（★DB 側）: 1 頭あたり **${(slope * 1000).toFixed(2)} μs** ＋ 固定 ${intercept.toFixed(1)} ms`);
  console.log(`  ★${TARGET} 頭に換算（★DB 側）: ★**${(intercept + slope * TARGET).toFixed(0)} ms**（プールの読み込みだけ）`);
  console.log('');
  console.log(
    `  調子・疲労の読み込み（loadTrainingStates と同じ SQL）: 網こみ ${training.ms.toFixed(0)} ms / ★DB 側 ${trainingDb.toFixed(1)} ms / ${training.rows} 頭`,
  );
  console.log(`    ⚠️ ★この SQL には **where がありません** — ★引退馬も繁殖馬も含む**全頭**を毎周読んでいます`);
  console.log(
    `  勝利数の集計（CL-1 で追加）: 網こみ ${wins.ms.toFixed(0)} ms / ★DB 側 ${winsDb.toFixed(1)} ms` +
      ` / ${wins.rows} 頭（race_entries ${entryRows.toLocaleString()} 行）`,
  );
  /**
   * ★**CF-8: 列にする「見直しの合図」**（★裁定 REVIEW_CF5_CF6_VERDICT_20260918・受理 REVIEW_CF7_VERDICT_20260918）。
   *   ★`race_entries` は**増え続けます**（★1 日 480R × 13.5 頭 ＝ 約 6,500 行/日 ＝ **年 237 万行**）。
   *   ★**先に線を引いておけば、その日に気づけます。**
   *
   * ⚠️ ★**この線はゲートではありません**（★D-054 の形）。★**「いつ見直すか」の合図**です。
   *    ★超えたからといって何かが不合格になるわけではありません。★**値そのものをゲートにしないこと。**
   *
   * ⚠️ ★**200 ms の根拠は「毎周 1 回 × 1 日の周の数」です。** ★いまは 3 分サイクル（1 日 480 周）で
   *    ★200 ms × 480 ＝ **96 秒/日**の DB 時間として置きました。
   *    ★**サイクルが変われば分母が変わります**（★案 C の 6 分なら 1 日 240 周 ＝ 48 秒/日）。
   *    ★**線は据え置きでよい**（裁定）— ★**分母が変わったことだけ、ここに書いて残します。**
   */
  const CYCLES_PER_DAY_NOW = 480; // ★3 分サイクル（★案 C の 6 分なら 240。★分母が変わることの記録）
  const WINS_DB_MS_LIMIT = 200;
  const WINS_ROWS_LIMIT = 5_000_000;
  const overMs = winsDb > WINS_DB_MS_LIMIT;
  const overRows = entryRows > WINS_ROWS_LIMIT;
  console.log(
    `    ★CF-8 の合図: DB 側 ${WINS_DB_MS_LIMIT} ms（★1 日 ${CYCLES_PER_DAY_NOW} 周 ＝ ${((WINS_DB_MS_LIMIT * CYCLES_PER_DAY_NOW) / 1000).toFixed(0)} 秒/日）` +
      ` ／ race_entries ${WINS_ROWS_LIMIT.toLocaleString()} 行` +
      ` → ${overMs || overRows ? '🔴 ★**見直しの合図が出ました（列にすることを検討）**' : '✅ まだ内側'}` +
      `（★いま DB 側 ${((winsDb / WINS_DB_MS_LIMIT) * 100).toFixed(0)}% ／ 行数 ${((entryRows / WINS_ROWS_LIMIT) * 100).toFixed(2)}%）`,
  );
  console.log('');
  console.log('  ⚠️ ★これは**読み込みの側だけ**です。★週送りの書き込みと、オッズの MC（AL-6）は含みません。');
  console.log('  ⚠️ ★**本当の 1 周は、配備して journalctl の「周=」を読むのが唯一の方法**です（R-28）。');
  console.log('');
  console.log('  🔴 ★**この数字は「この機械から Supabase への通信込み」です。**');
  console.log('     ★本番のワーカーは VPS から読むので、★1 頭あたりの値はこれより小さいはずです（△ 未測定）。');
  console.log('     ★**転用してよいのは「頭数に対して線形」という形だけ**で、★秒数そのものではありません（R-30）。');
} finally {
  await client.end();
}
