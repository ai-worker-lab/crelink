import type { PublicLandingView } from '@crelink/shared';
import { SOCIAL_PLATFORM_LABELS } from '../../lib/format';
import { DRAFT_ITEM_ID } from '../../lib/landing-preview';
import { DefaultAvatar } from '../DefaultAvatar';
import { Favicon } from '../Favicon';
import { RemoteImage } from '../RemoteImage';
import { SocialIcon } from '../SocialIcon';
import { AddSlot, EditItem, EditRegion, type LandingEditControl } from './LandingEdit';
import { LandingTabs, type LandingTabsControl } from './LandingTabs';

/**
 * 크리에이터 랜딩페이지 본문(프로필 머리·SNS·리스트형 링크 구역·포트폴리오). 공개 랜딩(`/p/{publicId}`)과
 * 관리 화면(`/me/landings/{publicId}/…`)의 실시간 미리보기가 같은 구성 요소를 씁니다.
 * 방명록을 켠 랜딩(`guestbookEnabled`)은 프로필 머리·SNS 아래에 `링크`·`방명록` 탭(`LandingTabs`)을 두고 링크·포트폴리오를
 * `링크` 탭 안에 그립니다. 끈 랜딩은 탭 없이 그대로입니다(PRD R19).
 * `preview`를 주면(관리 화면 미리보기) 탭은 그 값을 따르고 주소 해시를 바꾸지 않으며 방명록은 방문자 시점으로 그립니다.
 * 미리보기 안 링크 누르기를 막는 것은 감싸는 쪽이 맡습니다.
 * `edit`를 주면(관리 화면 `페이지 편집`) 구역·항목을 고르는 층(`LandingEdit.tsx`)을 그리고, 비어 있어도 추가 자리를 둡니다.
 * 관리 화면처럼 페이지 제목이 따로 있으면 `headingLevel={2}`로 크리에이터 이름을 h2로 내립니다.
 */
export function Landing({
  landing,
  preview,
  edit,
  headingLevel = 1,
}: {
  landing: PublicLandingView;
  preview?: LandingTabsControl;
  edit?: LandingEditControl;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const links = landing.blocks.flatMap((block) => block.links);
  const hasLinkContent = landing.portfolio.length > 0 || links.length > 0;
  const empty =
    !landing.displayName && !landing.bio && !landing.avatarUrl && landing.socials.length === 0 && !hasLinkContent;

  const linkList =
    links.length > 0 ? (
      <ul className="link-list">
        {links.map((link) => {
          const content = (
            <LinkCardContent
              title={link.title}
              description={link.description}
              thumbnailUrl={link.thumbnailUrl}
              faviconUrl={link.faviconUrl}
            />
          );
          return (
            <li key={link.id} className={edit ? 'edit-item-slot' : undefined}>
              {edit ? (
                <EditItem
                  edit={edit}
                  target={{ kind: 'link', id: link.id === DRAFT_ITEM_ID ? null : link.id }}
                  kindLabel="링크"
                  title={link.title}
                  className="link-card"
                >
                  {content}
                </EditItem>
              ) : (
                <a className="link-card" href={link.clickUrl} rel="noopener">
                  {content}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    ) : null;

  const portfolioList =
    landing.portfolio.length > 0 ? (
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
              <li key={item.id} className={edit ? 'portfolio-item edit-item-slot' : 'portfolio-item'}>
                {edit ? (
                  <EditItem
                    edit={edit}
                    target={{ kind: 'portfolio-item', id: item.id === DRAFT_ITEM_ID ? null : item.id }}
                    kindLabel="포트폴리오"
                    title={item.title}
                    className="portfolio-card"
                  >
                    {content}
                  </EditItem>
                ) : item.url ? (
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
    ) : null;

  const linkContent = edit ? (
    <>
      <EditRegion edit={edit} target={{ kind: 'links' }} label="외부 링크" buttonLabel="외부 링크 구역 편집">
        <section aria-label="링크" className="edit-links">
          {linkList}
          <AddSlot edit={edit} target={{ kind: 'link', id: null }} label="링크 추가" notice={edit.linkAddNotice} />
        </section>
      </EditRegion>
      <EditRegion edit={edit} target={{ kind: 'portfolio' }} label="포트폴리오" buttonLabel="포트폴리오 구역 편집">
        {portfolioList}
        {edit.canAddPortfolio ? (
          <AddSlot edit={edit} target={{ kind: 'portfolio-item', id: null }} label="포트폴리오 추가" />
        ) : null}
      </EditRegion>
    </>
  ) : (
    <>
      {linkList ? <section aria-label="링크">{linkList}</section> : null}
      {portfolioList}
    </>
  );

  const head = (
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
  );

  const socials =
    landing.socials.length > 0 ? (
      <ul className="social-list" aria-label="SNS 채널">
        {landing.socials.map((social, index) => (
          <li key={`${social.platform}-${index}`}>
            {edit ? (
              <span className="social-link">
                <SocialIcon platform={social.platform} />
                <span className="visually-hidden">{SOCIAL_PLATFORM_LABELS[social.platform].name}</span>
              </span>
            ) : (
              <a className="social-link" href={social.url} rel="noopener">
                <SocialIcon platform={social.platform} />
                <span className="visually-hidden">{SOCIAL_PLATFORM_LABELS[social.platform].name}</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    ) : null;

  const tabs = landing.guestbookEnabled ? (
    <LandingTabs
      publicId={landing.publicId}
      control={preview}
      links={hasLinkContent || empty || edit ? linkContent : <p className="empty-text">아직 올린 링크가 없어요.</p>}
    />
  ) : null;

  return (
    <article className="profile">
      {edit ? (
        <EditRegion edit={edit} target={{ kind: 'profile' }} label="프로필" buttonLabel="프로필 편집">
          {head}
        </EditRegion>
      ) : (
        head
      )}
      {edit && socials ? (
        <EditRegion
          edit={edit}
          target={{ kind: 'profile' }}
          label="SNS 채널"
          buttonLabel="SNS 채널 편집"
          primary={false}
        >
          {socials}
        </EditRegion>
      ) : (
        socials
      )}
      {tabs && edit ? (
        <EditRegion
          edit={edit}
          target={{ kind: 'guestbook' }}
          label="방명록"
          buttonLabel="방명록 탭 편집"
          className="edit-region-tabs"
        >
          {tabs}
        </EditRegion>
      ) : (
        (tabs ?? linkContent)
      )}
    </article>
  );
}

/** 리스트형 링크 카드 안쪽(썸네일·사이트 아이콘·표시 이름·설명). 관리 화면의 링크 행도 같은 모양을 씁니다. */
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
  /** 비어 있으면(저장 전 초안) 기본 아이콘을 그립니다. */
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
