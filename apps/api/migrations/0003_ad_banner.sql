SET LOCAL lock_timeout = '5s';
-- 광고 블록·크리에이터 배너 슬롯(R20, R21). 근거: docs/specs/crelink-ad-banner.md (데이터 모델).
-- NULL을 허용하는 컬럼과 새 테이블만 추가합니다(expand). 옛 API는 이 컬럼·테이블을 모르고 그대로 동작합니다.
-- 첫 줄의 lock_timeout: users·landing_blocks·files ALTER가 5초 안에 잠금을 잡지 못하면 이 파일 전체가 되돌려지고 새 색이 기동에 실패합니다(활성 색 유지).
-- 되돌리기(운영 데이터가 생기기 전, 운영 DB는 명시적 승인 뒤 손으로):
--   DROP TABLE creator_banner_click_rollups, creator_banner_clicks, ad_banner_daily_stats, creator_banners, ad_banners;
--   ALTER TABLE files DROP COLUMN animated;
--   ALTER TABLE landing_blocks DROP COLUMN slot_position;
--   ALTER TABLE users DROP COLUMN banner_slot_granted_at;
--   DELETE FROM schema_migrations WHERE version = '0003_ad_banner';
-- 운영 데이터가 생긴 뒤에는 지우지 않고 다음 migration으로 고칩니다.

-- 배너 슬롯 부여 시각(계정 단위, R21 ①). NULL이면 광고 블록. 회수는 NULL로 되돌리고 배너 행은 그대로 둡니다(R21 ⑤).
ALTER TABLE users ADD COLUMN banner_slot_granted_at timestamptz;

-- 광고 블록·배너 슬롯 위치. NULL = 맨 뒤(백필 없음), k = 같은 구역에서 links.position < k인 링크들 다음.
ALTER TABLE landing_blocks ADD COLUMN slot_position integer CHECK (slot_position >= 0);

-- 움직이는 이미지(GIF·WebP·APNG)인지. 업로드 때 판정합니다. NULL은 이 migration 전에 올린 파일(모름)이며 배너 저장 때 판정해 채웁니다.
ALTER TABLE files ADD COLUMN animated boolean;

-- 크리링 배너(R20 ④). 삭제 API는 없고 내리기(ends_at)만 있습니다.
-- 이미지 FK는 RESTRICT: 운영자 계정을 지우면 files.owner_user_id CASCADE가 게시 배너 이미지를 지우려다 막힙니다(게시 배너 이미지 보호).
CREATE TABLE ad_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE CHECK (public_id ~ '^[a-z0-9]{10}$'),
  image_file_id uuid NOT NULL REFERENCES files (id) ON DELETE RESTRICT,
  still_file_id uuid REFERENCES files (id) ON DELETE RESTRICT,
  alt text NOT NULL CHECK (char_length(alt) BETWEEN 1 AND 100),
  url text NOT NULL,
  host text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  sort_order integer NOT NULL,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- 입력 검증은 endsAt > startsAt이고, 예약 배너를 내리면 둘이 같아질 수 있어 DB는 >=입니다.
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX ad_banners_sort_order_idx ON ad_banners (sort_order, created_at);
CREATE INDEX ad_banners_host_idx ON ad_banners (host);

-- 크리에이터 배너(R21 ②④). 랜딩 단위(landing_id)로 저장하고 한도도 랜딩마다 셉니다. user_id는 소유·차단 검사용입니다.
-- 크리에이터를 지우면 배너 행이 같은 문장에서 연쇄 삭제되므로 이미지 FK(NO ACTION, 문장 끝 검사)가 삭제를 막지 않습니다.
-- public_id는 randomId(10)이며 Caddy 단축 호스트 정규식 [a-z0-9]{10}의 원본이 이 CHECK입니다.
CREATE TABLE creator_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE CHECK (public_id ~ '^[a-z0-9]{10}$'),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  landing_id uuid NOT NULL REFERENCES landings (id) ON DELETE CASCADE,
  image_file_id uuid NOT NULL REFERENCES files (id),
  still_file_id uuid REFERENCES files (id) ON DELETE SET NULL,
  alt text NOT NULL CHECK (char_length(alt) BETWEEN 1 AND 100),
  url text,
  host text,
  position integer NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  blocked_at timestamptz,
  blocked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((url IS NULL) = (host IS NULL))
);
CREATE INDEX creator_banners_landing_id_position_idx ON creator_banners (landing_id, position);
CREATE INDEX creator_banners_user_id_idx ON creator_banners (user_id);
CREATE INDEX creator_banners_host_idx ON creator_banners (host);

-- 크리링 배너 노출·클릭(R20 ⑧). 개인 식별 정보 없는 카운터이며 계속 보관합니다(R11).
-- day는 Asia/Seoul 기준 날짜, landing_public_id는 FK 없는 사본이라 랜딩이 지워져도 누적이 남습니다.
CREATE TABLE ad_banner_daily_stats (
  day date NOT NULL,
  ad_banner_id uuid NOT NULL REFERENCES ad_banners (id) ON DELETE CASCADE,
  landing_public_id text NOT NULL,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  PRIMARY KEY (ad_banner_id, day, landing_public_id)
);

-- 크리에이터 배너 클릭 원본(R21 ④, link_clicks와 같은 항목). 1년 보존 뒤 creator_banner_click_rollups로 옮깁니다(R11).
-- 배너를 지워도 기록은 banner_public_id 사본으로 남습니다.
CREATE TABLE creator_banner_clicks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  banner_id uuid REFERENCES creator_banners (id) ON DELETE SET NULL,
  banner_public_id text NOT NULL,
  short_link_id uuid NOT NULL REFERENCES short_links (id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  visitor_id uuid NOT NULL,
  ip inet,
  country text,
  city text,
  referrer_host text,
  user_agent text,
  device_type text,
  browser text,
  os text
);
CREATE INDEX creator_banner_clicks_short_link_id_occurred_at_idx ON creator_banner_clicks (short_link_id, occurred_at);
CREATE INDEX creator_banner_clicks_occurred_at_idx ON creator_banner_clicks (occurred_at);

-- 보존 작업이 원본을 지우기 전에 만드는 집계(R11 ②③, IP 없음). day는 Asia/Seoul 기준 날짜입니다.
CREATE TABLE creator_banner_click_rollups (
  day date NOT NULL,
  short_link_id uuid NOT NULL REFERENCES short_links (id) ON DELETE CASCADE,
  banner_public_id text NOT NULL,
  clicks integer NOT NULL,
  PRIMARY KEY (short_link_id, day, banner_public_id)
);
