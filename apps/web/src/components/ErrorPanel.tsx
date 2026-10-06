import Link from 'next/link';

/** 화면을 그릴 수 없는 조회 오류 안내(권한 없음·없음·연결 실패 등). */
export function ErrorPanel({
  title,
  message,
  action = { href: '/', label: '처음으로' },
}: {
  title: string;
  message: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="empty-state" role="alert">
      <span className="error-badge" aria-hidden="true">
        !
      </span>
      <h1>{title}</h1>
      <p>{message}</p>
      <Link className="primary" href={action.href}>
        {action.label}
      </Link>
    </div>
  );
}
