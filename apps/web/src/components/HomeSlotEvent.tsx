import type { SlotEventView } from '@crelink/shared';
import Link from 'next/link';
import { formatDateTime } from '../lib/format';

/**
 * 홈 `/`의 링크 슬롯 이벤트 안내(R24 ④, 디자인 design/slot-event/handoff.md `홈 /` C1~C3, 설계 docs/specs/crelink-slot-event.md
 * `화면 상태와 API 대응`). 진행 중(`status = 'open'`)일 때만 홈이 그립니다.
 * 로그인 전에는 카드 안에 버튼을 두지 않고 바로 아래 기존 `구글로 시작하기`를 쓰며(주요 버튼은 화면에 하나),
 * 로그인 후에는 카드 안 보조 버튼 `내 크리링에서 신청하기`로 관리 화면(`/me`)에 보냅니다. 홈은 신청 여부를 모르므로
 * 이미 신청한 계정에도 같은 카드가 보입니다(설계 `디자인 검토 의견` 1).
 */
export function HomeSlotEvent({ event, signedIn }: { event: SlotEventView; signedIn: boolean }) {
  return (
    <section className="home-event" aria-labelledby="home-event-title">
      <h2 id="home-event-title" className="home-event-title">
        <span className="badge">이벤트</span>
        <span>외부 링크 +5 이벤트</span>
      </h2>
      <p>
        {signedIn
          ? `이벤트를 신청하면 보이는 외부 링크를 ${event.bonusLinks}개 더 둘 수 있어요. 계정마다 한 번 신청할 수 있어요.`
          : `가입하고 이벤트를 신청하면 보이는 외부 링크를 ${event.bonusLinks}개 더 둘 수 있어요. 계정마다 한 번 신청할 수 있어요.`}
      </p>
      <p className="home-event-period">
        신청 기간 <time dateTime={event.startsAt}>{formatDateTime(event.startsAt)}</time>
        {event.endsAt ? (
          <>
            {' ~ '}
            <time dateTime={event.endsAt}>{formatDateTime(event.endsAt)}</time>
          </>
        ) : (
          '부터'
        )}
      </p>
      {signedIn ? (
        <Link className="secondary" href="/me">
          내 크리링에서 신청하기
        </Link>
      ) : null}
    </section>
  );
}
