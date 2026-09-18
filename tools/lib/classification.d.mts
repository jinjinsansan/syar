/** ★分類簿の型（本体は classification.mjs）。`any` を使わないために置く */
export declare const READONLY: readonly string[];
export declare const STATE_CHANGING: readonly string[];
export declare const PRODUCTION_OPS: readonly { readonly file: string; readonly why: string }[];
/** ★道具ではないもの（★2026-09-19・TG-2。★「対象外」も分類の 1 つ） */
export declare const NOT_A_TOOL: readonly { readonly file: string; readonly why: string }[];
export declare function allClassified(): string[];
