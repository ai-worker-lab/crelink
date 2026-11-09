// ego-browser 런타임에서 시나리오 목록을 돌리는 공통 틀. 결과 파일·최소 검사 수·정리를 시험마다 같게 맞춥니다.
/* global console */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  browserUserAgent,
  clearSessionCookie,
  ConsoleWatch,
  injectCss,
  injectedSheetCount,
  RecordedFailure,
  Report,
  SESSION_COOKIE,
  sessionCookies,
  startFramePump,
  stopFramePump,
} from './browser.mjs';

/**
 * run은 시나리오 함수({ task, page, config, report, watch, desktop, name, must })입니다. setup이 돌려준 teardown은 끝날 때 한 번 실행합니다.
 * 요소를 못 찾는 등의 예외는 시나리오 실패로 기록하고, 검사가 minChecks에 못 미치면 다시 실패로 기록합니다.
 */
export async function runSuite({ taskSpace, config, scenarios, minChecks, run, setup }) {
  const started = Date.now();
  const report = new Report();
  await mkdir(config.outputDir, { recursive: true });
  const task = await taskSpace(config.taskSpaceName);
  let page;
  let teardown;
  try {
    // 새 TaskSpace의 p1은 chrome://newtab이라 끝나지 않은 요청이 ego의 networkidle 추적에 남습니다(0206). 빈 탭에서 시작합니다.
    page = await task.newPage();
    console.log(`[ego] TaskSpace ${task.spaceId} (${scenarios.length}개 시나리오)`);
    if (config.fault === 'outside-scenario') throw new Error('EGO_TEST_FAULT로 일으킨 시나리오 밖 예외');
    const desktop = { mobile: false, hasTouch: false, deviceScaleFactor: 1, userAgent: await browserUserAgent(page) };
    const watch = new ConsoleWatch(page, config);
    await watch.start();
    await startFramePump(page);
    if (config.injectCss) {
      await injectCss(page, config.injectCss);
      console.log(`[ego] CSS 주입 ${await injectedSheetCount(page)}개 적용`);
    }
    const context = { task, page, config, report, watch, desktop };
    teardown = await setup?.(context);

    for (const scenario of scenarios) {
      const name = scenario.name;
      const scenarioStarted = Date.now();
      const checksBefore = report.passed + report.failed;
      try {
        await run(Object.assign(context, { scenario, name, must: (ok, detail) => report.must(name, ok, detail) }));
      } catch (error) {
        if (!(error instanceof RecordedFailure)) report.record(name, false, `시나리오 오류: ${error.message}`);
        await page
          .screenshot({ path: join(config.outputDir, `${name.replace(/\W+/g, '-')}-failure.png`) })
          .catch(() => {});
        await watch.drain().catch(() => {});
      }
      const checks = report.passed + report.failed - checksBefore;
      report.record(name, checks >= minChecks[name], `검사 ${checks}개 >= 최소 ${minChecks[name]}개`);
      console.log(`[ego] ${name} ${((Date.now() - scenarioStarted) / 1000).toFixed(1)}s`);
    }
  } catch (error) {
    report.record('run', false, `실행 오류: ${error.message}`);
  } finally {
    if (teardown) await teardown().catch((error) => report.record('cleanup', false, `정리 실패: ${error.message}`));
    await releaseBrowser({ task, page, config, report });
  }

  const seconds = (Date.now() - started) / 1000;
  console.log(`[ego] 결과: 통과 ${report.passed}, 실패 ${report.failed}, ${seconds.toFixed(1)}s`);
  for (const failure of report.failures) console.log(`[ego] 실패: ${failure}`);
  await mkdir(dirname(config.resultPath), { recursive: true });
  await writeFile(
    config.resultPath,
    JSON.stringify({ passed: report.passed, failed: report.failed, failures: report.failures, seconds }, null, 2),
  );
  return report.failed === 0 ? 0 : 1;
}

/** 어떤 경로로 끝나든 세션 쿠키와 TaskSpace를 정리합니다. 정리 실패는 실패로 보고하되 나머지 정리를 막지 않습니다. */
async function releaseBrowser({ task, page, config, report }) {
  if (page) {
    await stopFramePump(page).catch(() => {});
    try {
      await clearSessionCookie(page, config);
      const remaining = await sessionCookies(page, config);
      report.record('cleanup', remaining.length === 0, `남은 ${SESSION_COOKIE} ${remaining.length}개`);
    } catch (error) {
      report.record('cleanup', false, `세션 쿠키 정리 실패: ${error.message}`);
    }
  }
  try {
    await task.finish({ keep: [] });
  } catch (error) {
    report.record('cleanup', false, `TaskSpace 정리 실패: ${error.message}`);
  }
}
