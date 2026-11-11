'use client';

import type { ReactNode } from 'react';
import { ActionStatus } from '../../ActionStatus';
import { EditSheet } from '../EditSheet';

/**
 * 되돌리기 어려운 동작의 확인 시트(연결 해제·규칙 삭제). 첫 초점은 `취소`이고 닫힌 뒤 초점 복귀는 여는 쪽이 맡습니다.
 */
export function ConfirmSheet({
  title,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  confirmLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <EditSheet title={title} pending={pending} onDismiss={onCancel} className="centered-sheet">
      <div className="form-stack">
        {children}
        <ActionStatus error={error} />
        <div className="form-actions edit-form-actions">
          <button type="button" className="secondary" data-autofocus disabled={pending} onClick={onCancel}>
            취소
          </button>
          <button type="button" className="secondary danger" disabled={pending} onClick={onConfirm}>
            {pending ? '처리 중…' : confirmLabel}
          </button>
        </div>
      </div>
    </EditSheet>
  );
}
