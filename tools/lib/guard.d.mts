/** ★ガードの型（本体は guard.mjs）。`any` を使わないために置く */
export interface GuardClient {
  query(sql: string): Promise<{ rows: { environment: string }[] }>;
}
/**
 * 接続先が本番なら例外を投げる。返り値は宣言されている環境名。
 * ★宣言が無い場合・読めない場合も**拒否**する（「本番でない」の証拠にならないため）。
 */
export declare function assertNotProduction(client: GuardClient, tool: string): Promise<string>;
