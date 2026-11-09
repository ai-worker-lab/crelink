SET LOCAL lock_timeout = '5s';
-- 가입 경로 일별 합계(0231). 이메일·이름·IP·전체 주소·전체 User-Agent·방문자 식별자 열을 두지 않습니다.
CREATE TABLE signup_funnel_daily (
  day date NOT NULL,
  step text NOT NULL CHECK (step IN ('home_view','signup_click','oauth_start','oauth_callback','signup_complete','first_link')),
  source text NOT NULL DEFAULT '',
  medium text NOT NULL DEFAULT '',
  campaign text NOT NULL DEFAULT '',
  referrer_host text NOT NULL DEFAULT '',
  in_app_kind text NOT NULL CHECK (in_app_kind IN ('none','unknown','instagram','facebook','kakaotalk','naver','line')),
  events integer NOT NULL,
  PRIMARY KEY (day, step, source, medium, campaign, referrer_host, in_app_kind)
);

-- OAuth 왕복 동안 유입값을 잇는 짧은 기록. 키는 state의 해시이고 콜백에서 지우며 남은 행도 15분 뒤 지웁니다.
CREATE TABLE signup_funnel_oauth_contexts (
  state_hash text PRIMARY KEY,
  source text NOT NULL DEFAULT '',
  medium text NOT NULL DEFAULT '',
  campaign text NOT NULL DEFAULT '',
  referrer_host text NOT NULL DEFAULT '',
  in_app_kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX signup_funnel_oauth_contexts_created_at_idx ON signup_funnel_oauth_contexts (created_at);
