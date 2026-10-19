"use client";

import { useActionState, useState } from "react";
import { Notice, btnCls, btnLineCls } from "@/components/admin";
import { resetRun, runNow, type MonitorState } from "./actions";

export function RunControls({ canReset }: { canReset: boolean }) {
  const [runState, runAction, running] = useActionState<MonitorState>(runNow, undefined);
  const [resetState, resetAction, resetting] = useActionState<MonitorState>(resetRun, undefined);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <form action={runAction}>
          <button disabled={running || resetting} className={btnCls}>{running ? "매칭 실행 중…" : "지금 매칭 실행"}</button>
        </form>
        {canReset && !confirm && (
          <button type="button" onClick={() => setConfirm(true)} disabled={running || resetting} className={btnLineCls}>
            최근 실행 되돌리기 (시연용)
          </button>
        )}
        {confirm && (
          <form action={resetAction} className="flex items-center gap-2 text-sm">
            <span>테이블·단체방·알림이 지워지고 신청이 매칭 대기로 돌아가요.</span>
            <button className={btnLineCls} disabled={resetting}>{resetting ? "되돌리는 중…" : "되돌리기"}</button>
            <button type="button" className="underline" onClick={() => setConfirm(false)}>취소</button>
          </form>
        )}
      </div>
      <Notice state={runState} />
      <Notice state={resetState} />
    </div>
  );
}
