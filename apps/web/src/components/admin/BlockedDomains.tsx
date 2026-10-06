'use client';

import {
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  type AddBlockedDomainRequest,
  type BlockedDomainView,
} from '@crelink/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { browserApi } from '../../lib/api/browser';
import { formatDate } from '../../lib/format';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';

/** 차단 도메인 목록·추가·삭제(R14). 저장 뒤 서버 화면을 새로 그립니다. */
export function BlockedDomains({ domains }: { domains: BlockedDomainView[] }) {
  const router = useRouter();
  const [domain, setDomain] = useState('');
  const [reason, setReason] = useState('');
  const { pending, error, notice, run } = useAction();

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: AddBlockedDomainRequest = { domain: domain.trim().toLowerCase(), reason: reason.trim() || null };
    const added = await run(async () => {
      await browserApi<BlockedDomainView[]>(CRELINK_API_PATHS.adminBlockedDomains, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      router.refresh();
    }, `${payload.domain}을(를) 차단했어요. 이 도메인과 하위 도메인의 기존 링크도 차단돼요.`);
    if (added) {
      setDomain('');
      setReason('');
    }
  }

  async function remove(target: BlockedDomainView) {
    if (!window.confirm(`${target.domain}을(를) 차단 목록에서 뺄까요? 이미 차단된 링크는 그대로예요.`)) return;
    await run(async () => {
      await browserApi<void>(CRELINK_API_PATHS.adminBlockedDomain(target.domain), { method: 'DELETE' });
      router.refresh();
    }, `${target.domain}을(를) 차단 목록에서 뺐어요. 이미 차단된 링크는 크리에이터 상세에서 하나씩 풀어 주세요.`);
  }

  return (
    <>
      <section className="card" aria-labelledby="add-domain-title">
        <h2 id="add-domain-title">도메인 추가</h2>
        <form className="form-stack" onSubmit={add}>
          <div className="field">
            <label htmlFor="blocked-domain">도메인</label>
            <input
              id="blocked-domain"
              className="input"
              required
              placeholder="example.com"
              autoCapitalize="none"
              spellCheck={false}
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              disabled={pending}
            />
            <p className="field-help">하위 도메인까지 함께 막아요.</p>
          </div>
          <div className="field">
            <label htmlFor="blocked-reason">사유 (선택)</label>
            <input
              id="blocked-reason"
              className="input"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={CRELINK_LIMITS.blockedReasonMax}
              disabled={pending}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="primary" disabled={pending}>
              {pending ? '처리 중…' : '차단 목록에 추가'}
            </button>
          </div>
        </form>
        <ActionStatus error={error} notice={notice} />
      </section>

      <section className="card" aria-labelledby="domain-list-title">
        <h2 id="domain-list-title">차단 목록</h2>
        {domains.length === 0 ? (
          <p className="empty-text">차단한 도메인이 없어요.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">도메인</th>
                  <th scope="col">사유</th>
                  <th scope="col">추가일</th>
                  <th scope="col">
                    <span className="visually-hidden">관리</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {domains.map((item) => (
                  <tr key={item.domain}>
                    <th scope="row">
                      <code>{item.domain}</code>
                    </th>
                    <td>{item.reason ?? '—'}</td>
                    <td>{formatDate(item.createdAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary danger"
                        onClick={() => remove(item)}
                        disabled={pending}
                        aria-label={`${item.domain} 차단 해제`}
                      >
                        빼기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
