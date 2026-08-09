/** ★分類簿の型（本体は classification.mjs）。`any` を使わないために置く */
export declare const READONLY: readonly string[];
export declare const STATE_CHANGING: readonly string[];
export declare const PRODUCTION_OPS: readonly { readonly file: string; readonly why: string }[];
export declare function allClassified(): string[];
