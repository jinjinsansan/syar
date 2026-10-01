/**
 * ★**脚質の言葉**（★DB の値 → 画面の言葉・1 か所）。
 *   ★2026-10-01: ★`discovery-screen.ts` の中に在った表を ここへ移した（★小窓テレビの番組も使う・★あちらはログインの要る lib なので 読み込まない）。
 */
import type { Strategy } from '@star/sim-engine';

export const STRATEGY_LABEL: Readonly<Record<Strategy, string>> = {
  nige: '逃げ', senko: '先行', sashi: '差し', oikomi: '追い込み',
};

export function strategyLabel(value: string | null): string | null {
  return value !== null && value in STRATEGY_LABEL ? STRATEGY_LABEL[value as Strategy] : null;
}
