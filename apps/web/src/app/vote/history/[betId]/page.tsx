/**
 * ★**投票の控え 1 枚の殻**（★引数を解いて ★中身のクライアント部品へ渡すだけ・★`/stable/[horseId]` と同じ形）
 *   ★`bets` は ★本人の行だけ（★RLS）なので ★セッションを持つ側（クライアント）で読みます。
 */
import { VoteTicketView } from './ticket-view';

export default async function VoteTicketPage(
  { params }: { params: Promise<{ betId: string }> },
): Promise<React.ReactElement> {
  const { betId } = await params;
  return <VoteTicketView betId={betId} />;
}
