import Link from 'next/link';

/**
 * 화면을 그릴 수 없는 조회 오류 안내(권한 없음·없음·연결 실패 등).
 * `action.reload`가 참이면(`다시 시도`) 문서를 새로 불러오는 링크로 그립니다. 클라이언트 이동은 같은 주소의 공유 레이아웃을
 * 다시 렌더하지 않아, 레이아웃이 부른 조회를 다시 하지 않기 때문입니다.
 */
export function ErrorPanel({
  title,
  message,
  action = { href: '/', label: '처음으로' },
}: {
  title: string;
  message: string;
  action?: { href: string; label: string; reload?: boolean };
}) {
  return (
    <div className="empty-state" role="alert">
      <span className="error-badge" aria-hidden="true">
        !
      </span>
      <h1>{title}</h1>
      <p>{message}</p>
      {action.reload ? (
        <a className="primary" href={action.href}>
          {action.label}
        </a>
      ) : (
        <Link className="primary" href={action.href}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
