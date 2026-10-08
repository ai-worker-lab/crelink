-- 랜딩 방명록(R19). 근거: docs/specs/crelink-guestbook.md (데이터 모델).
-- 기본값이 있는 컬럼과 새 테이블만 추가합니다(expand). 옛 API는 이 컬럼·테이블을 모르고 그대로 동작합니다.
-- 되돌리려면 guestbook_entries 테이블과 landings.guestbook_enabled 컬럼을 지웁니다(운영 데이터가 생긴 뒤에는 다음 migration으로 고칩니다).

-- 끄면 탭·조회·작성이 막히고 글은 그대로 남습니다.
ALTER TABLE landings ADD COLUMN guestbook_enabled boolean NOT NULL DEFAULT true;

-- 본문은 API가 앞뒤 공백을 자른 뒤 1~500자로 검사합니다(CRELINK_LIMITS.guestbookBodyMax). 수정은 없고 삭제는 행 삭제입니다.
CREATE TABLE guestbook_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_id uuid NOT NULL REFERENCES landings (id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  is_secret boolean NOT NULL DEFAULT false,
  -- 랜딩 크리에이터가 숨긴 시각. NULL이면 숨기지 않은 글입니다.
  hidden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- 목록은 최신순 keyset 페이지(created_at, id)입니다.
CREATE INDEX guestbook_entries_landing_id_created_at_idx ON guestbook_entries (landing_id, created_at DESC, id DESC);
CREATE INDEX guestbook_entries_author_user_id_idx ON guestbook_entries (author_user_id);
