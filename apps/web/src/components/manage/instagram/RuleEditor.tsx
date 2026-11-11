'use client';

import {
  CRELINK_API_PATHS,
  INSTAGRAM_DM_LIMITS,
  type CreateInstagramDmRuleRequest,
  type InstagramDmMediaView,
  type InstagramDmRuleView,
  type UpdateInstagramDmRuleRequest,
} from '@crelink/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { browserApi } from '../../../lib/api/browser';
import { useAction } from '../../../lib/use-action';
import { ActionStatus } from '../../ActionStatus';
import { MediaPicker } from './MediaPicker';
import { RULE_FIELD_COPY, ruleDraftProblem } from './state';

const PROBLEM_TEXT = {
  media: '규칙을 붙일 게시물을 골라 주세요.',
  keyword: `키워드는 1~${INSTAGRAM_DM_LIMITS.keywordMaxLength}자로 적어 주세요.`,
  message: `보낼 메시지는 1~${INSTAGRAM_DM_LIMITS.messageMaxLength}자로 적어 주세요.`,
} as const;

/**
 * 규칙 만들기·고치기. 새 규칙은 게시물을 먼저 고르고(고친 뒤에는 게시물을 바꾸지 않음) 키워드와 메시지를 적습니다.
 * 메시지는 글자 수를 보여 주고 250자를 넘기지 못하게 합니다. 문구 내용은 제한하지 않습니다.
 */
export function RuleEditor({
  rule,
  takenMediaIds,
  onSaved,
  onCancel,
  onReauthRequired,
}: {
  rule: InstagramDmRuleView | null;
  takenMediaIds: ReadonlySet<string>;
  onSaved: (rule: InstagramDmRuleView) => void;
  onCancel: () => void;
  onReauthRequired: () => void;
}) {
  const baseId = useId();
  const [media, setMedia] = useState<InstagramDmMediaView | null>(null);
  const [keyword, setKeyword] = useState(rule?.keyword ?? '');
  const [matchAllComments, setMatchAllComments] = useState(rule?.matchAllComments ?? false);
  const [message, setMessage] = useState(rule?.message ?? '');
  const [replyMessage, setReplyMessage] = useState(rule?.replyMessage ?? '');
  const [problem, setProblem] = useState<keyof typeof PROBLEM_TEXT | null>(null);
  const save = useAction();
  const root = useRef<HTMLFormElement>(null);

  useEffect(() => {
    root.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = ruleDraftProblem({ mediaId: media?.id ?? '', keyword, matchAllComments, message }, rule === null);
    setProblem(found);
    if (found) {
      root.current?.querySelector<HTMLElement>(`[data-field="${found}"]`)?.focus();
      return;
    }
    await save.run(async () => {
      const trimmedReply = replyMessage.trim() || null;
      if (rule) {
        const body: UpdateInstagramDmRuleRequest = {
          keyword,
          matchAllComments,
          message,
          replyMessage: trimmedReply,
        };
        onSaved(
          await browserApi<InstagramDmRuleView>(CRELINK_API_PATHS.meInstagramRule(rule.publicId), {
            method: 'PATCH',
            body: JSON.stringify(body),
          }),
        );
      } else {
        const body: CreateInstagramDmRuleRequest = {
          mediaId: media!.id,
          keyword,
          matchAllComments,
          message,
          replyMessage: trimmedReply,
        };
        onSaved(
          await browserApi<InstagramDmRuleView>(CRELINK_API_PATHS.meInstagramRules, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
        );
      }
    });
  }

  const messageLength = message.length;
  return (
    <form ref={root} className="form-stack ig-rule-form" onSubmit={submit} noValidate>
      <h3 className="channel-list-title">{rule ? '규칙 고치기' : '규칙 추가'}</h3>
      {rule ? (
        <p className="field-help">게시물은 바꿀 수 없어요. 다른 게시물에 쓰려면 새 규칙을 추가해 주세요.</p>
      ) : media ? (
        <div className="field">
          <span className="ig-label">고른 게시물</span>
          <p className="ig-picked">{media.caption || '캡션 없음'}</p>
          <button type="button" className="secondary" onClick={() => setMedia(null)} disabled={save.pending}>
            게시물 다시 고르기
          </button>
        </div>
      ) : (
        <div className="field" data-field="media" tabIndex={-1}>
          <span className="ig-label" data-autofocus tabIndex={-1}>
            게시물 고르기
          </span>
          <MediaPicker
            value=""
            takenMediaIds={takenMediaIds}
            onChange={(picked) => {
              setMedia(picked);
              setProblem(null);
            }}
            onReauthRequired={onReauthRequired}
          />
          {problem === 'media' ? <p className="form-error-inline">{PROBLEM_TEXT.media}</p> : null}
        </div>
      )}
      <div className="field">
        <label htmlFor={`${baseId}-all-comments`}>
          <input
            id={`${baseId}-all-comments`}
            type="checkbox"
            data-autofocus={rule ? '' : undefined}
            checked={matchAllComments}
            onChange={(event) => {
              setMatchAllComments(event.target.checked);
              setProblem(null);
            }}
            disabled={save.pending}
            aria-describedby={`${baseId}-all-comments-help`}
          />{' '}
          모든 댓글에 DM 보내기
        </label>
        <p id={`${baseId}-all-comments-help`} className="field-help">
          같은 사람에게 같은 게시물에서는 최초 한 번만 보내요. 다른 게시물에서는 각각 한 번 보낼 수 있어요. 규칙을
          고치거나 다시 만들어도, 연결을 해제했다 다시 연결해도 중복 발송하지 않아요.
        </p>
      </div>
      <div className="field">
        <label htmlFor={`${baseId}-keyword`}>키워드</label>
        <input
          id={`${baseId}-keyword`}
          className="input"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          maxLength={INSTAGRAM_DM_LIMITS.keywordMaxLength}
          placeholder={RULE_FIELD_COPY.keywordPlaceholder}
          autoComplete="off"
          data-field="keyword"
          aria-invalid={problem === 'keyword' || undefined}
          aria-describedby={`${baseId}-keyword-help`}
          disabled={save.pending || matchAllComments}
        />
        <p id={`${baseId}-keyword-help`} className="field-help">
          {matchAllComments
            ? '키워드와 관계없이 모든 댓글에 적용해요. 체크를 끄면 입력해 둔 키워드가 다시 적용돼요.'
            : `댓글에 이 말이 들어 있으면 DM을 보내요. 최대 ${INSTAGRAM_DM_LIMITS.keywordMaxLength}자예요.`}
        </p>
        {problem === 'keyword' ? <p className="form-error-inline">{PROBLEM_TEXT.keyword}</p> : null}
      </div>
      <div className="field">
        <label htmlFor={`${baseId}-message`}>보낼 메시지</label>
        <textarea
          id={`${baseId}-message`}
          className="input"
          rows={4}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={INSTAGRAM_DM_LIMITS.messageMaxLength}
          placeholder={RULE_FIELD_COPY.messagePlaceholder}
          data-field="message"
          aria-invalid={problem === 'message' || undefined}
          aria-describedby={`${baseId}-message-help`}
          disabled={save.pending}
        />
        <p id={`${baseId}-message-help`} className="field-help">
          <span className="ig-count">
            {messageLength}/{INSTAGRAM_DM_LIMITS.messageMaxLength}자
          </span>
        </p>
        {problem === 'message' ? <p className="form-error-inline">{PROBLEM_TEXT.message}</p> : null}
      </div>
      <div className="field">
        <label htmlFor={`${baseId}-reply-message`}>
          댓글 공개 답글 <span className="ig-optional">(선택)</span>
        </label>
        <input
          id={`${baseId}-reply-message`}
          aria-describedby={`${baseId}-reply-message-help`}
          className="input"
          value={replyMessage}
          onChange={(event) => setReplyMessage(event.target.value)}
          maxLength={INSTAGRAM_DM_LIMITS.replyMessageMaxLength}
          placeholder="예: DM으로 요청하신 링크를 보내드렸어요! 확인해 보세요 💌"
          autoComplete="off"
          disabled={save.pending}
        />
        <p id={`${baseId}-reply-message-help`} className="field-help">
          <span className="ig-count">
            {replyMessage.length}/{INSTAGRAM_DM_LIMITS.replyMessageMaxLength}자
          </span>{' '}
          · 적어 두시면 댓글에 먼저 공개 답글을 작성한 뒤 DM을 발송해요. 비워 두시면 DM만 보냅니다.
        </p>
      </div>
      <div className="form-actions edit-form-actions">
        <button type="button" className="secondary" onClick={onCancel} disabled={save.pending}>
          취소
        </button>
        <button type="submit" className="primary" disabled={save.pending}>
          {save.pending ? '저장 중…' : '저장'}
        </button>
      </div>
      <ActionStatus error={save.error} notice={save.notice} />
    </form>
  );
}
