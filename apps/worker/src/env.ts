/**
 * 環境の読み込みと**環境ガード**（正典 §14.6 / 合格基準 A-7）
 *
 * 【なぜ DB 側に真実を置くのか】
 *   接続文字列の取り違えは**必ず起きる**前提に立ちます。
 *   ワーカーが「自分は staging のつもり」でも、繋いだ先が production なら止めなければ
 *   本番の台帳を壊します。だから**自己申告と DB 側の宣言を突き合わせ、
 *   不一致なら起動を失敗させます**。
 *
 * ⚠️ 「警告して続行」にしない。続行できるなら、いつか続行されます。
 */

export type StarEnv = 'production' | 'staging' | 'development';

export interface WorkerConfig {
  readonly env: StarEnv;
  readonly databaseUrl: string;
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  /** 開催の起点（epoch ミリ秒）。★運用中に動かすとサイクル番号が付け替わる */
  readonly epochMs: number;
}

const KNOWN: readonly StarEnv[] = ['production', 'staging', 'development'];

/** 環境変数から設定を読む。**値をログに出さない**（秘密が流出する） */
export function loadConfig(source: Record<string, string | undefined> = process.env): WorkerConfig {
  const need = (k: string): string => {
    const v = source[k];
    if (v === undefined || v.trim() === '') throw new Error(`${k} が未設定です`);
    return v.trim();
  };

  const env = need('STAR_ENV') as StarEnv;
  if (!KNOWN.includes(env)) {
    throw new Error(`STAR_ENV の値が不正です（${KNOWN.join(' | ')} のいずれか）`);
  }

  const epochIso = need('STAR_EPOCH_ISO');
  const epochMs = Date.parse(epochIso);
  if (!Number.isFinite(epochMs)) {
    throw new Error('STAR_EPOCH_ISO が ISO8601 として解釈できません');
  }

  return {
    env,
    databaseUrl: need('DATABASE_URL'),
    supabaseUrl: need('SUPABASE_URL'),
    serviceRoleKey: need('SUPABASE_SERVICE_ROLE_KEY'),
    epochMs,
  };
}

/**
 * ★A-7: DB 側の宣言と突き合わせる。**不一致なら例外**（起動失敗）。
 *
 * @param declared ワーカーの自己申告（STAR_ENV）
 * @param onDb DB の app_environment に書かれている値
 */
export function assertEnvironmentMatches(declared: StarEnv, onDb: string | null): void {
  if (onDb === null) {
    throw new Error(
      'DB に app_environment が設定されていません。' +
        '接続先の環境が確認できないため起動しません（§14.6）。',
    );
  }
  if (onDb !== declared) {
    throw new Error(
      `環境が一致しません: ワーカーは "${declared}" のつもりですが、` +
        `接続先の DB は "${onDb}" です。**起動しません**（§14.6・A-7）。`,
    );
  }
}
