/** ★分類簿の型（本体は classification.mjs）。`any` を使わないために置く */
export declare const READONLY: readonly string[];
export declare const STATE_CHANGING: readonly string[];
export declare const PRODUCTION_OPS: readonly { readonly file: string; readonly why: string }[];
/** ★道具ではないもの（★2026-09-19・TG-2。★「対象外」も分類の 1 つ） */
export declare const NOT_A_TOOL: readonly { readonly file: string; readonly why: string }[];
/** ★部品（★2026-09-19・TG-3。★他の道具から import されるだけのもの） */
export declare const COMPONENT: readonly { readonly file: string; readonly why: string }[];
/** ★ソースを書き換える道具（★2026-09-19・TG-4。★DB には触れないが「読むだけ」でもない） */
export declare const SOURCE_MUTATING: readonly { readonly file: string; readonly why: string }[];
export declare function allClassified(): string[];
