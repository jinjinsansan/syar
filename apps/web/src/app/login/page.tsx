import { PageTitle } from '../../components/ui';

/** ★ログイン（準備中）— Supabase Auth の導入待ち。LP の「ログイン」の行き先 */
export default function LoginPage(): React.ReactElement {
  return (
    <div style={{ padding: '22px 0 40px' }}>
      <PageTitle title="ログイン" sub="準備中" />
      <div className="a-panel strong" style={{ marginTop: 14, maxWidth: 720 }}>
        <div className="a-band" style={{ height: 40, padding: '0 18px', fontSize: 16, fontWeight: 900, letterSpacing: '.1em' }}>ログインはまだ使えません</div>
        <div style={{ padding: '18px 20px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)', fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)', lineHeight: 1.9 }}>
          ログイン機能の導入後に使えるようになります。それまでは番組表・中継・オッズ・記録を登録なしで見られます。
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <a className="a-btn a-btn-gold" href="/" style={{ height: 44, padding: '0 22px', fontSize: 15 }}>トップへ戻る</a>
            <a className="a-btn" href="/races" style={{ height: 44, padding: '0 22px', fontSize: 15 }}>番組表を見る</a>
          </div>
        </div>
      </div>
    </div>
  );
}
