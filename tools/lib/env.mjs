/**
 * ★接続先の選択を1箇所にまとめる（2026-08-11）
 *
 * 【なぜ共通化するか】
 *   18本のツールが `secrets.local.env` を**べた書き**していました。
 *   1本ずつ直すと**必ず漏れます**し、漏れたものは
 *   「staging を指しているつもりで本番を叩く」形で現れます。
 *
 * 【★既定は廃止しました（2026-09-14・`--env` 必須）】
 *   以前は「既定は本番（読み取り専用ツールに限る）」でした。
 *   ★2026-09-14、開発側がその場で書いたスクリプトを `--env` 無しで流し、**本番の DB を読みました**
 *     （読み取り専用・書き込み無し・`REPORT_AUDIT_FIX2_20260914.md` §8-1）。
 *     コマンドに「production」の文字が無いので、道具の外の判定もすり抜けました。
 *     監査 M-5（R-27「既定は狭い側へ」）で指摘済みの穴そのものです（裁定 `REVIEW_AUDIT_FIX2_VERDICT_20260914.md` §3-3）。
 *   → **`--env staging` か `--env production` を明示しない限り、接続前に例外**にします。`tools/migrate.mjs` と同じ規則です。
 *   ⚠️ 「既定を staging にする」も採りません（本番を確かめたつもりが staging だった、という逆向きの取り違えが起きる）。
 *   ★状態を変えるツールは、これに加えて `assertNotProduction` が本番を拒否します（R-24・そのまま残す）。
 *   ★検査: `apps/cli/test/env-loader.test.ts`（接続しない単体の検査）。
 *
 * 【★環境名を "local" から "production" に改めた経緯（2026-08-20）】
 *   旧 `secrets.local.env` の中身は `STAR_ENV=development` でしたが、
 *   **実際の接続先は本番でした**（DB の `app_environment` が `production`・
 *   実測時点で未来のレースが生成され続けていた）。**development の環境は存在しません。**
 *   ファイル名の "local" は「自分のローカルマシンにある秘密ファイル」の意味で
 *   環境名ではなかったのですが、**`--env local` という綴りがそれを環境名に見せていました。**
 *   → ファイルを `secrets.production.env` に改名し、`--env` の値も `production` に改めました。
 *      **接続先の名前と、環境の名前を一致させる。**
 */
import { readFileSync } from 'node:fs';

/** 環境名 → 秘密ファイル名。★ここが唯一の対応表 */
const ENV_FILES = {
  production: 'secrets.production.env',
  staging: 'secrets.staging.env',
};

/** `--env` で指定された環境の env ファイル名を返す。★`--env` が無ければ例外（既定は無い・上の注記） */
export function envFileName(argv = process.argv) {
  const i = argv.indexOf('--env');
  const name = i >= 0 ? argv[i + 1] : null;
  if (name === null) {
    throw new Error(
      '--env staging か --env production を明示してください。★既定は廃止しました（2026-09-14）— ' +
        '省略で本番へ向く形は、手を抜いた操作が最も危険な向き先に落ちる構造です（R-27）',
    );
  }
  if (name === 'local') {
    throw new Error(
      '--env local は廃止しました。★"local" は環境名ではなく、実際の接続先は本番でした（2026-08-20）。' +
        '本番を見るなら --env production、staging なら --env staging を明示してください',
    );
  }
  const file = ENV_FILES[name];
  if (file === undefined) {
    throw new Error(`--env は production か staging です（受け取った値: ${name}）`);
  }
  return file;
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
