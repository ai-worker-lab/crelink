import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="public-page">
      <div className="empty-state" role="status">
        <h1>찾을 수 없는 페이지예요.</h1>
        <p>주소가 바뀌었거나 없는 페이지일 수 있어요.</p>
        <Link className="primary" href="/">
          처음으로
        </Link>
      </div>
    </main>
  );
}
