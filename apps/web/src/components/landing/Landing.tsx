import type { PublicLandingView } from '@crelink/shared';
import type { ReactNode } from 'react';
import { SOCIAL_PLATFORM_LABELS } from '../../lib/format';
import { DefaultAvatar } from '../DefaultAvatar';
import { Favicon } from '../Favicon';
import { RemoteImage } from '../RemoteImage';
import { SocialIcon } from '../SocialIcon';
import { LandingTabs } from './LandingTabs';

/**
 * 크리에이터 랜딩페이지 본문(프로필 머리·SNS·리스트형 링크 구역·포트폴리오). 공개 랜딩(`/p/{publicId}`)과
 * 관리 화면(`/me/landings/{publicId}`)의 보기·편집 모드가 같은 구성 요소를 씁니다.
 * 방명록을 켠 랜딩(`guestbookEnabled`)은 프로필 머리·SNS 아래에 `링크`·`방명록` 탭(`LandingTabs`)을 두고 링크·포트폴리오를
 * `링크` 탭 안에 그립니다. 끈 랜딩은 탭 없이 그대로입니다(PRD R19).
 * `links`를 주면 리스트형 링크 구역 자리에 그 내용(편집 모드의 링크 편집기)을 그리고 방명록 탭은 두지 않습니다.
 * 관리 화면처럼 페이지 제목이 따로 있으면 `headingLevel={2}`로 크리에이터 이름을 h2로 내립니다.
 */
export function Landing({
  landing,
  links,
  headingLevel = 1,
}: {
  landing: PublicLandingView;
  links?: ReactNode;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const hasLinkContent = landing.portfolio.length > 0 || landing.blocks.some((block) => block.links.length > 0);
  const empty =
    links === undefined &&
    !landing.displayName &&
    !landing.bio &&
    !landing.avatarUrl &&
    landing.socials.length === 0 &&
    !hasLinkContent;
  const linkContent = (
    <>
      {links !== undefined
        ? links
        : landing.blocks.map((block, blockIndex) =>
            block.links.length > 0 ? (
              <section key={blockIndex} aria-label="링크">
                <ul className="link-list">
                  {block.links.map((link) => (
                    <li key={link.id}>
                      <a className="link-card" href={link.clickUrl} rel="noopener">
                        <LinkCardContent
                          title={link.title}
                          description={link.description}
                          thumbnailUrl={link.thumbnailUrl}
                          faviconUrl={link.faviconUrl}
                        />
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
    </>
  );
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
          <Heading className="profile-name">{landing.displayName}</Heading>
        ) : (
          <Heading className="visually-hidden">크리링 페이지</Heading>
        )}
        {landing.bio ? <p className="profile-bio">{landing.bio}</p> : null}
        {empty ? <p className="profile-bio">아직 준비 중인 페이지예요.</p> : null}
      </header>

      {landing.socials.length > 0 ? (
        <ul className="social-list" aria-label="SNS 채널">
          {landing.socials.map((social, index) => (
            <li key={`${social.platform}-${index}`}>
              <a className="social-link" href={social.url} rel="noopener">
                <SocialIcon platform={social.platform} />
                <span className="visually-hidden">{SOCIAL_PLATFORM_LABELS[social.platform].name}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {links === undefined && landing.guestbookEnabled ? (
        <LandingTabs
          publicId={landing.publicId}
          links={hasLinkContent || empty ? linkContent : <p className="empty-text">아직 올린 링크가 없어요.</p>}
        />
      ) : (
        linkContent
      )}
    </article>
  );
}

/** 리스트형 링크 카드 안쪽(썸네일·사이트 아이콘·표시 이름·설명). 편집 모드 카드도 같은 모양을 씁니다. */
export function LinkCardContent({
  title,
  description,
  thumbnailUrl,
  faviconUrl,
  descriptionId,
}: {
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  faviconUrl: string;
  descriptionId?: string;
}) {
  return (
    <>
      {thumbnailUrl ? <RemoteImage className="link-thumb" src={thumbnailUrl} alt="" width={56} height={56} /> : null}
      <span className="link-text">
        <span className="link-title">
          <Favicon key={faviconUrl} src={faviconUrl} />
          <span>{title}</span>
        </span>
        {description ? (
          <span id={descriptionId} className="link-description">
            {description}
          </span>
        ) : null}
      </span>
    </>
  );
}
