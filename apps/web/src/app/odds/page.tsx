/**
 * ★**オッズの入口（`/odds`）— 次のレースへ送る**（★R-14・2026-09-17）
 *
 * 【★なぜ入口が要るか】
 *   ★オッズは ★**レースごと**なので、★`/odds` だけでは「どのレース」か決まりません。
 *   ★ダッシュボードや投票から「オッズ」を押したときに ★**次の 1 本**へ送ります。
 *
 * 【★この層の仕事】（★正典 §14.3）
 *   ★**読み取りだけ**です。★発売中・締切済みの最も近いレースを 1 本選び、★`/odds/[id]` へ送ります。
 *   ⚠️ ★**画面で「次」を計算しません** — ★`scheduled_at` の順に読んで、★`status` で選ぶだけです。
 *
 * ⚠️ ★**以前ここにデモの出馬表 12 行を置いていました**（★2026-09-17）。
 *    ★`/odds/[id]` が実データを出すようになったので、★**二重帳簿を消しました**（★D-052）。
 */
import { redirect } from 'next/navigation';
import { readClient } from '../../lib/supabase';
import { ReadError } from '../../components/ui';

export const revalidate = 0;

type Row = Record<string, string | number | null>;

export default async function OddsEntryPage() {
  const c = readClient();
  const { data, error } = await c
    .from('races_public')
    .select('*')
    .order('scheduled_at', { ascending: true })
    .limit(48);
  if (error) return <ReadError message={error.message} />;

  const races = (data ?? []) as Row[];
  /** ★発売中か締切済みの最も近い 1 本（★確定したレースのオッズは「次」ではない） */
  const next = races.find((r) => r['status'] === 'scheduled' || r['status'] === 'closed');
  if (next !== undefined) redirect(`/odds/${String(next['id'])}`);

  /** ★見つからないときは黙って空にしない（★R-21） */
  return (
    <div data-theme="uma" style={{
      minHeight: '100dvh', background: 'var(--u-navy)', color: 'var(--u-ink-light)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: "'M PLUS Rounded 1c', system-ui, sans-serif", fontWeight: 800,
    }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 16 }}>いま発売中のレースがありません。</p>
        <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 500, color: 'var(--u-ink-light-3)' }}>
          次の番組を編成中です。数分おきに開催されます。
        </p>
        <a href="/home" style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44,
          marginTop: 16, padding: '0 18px', borderRadius: 10, border: '3px solid var(--u-navy)',
          backgroundImage: 'linear-gradient(#ffffff,#e6eef6)', color: 'var(--u-ink-dark)', fontSize: 14,
        }}>ダッシュボードへ</a>
      </div>
    </div>
  );
}
