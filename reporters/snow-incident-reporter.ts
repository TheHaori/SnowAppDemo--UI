import fs from 'node:fs';
import path from 'node:path';
import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

type ReportRow = {
  title: string;
  project: string;
  status: string;
  duration: number;
  error: string;
  snapshot?: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export default class SnowIncidentReporter implements Reporter {
  private readonly rows: ReportRow[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    this.rows.push({
      title: test.titlePath().join(' › '),
      project: test.parent.project()?.name ?? 'unknown',
      status: result.status,
      duration: result.duration,
      error: result.errors.map((error) => error.message ?? '').join('\n'),
      snapshot: result.attachments.find(
        (attachment) =>
          attachment.name === 'failure-snapshot.png' && Boolean(attachment.path),
      )?.path,
    });
  }

  onEnd(result: FullResult): void {
    const reportDirectory = path.resolve('snow-report');
    fs.mkdirSync(reportDirectory, { recursive: true });

    const reportRows = this.rows.map((row, index) => {
      if (row.snapshot && fs.existsSync(row.snapshot)) {
        const snapshotName = `failure-snapshot-${index}.png`;
        fs.copyFileSync(row.snapshot, path.join(reportDirectory, snapshotName));
        return { ...row, snapshot: snapshotName };
      }
      return row;
    });
    const rows = JSON.stringify(reportRows).replaceAll('</', '<\\/');
    const passed = reportRows.filter((row) => row.status === 'passed').length;
    const failed = reportRows.filter((row) =>
      ['failed', 'timedOut', 'interrupted'].includes(row.status),
    ).length;
    const skipped = reportRows.filter((row) => row.status === 'skipped').length;
    const total = reportRows.length;
    const passPercent = total ? (passed / total) * 100 : 0;
    const failedPercent = total ? (failed / total) * 100 : 0;

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Snow Incident Test Report</title>
<style>
body{font-family:Segoe UI,Arial,sans-serif;background:#f4f7fb;color:#172033;margin:0;padding:24px}
main{max-width:1180px;margin:auto}.summary{display:flex;gap:24px;align-items:center;background:#fff;padding:24px;border-radius:12px}
.donut{width:150px;height:150px;border-radius:50%;background:conic-gradient(#18864b 0 ${passPercent}%,#c0392b ${passPercent}% ${passPercent + failedPercent}%,#9aa5b1 ${passPercent + failedPercent}% 100%);position:relative}
.donut:after{content:'';position:absolute;inset:30px;background:#fff;border-radius:50%}.metric{font-size:28px;font-weight:700}.controls{display:flex;gap:12px;margin:20px 0}.controls input,.controls select{padding:10px;border:1px solid #c8d0dc;border-radius:6px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden}th,td{text-align:left;padding:12px;border-bottom:1px solid #e6eaf0}th{background:#edf2f8}.passed{color:#18864b}.failed,.timedOut,.interrupted{color:#c0392b}.skipped{color:#8a6500}pre{white-space:pre-wrap}
</style>
</head>
<body><main>
<h1>Snow Incident Test Report</h1>
<section class="summary"><div class="donut" aria-label="Pass fail donut chart"></div>
<div><div class="metric">${escapeHtml(result.status.toUpperCase())}</div><div>${total} tests · ${passed} passed · ${failed} failed · ${skipped} skipped</div></div></section>
<div class="controls"><input id="search" placeholder="Filter tests"><select id="status"><option value="">All statuses</option><option>passed</option><option>failed</option><option>timedOut</option><option>skipped</option></select><select id="project"><option value="">All projects</option></select><select id="duration"><option value="">All durations</option><option value="short">Under 1 second</option><option value="medium">1–10 seconds</option><option value="long">Over 10 seconds</option></select></div>
<table><thead><tr><th>Test</th><th>Project</th><th>Status</th><th>Duration (ms)</th><th>Failure</th><th>Snapshot</th></tr></thead><tbody id="results"></tbody></table>
</main>
<script>
const data=${rows};const search=document.querySelector('#search');const status=document.querySelector('#status');const project=document.querySelector('#project');const duration=document.querySelector('#duration');const body=document.querySelector('#results');
[...new Set(data.map(x=>x.project))].forEach(x=>project.insertAdjacentHTML('beforeend','<option>'+x+'</option>'));
function matchesDuration(value){return !duration.value||(duration.value==='short'&&value<1000)||(duration.value==='medium'&&value>=1000&&value<=10000)||(duration.value==='long'&&value>10000)}
function render(){const q=search.value.toLowerCase();body.innerHTML=data.filter(x=>(!q||x.title.toLowerCase().includes(q))&&(!status.value||x.status===status.value)&&(!project.value||x.project===project.value)&&matchesDuration(x.duration)).map(x=>'<tr><td>'+x.title+'</td><td>'+x.project+'</td><td class="'+x.status+'">'+x.status+'</td><td>'+x.duration+'</td><td><pre>'+x.error+'</pre></td><td>'+(x.snapshot?'<a href="'+x.snapshot+'">View snapshot</a>':'—')+'</td></tr>').join('')}
[search,status,project,duration].forEach(x=>x.addEventListener('input',render));render();
</script></body></html>`;

    fs.writeFileSync(path.join(reportDirectory, 'index.html'), html, 'utf8');
    process.stdout.write(`Snow incident report: ${path.join(reportDirectory, 'index.html')}\n`);
  }
}
