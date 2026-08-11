/**
 * ★接続先の選択を1箇所にまとめる（2026-08-11）
 *
 * 【なぜ共通化するか】
 *   18本のツールが `secrets.local.env` を**べた書き**していました。
 *   1本ずつ直すと**必ず漏れます**し、漏れたものは
 *   「staging を指しているつもりで本番を叩く」形で現れます。
 *
 * 【★既定は本番のまま】
 *   `--env staging` を**明示したときだけ** staging を使います。
 *   ⚠️ 既定を staging にすると、**読み取り専用ツールが本番を見なくなり**、
 *      「本番の状態を確かめたつもりが staging だった」という
 *      **逆向きの取り違え**が起きます。
 *   ★状態を変えるツールは、そもそも `assertNotProduction` が本番を拒否します（R-24）。
 */
import { readFileSync } from 'node:fs';

/** `--env staging` が指定されていれば staging の env ファイル名を返す */
export function envFileName(argv = process.argv) {
  const i = argv.indexOf('--env');
  const name = i >= 0 ? argv[i + 1] : 'local';
  if (name !== 'local' && name !== 'staging') {
    throw new Error(`--env は local か staging です（受け取った値: ${name}）`);
  }
  return name === 'staging' ? 'secrets.staging.env' : 'secrets.local.env';
}

/** env ファイルを読んで key=value の表にする。★値は返すが表示はしない */
export function loadEnv(argv = process.argv) {
  const file = envFileName(argv);
  const env = Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.match(/^([A-Za-z_]+)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].trim()]),
  );
  if (!env.DATABASE_URL) throw new Error(`${file}: DATABASE_URL が未設定です`);
  // ★どちらを見ているかは必ず出す。取り違えは黙って起きるので
  console.log(`[env] 接続先: ${file}`);
  return env;
}

/**
 * ★フラグを除いた位置引数を返す。
 *
 * 【なぜ要るか】
 *   `--env staging` を足した瞬間、`process.argv[2]` を直接読んでいたツールが壊れます。
 *   `seed-world.mjs` は `Number(process.argv[2] ?? 既定)` で種を読んでおり、
 *   `--env` が入ると **NaN** になります。★落ちずに NaN のまま進むのが厄介です。
 */
export function positionals(argv = process.argv) {
  const rest = argv.slice(2);
  const out = [];
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i].startsWith('--')) { i += 1; continue; } // フラグとその値を飛ばす
    out.push(rest[i]);
  }
  return out;
}

/**
 * ★前提が揃っているかを、**状態を作る前に**確かめる（2026-08-11）。
 *
 * 【なぜ要るか】
 *   `verify-prize` / `verify-cancel` / `verify-economy` は
 *   **利用者を作ってから**「発売中のレース」を探しており、
 *   staging にレースが無いと `race.id` で TypeError になって落ちていました。
 *   ★後片付けに到達しないので、**利用者の行が残ります**。
 *   実際 staging に3件残っており、しかも `account_type='player'` だったので
 *   §11.2 の実経済の指標に検証用の口座が混ざる状態でした。
 *
 *   → **状態を作る前に**前提を確かめ、揃っていなければ**何も作らずに**終わります。
 */
export function requireRow(row, what, hint) {
  if (row === undefined || row === null) {
    console.error(`★${what}が見つかりません。${hint}`);
    console.error('  ★このツールは前提が揃うまで**何も作らずに**終了します（後片付け漏れを作らないため）');
    process.exit(2);
  }
  return row;
}
