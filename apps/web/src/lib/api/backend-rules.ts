// BFF 허용 목록. 계약: packages/shared/src/crelink.ts
const ID = '[^/]+';
export const backendRules: ReadonlyArray<{
  methods: readonly string[];
  pattern: RegExp;
  upload?: true;
  visitorEvent?: true;
  signupInAppKind?: true;
}> = [
  { methods: ['GET'], pattern: /^api\/health$/ },
  { methods: ['POST'], pattern: /^api\/auth\/logout$/ },
  { methods: ['GET'], pattern: /^api\/me$/ },
  { methods: ['GET'], pattern: /^api\/me\/pages$/ },
  { methods: ['POST', 'DELETE'], pattern: /^api\/me\/page-invites$/ },
  { methods: ['GET'], pattern: /^api\/me\/page-members$/ },
  {
    methods: ['DELETE'],
    pattern:
      /^api\/me\/page-members\/(me|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/,
  },
  { methods: ['POST'], pattern: /^api\/page-invites\/(preview|accept)$/ },
  { methods: ['GET'], pattern: /^api\/(me|admin)\/analytics$/ },
  { methods: ['GET', 'PATCH'], pattern: /^api\/me\/landing$/ },
  { methods: ['GET'], pattern: /^api\/me\/short-link\/availability$/ },
  { methods: ['PUT'], pattern: /^api\/me\/short-link\/slug$/ },
  { methods: ['POST'], pattern: /^api\/me\/imports\/instabio(\/preview)?$/, signupInAppKind: true },
  { methods: ['POST'], pattern: /^api\/me\/links$/, signupInAppKind: true },
  { methods: ['PUT'], pattern: /^api\/me\/links\/order$/ },
  // 채널별 짧은 주소(docs/specs/channel-links.md): 목록·생성·보관(보관은 POST, 삭제 경로 없음). API가 소유자 전용으로 막습니다.
  { methods: ['GET', 'POST'], pattern: /^api\/me\/channel-links$/ },
  { methods: ['POST'], pattern: new RegExp(`^api/me/channel-links/${ID}/archive$`) },
  // 광고 블록 켜고 끄기(R20 ⑩): 크리에이터 스위치와 운영자 플랫폼 스위치. 플랫폼 스위치 `GET`은 서버 렌더만 부르므로 넣지 않습니다.
  { methods: ['PUT'], pattern: /^api\/me\/ad-block$/ },
  { methods: ['PUT'], pattern: /^api\/admin\/ad-block$/ },
  { methods: ['PATCH', 'DELETE'], pattern: new RegExp(`^api/me/links/${ID}$`) },
  { methods: ['PUT'], pattern: /^api\/me\/socials$/ },
  { methods: ['POST'], pattern: /^api\/me\/portfolio$/ },
  { methods: ['PUT'], pattern: /^api\/me\/portfolio\/order$/ },
  { methods: ['PATCH', 'DELETE'], pattern: new RegExp(`^api/me/portfolio/${ID}$`) },
  { methods: ['POST'], pattern: /^api\/me\/banners$/ },
  { methods: ['PUT'], pattern: /^api\/me\/banners\/order$/ },
  { methods: ['PATCH', 'DELETE'], pattern: new RegExp(`^api/me/banners/${ID}$`) },
  { methods: ['POST'], pattern: /^api\/me\/files$/, upload: true },
  { methods: ['GET'], pattern: new RegExp(`^api/files/${ID}$`) },
  { methods: ['GET'], pattern: new RegExp(`^api/public/landings/${ID}$`) },
  { methods: ['POST'], pattern: /^api\/landings\/[a-z0-9]{10}\/events$/, visitorEvent: true },
  { methods: ['POST'], pattern: /^api\/signup-funnel\/events$/, visitorEvent: true },
  { methods: ['GET'], pattern: /^api\/admin\/creators$/ },
  { methods: ['GET'], pattern: new RegExp(`^api/admin/creators/${ID}$`) },
  { methods: ['GET'], pattern: new RegExp(`^api/admin/creators/${ID}/stats$`) },
  { methods: ['PUT'], pattern: new RegExp(`^api/admin/creators/${ID}/(suspension|banner-slot|metrics-exclusion)$`) },
  { methods: ['PUT'], pattern: new RegExp(`^api/admin/links/${ID}/block$`) },
  { methods: ['PUT'], pattern: new RegExp(`^api/admin/banners/${ID}/block$`) },
  { methods: ['GET', 'POST'], pattern: /^api\/admin\/blocked-domains$/ },
  { methods: ['DELETE'], pattern: new RegExp(`^api/admin/blocked-domains/${ID}$`) },
  // 광고 배너 목록 `GET`은 서버 렌더만 부르므로 넣지 않습니다(설계 docs/specs/crelink-ad-banner.md `권한·보안`).
  { methods: ['POST'], pattern: /^api\/admin\/ad-banners$/ },
  { methods: ['PUT'], pattern: /^api\/admin\/ad-banners\/order$/ },
  { methods: ['PATCH'], pattern: new RegExp(`^api/admin/ad-banners/${ID}$`) },
  { methods: ['PUT'], pattern: new RegExp(`^api/admin/ad-banners/${ID}/end$`) },
  { methods: ['GET', 'POST'], pattern: new RegExp(`^api/landings/${ID}/guestbook$`) },
  { methods: ['DELETE'], pattern: new RegExp(`^api/guestbook/${ID}$`) },
  { methods: ['PUT'], pattern: new RegExp(`^api/guestbook/${ID}/hidden$`) },
  // AI 운영자(설계 docs/specs/crelink-ai-operator.md `화면 상태와 API 대응`). 조회 GET은 서버 렌더만 부르므로 넣지 않습니다.
  { methods: ['PUT'], pattern: /^api\/admin\/ai-operator\/pause$/ },
  { methods: ['PUT'], pattern: new RegExp(`^api/admin/ai-operator/tokens/${ID}/revoke$`) },
  // Instagram 댓글 자동 DM(설계 docs/specs/instagram-comment-dm.md `API 계약 초안`): 소유자 경로와 공개 수신 거부.
  // 콜백은 state 쿠키가 필요해 전용 route(`/me/integrations/instagram/callback`)만 부르고, 웹훅은 Meta가 API로 직접 부르므로 넣지 않습니다.
  { methods: ['GET', 'DELETE'], pattern: /^api\/me\/instagram$/ },
  { methods: ['POST'], pattern: /^api\/me\/instagram\/(connect|recheck)$/ },
  { methods: ['PUT'], pattern: /^api\/me\/instagram\/pause$/ },
  { methods: ['GET'], pattern: /^api\/me\/instagram\/(media|deliveries)$/ },
  { methods: ['GET', 'POST'], pattern: /^api\/me\/instagram\/rules$/ },
  { methods: ['PATCH', 'DELETE'], pattern: /^api\/me\/instagram\/rules\/[a-z0-9]{10}$/ },
  { methods: ['POST'], pattern: /^api\/public\/instagram-dm-opt-outs$/ },
];
