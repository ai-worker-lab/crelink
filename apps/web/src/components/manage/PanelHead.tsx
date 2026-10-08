import { managerMenuLabel, type ManagerMenuSegment } from './menu';

/** 편집 패널 머리: 메뉴 이름(화면 제목 h1)과 한 줄 설명. */
export function PanelHead({ segment, help }: { segment: ManagerMenuSegment; help: string }) {
  return (
    <div className="panel-head">
      <h1 className="panel-title">{managerMenuLabel(segment)}</h1>
      <p className="panel-help">{help}</p>
    </div>
  );
}
