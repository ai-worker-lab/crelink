'use client';

import {
  AI_OPERATOR_LIMITS,
  CRELINK_API_PATHS,
  type AiOperatorStatus,
  type SetAiOperatorPauseRequest,
} from '@crelink/shared';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { BrowserApiError, browserApi } from '../../lib/api/browser';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';

/**
 * AI 운영자 멈춤 스위치(R23 ⑥, 사람 운영자만). `BlockControl`처럼 켤 때만 선택 사유를 받고 확인 뒤 `PUT …/ai-operator/pause`.
 * 근거: docs/specs/crelink-ai-operator.md `화면 상태와 API 대응`.
 */
export function PauseControl({ paused, hasRunningRun }: { paused: boolean; hasRunningRun: boolean }) {
  const router = useRouter();
  const inputId = useId();
  const [reason, setReason] = useState('');
  const { pending, error, notice, run } = useAction();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = !paused;
    const question = next
      ? `AI 운영자를 멈출까요? 다음 실행부터 시작하지 않아요.${
          hasRunningRun
            ? ' 진행 중 실행의 크리링 쓰기는 바로 막혀요. main 머지·배포까지 확실히 막으려면 Orca 자동화도 꺼 주세요.'
            : ''
        }`
      : 'AI 운영자 멈춤을 풀까요? 다음 주기부터 다시 실행돼요.';
    if (!window.confirm(question)) return;
    const payload: SetAiOperatorPauseRequest = { paused: next, reason: next ? reason.trim() || null : null };
    const done = await run(
      async () => {
        await browserApi<AiOperatorStatus>(CRELINK_API_PATHS.adminAiOperatorPause, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        router.refresh();
      },
      next ? 'AI 운영자를 멈췄어요.' : '멈춤을 풀었어요.',
    );
    if (done) setReason('');
  }

  return (
    <form className="block-control" onSubmit={submit}>
      {paused ? null : (
        <div className="field">
          <label htmlFor={inputId}>멈춤 사유 (선택)</label>
          <input
            id={inputId}
            className="input"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={AI_OPERATOR_LIMITS.pausedReasonMax}
            disabled={pending}
          />
        </div>
      )}
      <button type="submit" className={paused ? 'secondary' : 'secondary danger'} disabled={pending}>
        {pending ? '처리 중…' : paused ? '멈춤 풀기' : 'AI 운영자 멈추기'}
      </button>
      <ActionStatus error={error} notice={notice} />
    </form>
  );
}

/**
 * AI 토큰 폐기(R23 ①, 사람 운영자만). 확인 뒤 `PUT …/tokens/{id}/revoke`. 마지막 유효 토큰이면 다음 실행부터 멈춘다고 알립니다.
 * 404 `api_token_not_found`면 오류 문구와 함께 화면을 새로 읽습니다.
 */
export function TokenRevokeButton({ tokenId, label, last }: { tokenId: string; label: string; last: boolean }) {
  const router = useRouter();
  const { pending, error, notice, run } = useAction();

  async function revoke() {
    const question = `'${label}' 토큰을 폐기할까요? 이 토큰으로는 바로 인증할 수 없어요.${
      last ? ' 쓸 수 있는 마지막 토큰이라 다음 실행부터 멈춥니다.' : ''
    }`;
    if (!window.confirm(question)) return;
    await run(async () => {
      try {
        await browserApi<AiOperatorStatus>(CRELINK_API_PATHS.adminApiTokenRevoke(tokenId), { method: 'PUT' });
      } catch (caught) {
        if (caught instanceof BrowserApiError && caught.code === 'api_token_not_found') router.refresh();
        throw caught;
      }
      router.refresh();
    }, '토큰을 폐기했어요.');
  }

  return (
    <div className="token-revoke">
      <button
        type="button"
        className="secondary danger"
        onClick={revoke}
        disabled={pending}
        aria-label={`${label} 토큰 폐기`}
      >
        {pending ? '처리 중…' : '폐기'}
      </button>
      <ActionStatus error={error} notice={notice} />
    </div>
  );
}
