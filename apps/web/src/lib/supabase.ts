/**
 * Supabase クライアント（読み取り専用）
 *
 * ★anon キーだけを使います。service_role キーはフロントに置きません（RLS を素通りする）。
 *   §14.3 のとおり、ここは読み取り系だけです。
 */
import { createClient } from '@supabase/supabase-js';

export function readClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  // ★未設定を黙って空データで進めない。設定漏れが「レースが無い」に見えてしまう
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / ANON_KEY が未設定です');
  return createClient(url, key);
}
