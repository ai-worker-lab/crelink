import { CRELINK_API_PATHS, CRELINK_WEB_PATHS, type PublicLandingResponse } from '@crelink/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { DefaultAvatar } from '../../../../components/DefaultAvatar';
import { Favicon } from '../../../../components/Favicon';
import { RemoteImage } from '../../../../components/RemoteImage';
import { serverApi, ServerApiError, type ServerApiResult } from '../../../../lib/api/server';
import { SOCIAL_PLATFORM_LABELS } from '../../../../lib/format';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ publicId: string }> };

/** 메타데이터와 화면이 같은 요청 안에서 한 번만 조회하도록 묶습니다. */
const loadLanding = cache(async (publicId: string): Promise<ServerApiResult<PublicLandingResponse>> => {
  try {
    return { ok: true, data: await serverApi<PublicLandingResponse>(CRELINK_API_PATHS.publicLanding(publicId)) };
  } catch (error) {
    if (error instanceof ServerApiError) return { ok: false, error };
    throw error;
  }
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const result = await loadLanding((await params).publicId);
  if (!result.ok) return { title: { absolute: '크리링' }, robots: { index: false } };
  return {
    title: { absolute: result.data.displayName ?? '크리링' },
    description: result.data.bio ?? undefined,
  };
}

export default async function PublicLandingPage({ params }: Params) {
  const result = await loadLanding((await params).publicId);
  return (
    <div className="profile-page">
      <main className="profile-main">
        {result.ok ? <Landing landing={result.data} /> : <LandingError error={result.error} />}
      </main>
      <footer className="profile-footer">
        <Link className="brand" href="/">
          크리링
        </Link>
        <span aria-hidden="true">·</span>
        <Link href={CRELINK_WEB_PATHS.privacy}>개인정보 처리방침</Link>
      </footer>
    </div>
  );
}

function LandingError({ error }: { error: ServerApiError }) {
  const [title, body] =
    error.status === 404
      ? ['없는 페이지예요.', '주소가 바뀌었거나 사라진 크리링 페이지예요.']
      : error.status === 410
        ? ['운영이 중지된 페이지예요.', '이 크리에이터의 크리링 페이지는 지금 볼 수 없어요.']
        : ['페이지를 불러오지 못했어요.', `${error.message} 잠시 후 다시 시도해 주세요.`];
  return (
    <div className="empty-state" role="status">
      <h1>{title}</h1>
      <p>{body}</p>
      <Link className="primary" href="/">
        크리링 홈으로
      </Link>
    </div>
  );
}

function Landing({ landing }: { landing: PublicLandingResponse }) {
  const links = landing.blocks.flatMap((block) => block.links);
  const empty =
    !landing.displayName &&
    !landing.bio &&
    !landing.avatarUrl &&
    landing.socials.length === 0 &&
    landing.portfolio.length === 0 &&
    links.length === 0;
  return (
    <article className="profile">
      <header className="profile-head">
        {landing.avatarUrl ? (
          <RemoteImage
            className="profile-avatar"
            src={landing.avatarUrl}
            alt={landing.displayName ? `${landing.displayName} 프로필 사진` : '프로필 사진'}
            width={96}
            height={96}
          />
        ) : (
          <DefaultAvatar className="profile-avatar" />
        )}
        {landing.displayName ? (
          <h1 className="profile-name">{landing.displayName}</h1>
        ) : (
          <h1 className="visually-hidden">크리링 페이지</h1>
        )}
        {landing.bio ? <p className="profile-bio">{landing.bio}</p> : null}
        {empty ? <p className="profile-bio">아직 준비 중인 페이지예요.</p> : null}
      </header>

      {landing.socials.length > 0 ? (
        <ul className="social-list" aria-label="SNS 채널">
          {landing.socials.map((social, index) => (
            <li key={`${social.platform}-${index}`}>
              <a className="social-link" href={social.url} rel="noopener">
                <span className="social-mark" aria-hidden="true">
                  {SOCIAL_PLATFORM_LABELS[social.platform].mark}
                </span>
                <span className="visually-hidden">{SOCIAL_PLATFORM_LABELS[social.platform].name}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {landing.blocks.map((block, blockIndex) =>
        block.links.length > 0 ? (
          <section key={blockIndex} aria-label="링크">
            <ul className="link-list">
              {block.links.map((link) => (
                <li key={link.id}>
                  <a className="link-card" href={link.clickUrl} rel="noopener">
                    {link.thumbnailUrl ? (
                      <RemoteImage className="link-thumb" src={link.thumbnailUrl} alt="" width={56} height={56} />
                    ) : null}
                    <span className="link-text">
                      <span className="link-title">
                        <Favicon src={link.faviconUrl} />
                        <span>{link.title}</span>
                      </span>
                      {link.description ? <span className="link-description">{link.description}</span> : null}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}

      {landing.portfolio.length > 0 ? (
        <section className="portfolio" aria-labelledby="portfolio-title">
          <h2 id="portfolio-title">포트폴리오</h2>
          <ul className="portfolio-grid">
            {landing.portfolio.map((item) => {
              const content = (
                <>
                  {item.imageUrl ? (
                    <RemoteImage className="portfolio-image" src={item.imageUrl} alt="" width={320} height={200} />
                  ) : null}
                  <span className="portfolio-title">{item.title}</span>
                  {item.description ? <span className="portfolio-description">{item.description}</span> : null}
                </>
              );
              return (
                <li key={item.id} className="portfolio-item">
                  {item.url ? (
                    <a className="portfolio-card" href={item.url} rel="noopener">
                      {content}
                    </a>
                  ) : (
                    <div className="portfolio-card">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
