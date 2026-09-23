/**
 * ★**いまどこに繋いでいるかの帯**（★裁定 `REVIEW_HORSE_IDENTITY_VERDICT_20260923.md` §14）
 *
 * 🔴 ★**本番の配信では出しません**（`showConnectedBanner()` が `NODE_ENV` で決める）。
 * 🔴 ★**書き換えた名札ではなく、実際に繋ぐ URL のホスト**を出します。
 *    ★「名札だけ staging に直して、中身は本番のまま」を見逃さないためです。
 *
 * ⚠️ ★どちらが本番かは ★**言い当てません**（★本番のホスト名をここに書くと、それ自体が名札になります）。
 *    ★人が見て確かめられれば足ります。
 */
import { connectedTo, showConnectedBanner } from '../lib/connected-to';

export function ConnectedBanner(): React.ReactElement | null {
  if (!showConnectedBanner()) return null;
  const { host, ref } = connectedTo();
  return (
    <div
      role="status"
      aria-label="いま繋いでいる先"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px',
        background: '#4a1010', color: '#ffe483', fontSize: 11, fontWeight: 900,
        borderTop: '2px solid #ffe483', pointerEvents: 'none',
      }}
    >
      <span>開発サーバー</span>
      <span style={{ fontWeight: 500 }}>繋ぎ先:</span>
      <span>{ref ?? '（読めません）'}</span>
      <span style={{ fontWeight: 500, opacity: 0.8 }}>{host ?? ''}</span>
    </div>
  );
}
