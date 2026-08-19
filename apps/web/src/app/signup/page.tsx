import { PageTitle } from '../../components/ui';

/**
 * ★アカウント作成（準備中）— Supabase Auth の導入はレビュー側の指示書待ち（QUESTIONS）。
 *   LP の「無料ではじめる」の行き先。空ページにせず、何が準備中で今なにができるかを出す。
 *   ⚠️ 参加ポイントを買う・増やす導線は置かない（憲法 §0.2）。
 */
export default function SignupPage(): React.ReactElement {
  return (
    <div style={{ padding: '22px 0 40px' }}>
      <PageTitle title="アカウント作成" sub="準備中" />
      <div className="a-panel strong" style={{ marginTop: 14, maxWidth: 720 }}>
        <div className="a-band" style={{ height: 40, padding: '0 18px', fontSize: 16, fontWeight: 900, letterSpacing: '.1em' }}>いまは登録なしで見られます</div>
        <div style={{ padding: '18px 20px', backgroundImage: 'linear-gradient(#ffffff,#eef6fd)', fontSize: 14, fontWeight: 900, color: 'var(--a-ink-2)', lineHeight: 1.9 }}>
          アカウント作成（メール）はログイン機能の導入後に使えるようになります。<br />
          それまでは番組表・中継・オッズ・記録を登録なしで見られます。参加ポイントを販売することはありません。<br />
          登録後の流れ: 1 牧場名を決める → 2 最初の馬を迎える → 3 調教を指示する → 4 出走登録する → 5 中継を観る
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <a className="a-btn a-btn-gold" href="/race" style={{ height: 44, padding: '0 22px', fontSize: 15 }}>中継を観る（デモ）</a>
            <a className="a-btn" href="/races" style={{ height: 44, padding: '0 22px', fontSize: 15 }}>番組表を見る</a>
          </div>
        </div>
      </div>
    </div>
  );
}
