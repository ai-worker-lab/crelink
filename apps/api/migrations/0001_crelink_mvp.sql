-- 크리링 MVP 스키마. 근거: docs/specs/crelink-mvp.md (데이터 모델).
-- 새 테이블만 추가합니다. 되돌리려면 이 파일의 테이블을 지웁니다(운영 데이터가 생긴 뒤에는 다음 migration으로 고칩니다).

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role text NOT NULL DEFAULT 'creator' CHECK (role IN ('creator', 'operator')),
  extra_link_slots integer NOT NULL DEFAULT 0 CHECK (extra_link_slots >= 0),
  suspended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_created_at_idx ON users (created_at DESC, id);

CREATE TABLE user_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google')),
  provider_subject text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject)
);
CREATE INDEX user_identities_user_id_idx ON user_identities (user_id);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- 쿠키 원문 토큰의 SHA-256 hex. 원문은 저장하지 않습니다.
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  size integer NOT NULL CHECK (size > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX files_owner_user_id_idx ON files (owner_user_id);

-- MVP는 사용자당 랜딩 1개(R6). 여러 개를 허용할 때 user_id UNIQUE를 다음 migration에서 풉니다.
CREATE TABLE landings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  public_id text NOT NULL UNIQUE CHECK (public_id ~ '^[a-z0-9]{10}$'),
  display_name text,
  bio text,
  avatar_file_id uuid REFERENCES files (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE landing_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_id uuid NOT NULL REFERENCES landings (id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('list')),
  position integer NOT NULL,
  UNIQUE (landing_id, position)
);

CREATE TABLE links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE CHECK (public_id ~ '^[a-z0-9]{10}$'),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES landing_blocks (id) ON DELETE CASCADE,
  title text NOT NULL,
  url text NOT NULL,
  -- URL의 호스트(소문자, punycode). 차단 도메인 비교와 사이트 아이콘 주소에 씁니다.
  host text NOT NULL,
  description text,
  thumbnail_file_id uuid REFERENCES files (id) ON DELETE SET NULL,
  position integer NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  blocked_at timestamptz,
  blocked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX links_user_id_position_idx ON links (user_id, position);
CREATE INDEX links_host_idx ON links (host);

CREATE TABLE social_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_id uuid NOT NULL REFERENCES landings (id) ON DELETE CASCADE,
  platform text NOT NULL
    CHECK (platform IN ('instagram', 'youtube', 'tiktok', 'naver_blog', 'x', 'threads', 'facebook', 'other')),
  url text NOT NULL,
  position integer NOT NULL
);
CREATE INDEX social_links_landing_id_idx ON social_links (landing_id, position);

CREATE TABLE portfolio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_id uuid NOT NULL REFERENCES landings (id) ON DELETE CASCADE,
  title text NOT NULL,
  url text,
  image_file_id uuid REFERENCES files (id) ON DELETE SET NULL,
  description text,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portfolio_items_landing_id_idx ON portfolio_items (landing_id, position);

-- MVP는 사용자당 단축 URL 1개(R6).
CREATE TABLE short_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  landing_id uuid NOT NULL REFERENCES landings (id) ON DELETE CASCADE,
  -- 사용자가 마지막으로 주소를 바꾼 시각. null이면 아직 바꾼 적이 없어 바로 바꿀 수 있습니다(R8).
  slug_changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 현재 주소는 retired_at IS NULL. 옛 주소는 retired_at + 90일까지 연결·예약되고, 그 뒤 다른 사람이 쓰면 행을 지우고 새로 만듭니다.
CREATE TABLE short_slugs (
  slug text PRIMARY KEY CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$' AND length(slug) BETWEEN 3 AND 30),
  short_link_id uuid NOT NULL REFERENCES short_links (id) ON DELETE CASCADE,
  is_auto boolean NOT NULL,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX short_slugs_current_idx ON short_slugs (short_link_id) WHERE retired_at IS NULL;

-- 접근 로그 원본(R9). 원본은 1년 보관 뒤 보존 작업이 집계 테이블로 옮기고 지웁니다(R11).
CREATE TABLE visits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  short_link_id uuid NOT NULL REFERENCES short_links (id) ON DELETE CASCADE,
  slug text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  visitor_id uuid NOT NULL,
  ip inet,
  country text,
  city text,
  referrer text,
  referrer_host text,
  user_agent text,
  device_type text,
  browser text,
  os text
);
CREATE INDEX visits_short_link_id_occurred_at_idx ON visits (short_link_id, occurred_at);
CREATE INDEX visits_occurred_at_idx ON visits (occurred_at);

CREATE TABLE link_clicks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- 링크를 지워도 기록은 link_public_id 사본으로 남습니다.
  link_id uuid REFERENCES links (id) ON DELETE SET NULL,
  link_public_id text NOT NULL,
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
CREATE INDEX link_clicks_short_link_id_occurred_at_idx ON link_clicks (short_link_id, occurred_at);
CREATE INDEX link_clicks_occurred_at_idx ON link_clicks (occurred_at);

-- 집계 테이블(R10, R11). day는 Asia/Seoul 기준 날짜이며 IP는 넣지 않습니다.
CREATE TABLE visit_daily_rollups (
  day date NOT NULL,
  short_link_id uuid NOT NULL REFERENCES short_links (id) ON DELETE CASCADE,
  visits integer NOT NULL DEFAULT 0,
  unique_visitors integer NOT NULL DEFAULT 0,
  link_clicks integer NOT NULL DEFAULT 0,
  PRIMARY KEY (short_link_id, day)
);

CREATE TABLE visit_dimension_rollups (
  day date NOT NULL,
  short_link_id uuid NOT NULL REFERENCES short_links (id) ON DELETE CASCADE,
  dimension text NOT NULL CHECK (dimension IN ('referrer_host', 'device_type', 'browser', 'os', 'country')),
  value text NOT NULL,
  visits integer NOT NULL,
  PRIMARY KEY (short_link_id, day, dimension, value)
);

CREATE TABLE link_click_rollups (
  day date NOT NULL,
  short_link_id uuid NOT NULL REFERENCES short_links (id) ON DELETE CASCADE,
  link_public_id text NOT NULL,
  clicks integer NOT NULL,
  PRIMARY KEY (short_link_id, day, link_public_id)
);

CREATE TABLE blocked_domains (
  domain text PRIMARY KEY,
  reason text,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
