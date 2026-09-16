/**
 * ★**TOP（`/`）＝「馬物語」**（★R-14・2026-09-17・確定案 3b）
 *
 * 【★2026-09-17 の差し替え】
 *   ★オーナー判定により、★TOP は ★**スクロールなしの一枚絵**になりました
 *   （★金プレートの題字＋副題の丸札＋馬＋**はじめる / ログイン の 2 つだけ**）。
 *   ★正本は引き渡し資料 `design_handoff_uma_monogatari/TopE3.dc.html`（★`TopE2` は却下）。
 *
 * 【★何を残したか】
 *   ★**以前の「馬物語」LP（スクロールする物語）は `/lp-preview` に残っています**
 *     — ★作った側の復元点で、★消していません。
 *   ★さらに前のアーケード風 TOP は `/lp-arcade` に退避したままです。
 *   ⚠️ ★**TOP からは `/race`・`/lp-arcade`・`#story` の導線が外れました**（★オーナー指定
 *      「ボタンは はじめる / ログイン の 2 つのみ」）。★どちらも**ルートは生きています**。
 *
 * ⚠️ ★本文は `components/uma/uma-top.tsx` を ★**そのまま**使います（★写しません・R-30）。
 */
import UmaTop from '../components/uma/uma-top';

export const metadata = {
  title: '馬物語｜そだてる・とうひょう・かけぬける',
  description: '育てる日々も、駆け抜ける一瞬も。あなたの馬と、世代をつなぐ競馬育成ゲーム。',
};

export default function Page() {
  return <UmaTop />;
}
