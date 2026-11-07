import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';

type StepRow = {
  title: string;
  duration: number;
  depth: number;
  failed: boolean;
};

type ReportRow = {
  suite: string;
  title: string;
  project: string;
  status: string;
  duration: number;
  startTime: string;
  incident: string;
  steps: StepRow[];
  error: string;
  snapshot?: string;
};

const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
const INCIDENT_PATTERN = /INC\d+/;
// Steps whose titles embed the typed value (for example Fill "<password>").
const VALUE_STEP_PATTERN = /^(fill|type|press|select option|check)\b/i;
const STEP_CATEGORIES = new Set(['pw:api', 'expect', 'test.step']);
const MAX_STEP_DEPTH = 1;

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

function safeStepTitle(title: string): string {
  return VALUE_STEP_PATTERN.test(title) ? title.replace(/"[^"]*"/g, '"•••"') : title;
}

function collectSteps(steps: readonly TestStep[], depth = 0): StepRow[] {
  const rows: StepRow[] = [];
  for (const step of steps) {
    if (!STEP_CATEGORIES.has(step.category)) {
      continue;
    }
    rows.push({
      title: safeStepTitle(step.title),
      duration: step.duration,
      depth,
      failed: Boolean(step.error),
    });
    if (depth < MAX_STEP_DEPTH) {
      rows.push(...collectSteps(step.steps, depth + 1));
    }
  }
  return rows;
}

function findIncident(result: TestResult, test: TestCase): string {
  const annotated = test.annotations.find((annotation) => annotation.type === 'incident');
  const fromAnnotation = annotated?.description?.match(INCIDENT_PATTERN)?.[0];
  if (fromAnnotation) {
    return fromAnnotation;
  }
  return stripAnsi(result.stdout.map((chunk) => chunk.toString()).join('')).match(INCIDENT_PATTERN)?.[0] ?? '';
}

function instanceHost(): string {
  try {
    return process.env.URL ? new URL(process.env.URL).host : '';
  } catch {
    return '';
  }
}

export default class SnowIncidentReporter implements Reporter {
  private readonly rows: ReportRow[] = [];
  private playwrightVersion = '';
  private startedAt = new Date();

  onBegin(config: FullConfig): void {
    this.playwrightVersion = config.version;
    this.startedAt = new Date();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.rows.push({
      suite: test.parent.title || 'Root',
      title: test.title,
      project: test.parent.project()?.name ?? 'unknown',
      status: result.status,
      duration: result.duration,
      startTime: result.startTime.toISOString(),
      incident: findIncident(result, test),
      steps: collectSteps(result.steps),
      error: stripAnsi(result.errors.map((error) => error.message ?? '').join('\n')),
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
      return { ...row, snapshot: undefined };
    });

    const passed = reportRows.filter((row) => row.status === 'passed').length;
    const failed = reportRows.filter((row) =>
      ['failed', 'timedOut', 'interrupted'].includes(row.status),
    ).length;
    const skipped = reportRows.filter((row) => row.status === 'skipped').length;
    const total = reportRows.length;
    const passPercent = total ? (passed / total) * 100 : 0;
    const failedPercent = total ? (failed / total) * 100 : 0;
    const incidents = reportRows.map((row) => row.incident).filter(Boolean);

    const meta = {
      generated: new Date().toLocaleString(),
      started: this.startedAt.toLocaleString(),
      duration: result.duration,
      status: result.status,
      node: process.version,
      os: `${os.platform()} ${os.release()}`,
      playwright: this.playwrightVersion,
      instance: instanceHost(),
      incidents,
    };
    const json = (value: unknown): string =>
      JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Snow Incident Test Report</title>
<style>
*{box-sizing:border-box}body{font-family:Segoe UI,Arial,sans-serif;background:#eef2f7;color:#172033;margin:0}
header{background:#1f2a44;color:#fff;padding:18px 32px;display:flex;justify-content:space-between;align-items:center}header h1{margin:0;font-size:22px}header span{opacity:.75;font-size:13px}
main{max-width:1200px;margin:24px auto;padding:0 24px}
.cards{display:grid;grid-template-columns:260px repeat(4,1fr);gap:16px;margin-bottom:16px}
.card{background:#fff;border-radius:10px;padding:18px;box-shadow:0 1px 3px rgba(20,30,50,.08)}
.donutwrap{display:flex;align-items:center;justify-content:center}
.donut{width:150px;height:150px;border-radius:50%;background:conic-gradient(#18864b 0 ${passPercent}%,#c0392b ${passPercent}% ${passPercent + failedPercent}%,#9aa5b1 ${passPercent + failedPercent}% 100%);position:relative}
.donut:after{content:'${Math.round(passPercent)}%';position:absolute;inset:28px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700}
.kpi .n{font-size:34px;font-weight:700}.kpi .l{color:#5b6677;font-size:13px;text-transform:uppercase;letter-spacing:.04em}
.pass .n{color:#18864b}.fail .n{color:#c0392b}.skip .n{color:#8a6500}
.info{display:grid;grid-template-columns:repeat(4,1fr);gap:8px 24px;font-size:13px}.info b{display:block;color:#5b6677;font-weight:600;font-size:11px;text-transform:uppercase}
.incident{font-size:15px;margin-top:12px}.incident code{background:#e8f5ee;color:#18864b;padding:3px 8px;border-radius:5px;font-weight:700}
.controls{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0}.controls input,.controls select{padding:10px;border:1px solid #c8d0dc;border-radius:6px;background:#fff}.controls input{min-width:240px}
details{background:#fff;border-radius:10px;margin-bottom:10px;box-shadow:0 1px 3px rgba(20,30,50,.08)}
summary{cursor:pointer;padding:14px 18px;display:grid;grid-template-columns:90px 1fr 140px 110px 110px;gap:12px;align-items:center;list-style:none}
summary::-webkit-details-marker{display:none}.badge{font-weight:700;text-transform:uppercase;font-size:12px;padding:4px 10px;border-radius:12px;text-align:center}
.b-passed{background:#e8f5ee;color:#18864b}.b-failed,.b-timedOut,.b-interrupted{background:#fdecea;color:#c0392b}.b-skipped{background:#fff4d6;color:#8a6500}
.body{padding:0 18px 18px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:8px;border-bottom:1px solid #e6eaf0}th{background:#f3f6fa}
.step-failed{color:#c0392b;font-weight:600}pre{white-space:pre-wrap;background:#fdf3f2;padding:12px;border-radius:6px;font-size:12px}
.empty{padding:32px;text-align:center;color:#5b6677}a{color:#1f6feb}
@media(max-width:900px){.cards{grid-template-columns:1fr 1fr}.info{grid-template-columns:1fr 1fr}summary{grid-template-columns:80px 1fr}}
</style>
</head>
<body>
<header><h1>Snow Incident Test Report</h1><span id="generated"></span></header>
<main>
<section class="cards">
<div class="card donutwrap"><div class="donut" role="img" aria-label="Pass fail donut chart"></div></div>
<div class="card kpi"><div class="n" id="k-total"></div><div class="l">Tests</div></div>
<div class="card kpi pass"><div class="n" id="k-pass"></div><div class="l">Passed</div></div>
<div class="card kpi fail"><div class="n" id="k-fail"></div><div class="l">Failed</div></div>
<div class="card kpi skip"><div class="n" id="k-skip"></div><div class="l">Skipped</div></div>
</section>
<section class="card"><div class="info" id="info"></div><div class="incident" id="incidents"></div></section>
<div class="controls">
<input id="search" placeholder="Filter by test title">
<select id="status"><option value="">All statuses</option><option>passed</option><option>failed</option><option>timedOut</option><option>skipped</option></select>
<select id="project"><option value="">All projects</option></select>
<select id="suite"><option value="">All suites</option></select>
<select id="duration"><option value="">All durations</option><option value="short">Under 1 second</option><option value="medium">1–10 seconds</option><option value="long">Over 10 seconds</option></select>
</div>
<div id="results"></div>
</main>
<script>
const data=${json(reportRows)};const meta=${json(meta)};
const counts={total:${total},pass:${passed},fail:${failed},skip:${skipped}};
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
$('#generated').textContent='Generated '+meta.generated;
$('#k-total').textContent=counts.total;$('#k-pass').textContent=counts.pass;$('#k-fail').textContent=counts.fail;$('#k-skip').textContent=counts.skip;
const info=[['Run status',meta.status.toUpperCase()],['Started',meta.started],['Total duration',(meta.duration/1000).toFixed(1)+' s'],['ServiceNow instance',meta.instance||'—'],['Playwright',meta.playwright],['Node',meta.node],['OS',meta.os]];
$('#info').innerHTML=info.map(([k,v])=>'<div><b>'+esc(k)+'</b>'+esc(v)+'</div>').join('');
$('#incidents').innerHTML=meta.incidents.length?'Incident created: '+meta.incidents.map(i=>'<code>'+esc(i)+'</code>').join(' '):'No incident number recorded in this run.';
const uniq=k=>[...new Set(data.map(x=>x[k]))];
uniq('project').forEach(x=>$('#project').insertAdjacentHTML('beforeend','<option>'+esc(x)+'</option>'));
uniq('suite').forEach(x=>$('#suite').insertAdjacentHTML('beforeend','<option>'+esc(x)+'</option>'));
const durOk=v=>{const d=$('#duration').value;return !d||(d==='short'&&v<1000)||(d==='medium'&&v>=1000&&v<=10000)||(d==='long'&&v>10000)};
function row(x){
const steps=x.steps.length?'<table><thead><tr><th>Step</th><th>Duration (ms)</th></tr></thead><tbody>'+x.steps.map(s=>'<tr><td class="'+(s.failed?'step-failed':'')+'" style="padding-left:'+(8+s.depth*24)+'px">'+esc(s.title)+'</td><td>'+s.duration+'</td></tr>').join('')+'</tbody></table>':'<div class="empty">No steps recorded.</div>';
const err=x.error?'<h4>Failure</h4><pre>'+esc(x.error)+'</pre>':'';
const snap=x.snapshot?'<p><a href="'+esc(x.snapshot)+'">View failure snapshot</a></p>':'';
return '<details><summary><span class="badge b-'+esc(x.status)+'">'+esc(x.status)+'</span><span><b>'+esc(x.title)+'</b><br><small>'+esc(x.suite)+'</small></span><span>'+esc(x.incident||'—')+'</span><span>'+esc(x.project)+'</span><span>'+x.duration+' ms</span></summary><div class="body">'+steps+err+snap+'</div></details>';
}
function render(){
const q=$('#search').value.toLowerCase();
const rows=data.filter(x=>(!q||x.title.toLowerCase().includes(q))&&(!$('#status').value||x.status===$('#status').value)&&(!$('#project').value||x.project===$('#project').value)&&(!$('#suite').value||x.suite===$('#suite').value)&&durOk(x.duration));
$('#results').innerHTML=rows.length?rows.map(row).join(''):'<div class="card empty">No tests match the filters.</div>';
}
['#search','#status','#project','#suite','#duration'].forEach(s=>$(s).addEventListener('input',render));render();
</script>
</body></html>`;

    fs.writeFileSync(path.join(reportDirectory, 'index.html'), html, 'utf8');
    process.stdout.write(`Snow incident report: ${path.join(reportDirectory, 'index.html')}\n`);
  }
}
