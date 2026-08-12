/**
 * ★配る物が要求するスキーマが、繋ぎ先の DB に入っているかを確かめる
 *
 * 【なぜ要るか（2026-08-12 の事故）】
 *   マイグレーション 0010〜0015 を本番に当てないまま新しいコードを配備しました。
 *   ワーカーは `column "condition" does not exist` で**10回連続失敗して終了**しました。
 *
 *   ★**既存の配備前検査は、どれもこれを検出できません**:
 *     - `node dist/worker.cjs`（環境変数なし）→ STAR_ENV のエラーで止まる。DB を見ない
 *     - `--selfcheck` → **わざと DB に触らない**設計（純ロジックだけ）
 *   ★どちらも「起動できるか」「束ね方が壊れていないか」を見ており、
 *     **「繋ぎ先がこのコードを動かせる形か」は誰も見ていませんでした。**
 *
 * 【何を照合するか】
 *   リリースに含まれる `db/migrations/*.sql` の一覧と、
 *   DB の `schema_migrations` を突き合わせます。
 *   ★「必要な列があるか」を1つずつ書くと、列を足すたびにここも直す必要があり、
 *     **直し忘れたときに検査が黙って通ります**。ファイル名の集合なら漏れません。
 *
 * 実行: node dist/worker.cjs --schemacheck
 */

import { readdirSync } from 'node:fs';
import pg from 'pg';
import { loadConfig } from './env.js';

export async function runSchemacheck(): Promise<{ ok: boolean; report: string[] }> {
  const out: string[] = [];
  out.push('# schemacheck（配る物が要求するスキーマが DB に入っているか）');

  let files: string[];
  try {
    files = readdirSync('db/migrations').filter((f) => f.endsWith('.sql')).sort();
  } catch (e) {
    out.push(`  ★db/migrations を読めません（${(e as Error).message}）`);
    return { ok: false, report: out };
  }
  out.push(`  リリースに含まれるマイグレーション: ${files.length} 件`);

  const cfg = loadConfig();
  const client = new pg.Client({
    connectionString: cfg.databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const r = await client.query<{ filename: string }>(
      `select filename from schema_migrations`,
    ).catch(() => ({ rows: [] as { filename: string }[] }));
    const applied = new Set(r.rows.map((x) => x.filename));
    const missing = files.filter((f) => !applied.has(f));
    out.push(`  DB に記録済み: ${applied.size} 件`);
    if (missing.length > 0) {
      out.push(`  ★未適用が ${missing.length} 件あります:`);
      for (const m of missing) out.push(`    - ${m}`);
      out.push('  ★このまま起動すると、足りない列を使う経路で失敗します。');
      out.push('    → `npx tsx tools/migrate.mjs` を先に流してください。');
      return { ok: false, report: out };
    }
    out.push('  ★schemacheck: PASS — 未適用なし');
    return { ok: true, report: out };
  } finally {
    await client.end();
  }
}
