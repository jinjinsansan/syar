#!/usr/bin/env node
/**
 * 100世代シミュレータ CLI — 指示書 §3.4
 *
 *   npm run simulate -- --generations 100 --seed 42 [--population 500] [--json out.json]
 *
 * 出力は人間可読の表（stdout）と機械可読の JSON（--json）の両方。
 * 同じ引数なら実行のたびに完全一致する（時刻・OS乱数を一切使わない）。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { NICKS_GEN } from '@star/sim-engine';
import { resolveRuntimeConfig } from './src/config.js';
import { formatReport } from './src/format.js';
import { DEFAULT_OPTIONS, runSimulation, type SimulationOptions } from './src/simulator.js';

interface CliArgs {
  options: Partial<SimulationOptions>;
  json: string | null;
  quiet: boolean;
  /** balance 定数の上書き（例: --set-genetics MUTATION_SD=50） */
  geneticsOverrides: Record<string, number>;
  balanceOverrides: Record<string, number>;
  founderOverrides: Record<string, number>;
}

const USAGE = `
使い方: npm run simulate -- [options]

  --generations <n>        回す世代数（既定 ${DEFAULT_OPTIONS.generations}）
  --seed <n>               マスターシード（既定 ${DEFAULT_OPTIONS.seed}）
  --population <n>         繁殖牝馬プール（既定 ${DEFAULT_OPTIONS.population}）
  --stallion-pool <n>      種牡馬プール（既定 ${DEFAULT_OPTIONS.stallionPool}）
  --stallion-top <r>       種付候補にする上位割合（既定 ${DEFAULT_OPTIONS.stallionTopRatio}）
  --maturity <n>           繁殖可能になる年齢（既定 ${DEFAULT_OPTIONS.maturityYears}）
  --service-years <n>      種牡馬の供用年数（既定 ${DEFAULT_OPTIONS.stallionServiceYears}）
  --mare-max-age <n>       繁殖牝馬の上限年齢（既定 ${DEFAULT_OPTIONS.mareMaxAgeYears}）
  --recruit <random|top>   プール補充の選抜方針（既定 ${DEFAULT_OPTIONS.recruit}）
  --selection-h2 <r>       種牡馬選抜に使う観測能力の遺伝率（既定 ${DEFAULT_OPTIONS.selectionH2}。
                           1 を指定すると真の素質値による完全情報選抜になる）
  --v1-pairs <n>           V-1 で試す配合の組数（既定 ${DEFAULT_OPTIONS.v1Pairs}）
  --v1-repeats <n>         V-1 の反復回数（既定 ${DEFAULT_OPTIONS.v1Repeats}）
  --long-horizon [n]       V-2c（長期健全性）を同一実行内で判定する。既定 300ゲーム内年。
                           指定しない場合 V-2c は「別実行で確認」となる
  --no-prune               祖先レコードの破棄を無効化（メモリと引き換えの検証用）
  --json <path>            機械可読な JSON を書き出す
  --quiet                  人間可読の表を出さない
  --set-genetics K=V,...   遺伝定数の上書き（例: MUTATION_SD=50,ATAVISM_RATE=0.06）
  --set-balance K=V,...    その他 balance 定数の上書き（例: REGRESSION_RATE=0.2）
  --set-founders K=V,...   創始世代定数の上書き（例: ABILITY_MEAN=500）
  --help
`.trim();

function parseKeyValues(raw: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (trimmed === '') continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) throw new Error(`--set-* の書式が不正です: ${trimmed}`);
    const key = trimmed.slice(0, eq).trim();
    const value = Number(trimmed.slice(eq + 1).trim());
    if (!Number.isFinite(value)) throw new Error(`数値ではありません: ${trimmed}`);
    out[key] = value;
  }
  return out;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const options: Partial<SimulationOptions> = {};
  let json: string | null = null;
  let quiet = false;
  let geneticsOverrides: Record<string, number> = {};
  let balanceOverrides: Record<string, number> = {};
  let founderOverrides: Record<string, number> = {};

  const next = (i: number): string => {
    const v = argv[i + 1];
    if (v === undefined) throw new Error(`${argv[i]} に値がありません`);
    return v;
  };
  const num = (i: number): number => {
    const v = Number(next(i));
    if (!Number.isFinite(v)) throw new Error(`${argv[i]} の値が数値ではありません`);
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        console.log(USAGE);
        process.exit(0);
        break;
      case '--generations':
        options.generations = num(i);
        i++;
        break;
      case '--seed':
        options.seed = num(i);
        i++;
        break;
      case '--population':
        options.population = num(i);
        i++;
        break;
      case '--stallion-pool':
        options.stallionPool = num(i);
        i++;
        break;
      case '--stallion-top':
        options.stallionTopRatio = num(i);
        i++;
        break;
      case '--maturity':
        options.maturityYears = num(i);
        i++;
        break;
      case '--service-years':
        options.stallionServiceYears = num(i);
        i++;
        break;
      case '--mare-max-age':
        options.mareMaxAgeYears = num(i);
        i++;
        break;
      case '--recruit': {
        const v = next(i);
        if (v !== 'random' && v !== 'top') throw new Error('--recruit は random か top');
        options.recruit = v;
        i++;
        break;
      }
      case '--selection-h2':
        options.selectionH2 = num(i);
        i++;
        break;
      case '--v1-pairs':
        options.v1Pairs = num(i);
        i++;
        break;
      case '--v1-repeats':
        options.v1Repeats = num(i);
        i++;
        break;
      case '--long-horizon': {
        // 値は省略可（省略時は正典 §13.2 の 300ゲーム内年）
        const raw = argv[i + 1];
        if (raw !== undefined && !raw.startsWith('-') && Number.isFinite(Number(raw))) {
          options.longHorizonGenerations = Number(raw);
          i++;
        } else {
          options.longHorizonGenerations = 300;
        }
        break;
      }
      case '--no-prune':
        options.prune = false;
        break;
      case '--json':
        json = next(i);
        i++;
        break;
      case '--quiet':
        quiet = true;
        break;
      case '--set-genetics':
        geneticsOverrides = parseKeyValues(next(i));
        i++;
        break;
      case '--set-balance':
        balanceOverrides = parseKeyValues(next(i));
        i++;
        break;
      case '--set-founders':
        founderOverrides = parseKeyValues(next(i));
        i++;
        break;
      default:
        if (arg !== undefined && arg.startsWith('-')) {
          throw new Error(`不明なオプション: ${arg}\n\n${USAGE}`);
        }
    }
  }

  return { options, json, quiet, geneticsOverrides, balanceOverrides, founderOverrides };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  // 上書きの適用と形質別パラメータの再導出は config.ts に集約（I-4）
  const { balance, founders } = resolveRuntimeConfig(
    args.balanceOverrides,
    args.geneticsOverrides,
    args.founderOverrides,
  );

  const result = runSimulation(args.options, balance, founders, NICKS_GEN);

  if (!args.quiet) {
    console.log(formatReport(result));
  }

  if (args.json !== null) {
    const path = resolve(process.cwd(), args.json);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    if (!args.quiet) console.log(`\nJSON を書き出しました: ${path}`);
  }

  process.exitCode = result.verification.pass ? 0 : 1;
}

main();
