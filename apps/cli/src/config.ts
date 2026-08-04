/**
 * CLI の定数上書きを解決して実行用の設定を組み立てる。
 *
 * ここを関数に切り出しているのは、**上書き時に形質別パラメータを導出し直すこと**を
 * テストで固定するため（I-4・合格基準17）。
 */

import {
  DEFAULT_BALANCE,
  FOUNDERS,
  buildTraitMutation,
  type BalanceConfig,
  type FoundersConfig,
} from '@star/sim-engine';

export function applyOverrides<T extends object>(
  base: T,
  overrides: Record<string, number>,
  label: string,
): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in out)) throw new Error(`${label} に存在しない定数です: ${key}`);
    out[key] = value;
  }
  return out as T;
}

export interface RuntimeConfig {
  balance: BalanceConfig;
  founders: FoundersConfig;
}

/**
 * 上書きを適用したうえで、**形質別パラメータ（sd / clamp / 品種中心）を必ず再導出する**。
 *
 * `TRAIT_MUTATION` は balance.ts の読み込み時に既定の `REGRESSION_RATE` / `FOUNDERS` から
 * 1度だけ構築される。`--set-balance REGRESSION_RATE=…` や `--set-founders …_SD=…` で
 * 上書きしても再構築しなければ、**回帰率だけが変わって sd が据え置かれる**。
 *
 * これは P0-fix の誤結論（「回帰0.20 では距離SDが 0.4倍に収縮する」）を生んだのと
 * まったく同じ経路なので、上書きの有無にかかわらず毎回導出し直す。
 */
export function resolveRuntimeConfig(
  balanceOverrides: Record<string, number> = {},
  geneticsOverrides: Record<string, number> = {},
  founderOverrides: Record<string, number> = {},
): RuntimeConfig {
  const founders = applyOverrides(FOUNDERS, founderOverrides, 'founders');
  const overridden: BalanceConfig = {
    ...applyOverrides(DEFAULT_BALANCE, balanceOverrides, 'balance'),
    genetics: applyOverrides(DEFAULT_BALANCE.genetics, geneticsOverrides, 'genetics'),
  };
  return {
    founders,
    balance: {
      ...overridden,
      traitMutation: buildTraitMutation(
        founders,
        overridden.REGRESSION_RATE,
        overridden.MUTATION_CLAMP / overridden.genetics.MUTATION_SD,
      ),
    },
  };
}
