const pptxgen = require('pptxgenjs');

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Copilot';
pptx.subject = 'MCP-powered Jira-to-GitHub test automation';
pptx.title = 'Solution Architecture';
pptx.company = 'SnowAppDemo';
pptx.lang = 'en-US';
pptx.theme = {
  headFontFace: 'Aptos Display',
  bodyFontFace: 'Arial',
  lang: 'en-US',
};

const slide = pptx.addSlide();
slide.background = { color: '071A2B' };

const C = {
  white: 'FFFFFF',
  muted: 'A9BED0',
  line: '3D6078',
  jira: '1868DB',
  mcp: '8B5CF6',
  agent: '00A6A6',
  playwright: 'F4B942',
  snow: '4CC3D9',
  report: '1FAD68',
  github: '24292F',
  panel: '102C40',
  panel2: '12364B',
};

function text(value, x, y, w, h, opts = {}) {
  slide.addText(value, {
    x, y, w, h, margin: 0,
    fontFace: opts.fontFace || 'Arial',
    fontSize: opts.fontSize || 14,
    bold: opts.bold || false,
    color: opts.color || C.white,
    align: opts.align || 'left',
    valign: opts.valign || 'mid',
    breakLine: false,
    fit: 'shrink',
    ...opts,
  });
}

function node({ x, y, w, h, icon, title, subtitle, color, detail }) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.08,
    fill: { color: C.panel },
    line: { color: color, width: 1.4 },
    shadow: { type: 'outer', color: '000000', blur: 2, angle: 45, distance: 1, opacity: 0.25 },
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: x + 0.18, y: y + 0.19, w: 0.48, h: 0.48,
    fill: { color }, line: { color, transparency: 100 },
  });
  text(icon, x + 0.18, y + 0.19, 0.48, 0.48, { fontSize: 13, bold: true, align: 'center' });
  text(title, x + 0.78, y + 0.16, w - 0.94, 0.27, { fontSize: 14, bold: true });
  text(subtitle, x + 0.78, y + 0.45, w - 0.94, 0.24, { fontSize: 9.5, color: C.muted });
  if (detail) text(detail, x + 0.18, y + 0.78, w - 0.36, h - 0.88, { fontSize: 9, color: C.muted, valign: 'top' });
}

function connector(x1, y1, x2, y2, color = C.line) {
  slide.addShape(pptx.ShapeType.line, {
    x: x1, y: y1, w: x2 - x1, h: y2 - y1,
    line: { color, width: 2, beginArrowType: 'none', endArrowType: 'triangle' },
  });
}

text('MCP-powered test automation', 0.65, 0.42, 5.2, 0.35, { fontSize: 27, bold: true });
text('Jira acceptance criteria → verified ServiceNow UI execution → GitHub delivery', 0.67, 0.84, 8.8, 0.25, { fontSize: 12.5, color: C.muted });
text('SOLUTION ARCHITECTURE', 10.4, 0.48, 2.2, 0.2, { fontSize: 9, bold: true, color: C.playwright, align: 'right', charSpacing: 1.2 });

slide.addShape(pptx.ShapeType.roundRect, {
  x: 0.65, y: 1.38, w: 12.0, h: 4.65,
  rectRadius: 0.08, fill: { color: '0A2235', transparency: 8 },
  line: { color: C.line, width: 0.8 },
});
text('CONTROL PLANE', 0.9, 1.62, 1.4, 0.2, { fontSize: 9, bold: true, color: C.muted, charSpacing: 1 });
text('BROWSER + DELIVERY PLANE', 0.9, 3.78, 2.3, 0.2, { fontSize: 9, bold: true, color: C.muted, charSpacing: 1 });

node({ x: 0.95, y: 2.02, w: 1.58, h: 1.18, icon: 'J', title: 'Jira', subtitle: 'Source of truth', color: C.jira, detail: 'Read one issue\\nPreserve criteria' });
node({ x: 2.92, y: 2.02, w: 1.58, h: 1.18, icon: 'M', title: 'MCP', subtitle: 'Tool gateway', color: C.mcp, detail: 'Read-only retrieval\\nStructured context' });
node({ x: 4.89, y: 2.02, w: 1.72, h: 1.18, icon: 'A', title: 'AI agents', subtitle: 'Orchestration', color: C.agent, detail: 'Codegen + execution\\nPolicy guardrails' });

node({ x: 1.15, y: 4.18, w: 1.8, h: 1.2, icon: 'P', title: 'Playwright', subtitle: 'Test runtime', color: C.playwright, detail: 'Headed browser\\nDynamic waits' });
node({ x: 3.4, y: 4.18, w: 2.0, h: 1.2, icon: 'S', title: 'ServiceNow', subtitle: 'Visible UI only', color: C.snow, detail: 'Incident form\\nOne submit action' });
node({ x: 5.9, y: 4.18, w: 1.8, h: 1.2, icon: 'R', title: 'Report', subtitle: 'Evidence layer', color: C.report, detail: 'Donut + filters\\nFailure snapshot' });
node({ x: 8.25, y: 4.18, w: 1.9, h: 1.2, icon: 'G', title: 'GitHub', subtitle: 'Delivery', color: C.github, detail: 'Review → commit\\nPush → verify' });

connector(2.53, 2.61, 2.92, 2.61, C.jira);
connector(4.5, 2.61, 4.89, 2.61, C.mcp);
connector(5.75, 3.2, 2.05, 4.18, C.agent);
connector(5.95, 3.2, 4.4, 4.18, C.agent);
connector(2.95, 4.78, 3.4, 4.78, C.playwright);
connector(5.4, 4.78, 5.9, 4.78, C.snow);
connector(7.7, 4.78, 8.25, 4.78, C.report);

slide.addShape(pptx.ShapeType.roundRect, {
  x: 10.55, y: 1.95, w: 1.7, h: 3.55, rectRadius: 0.06,
  fill: { color: '241B1B', transparency: 4 },
  line: { color: 'B84A4A', width: 1.1, dash: 'dash' },
});
text('SAFETY GATES', 10.78, 2.18, 1.25, 0.2, { fontSize: 9, bold: true, color: 'FF8C8C', align: 'center' });
text('✓ No API\\ncreation path', 10.78, 2.68, 1.25, 0.48, { fontSize: 10, bold: true, align: 'center' });
text('✓ Secrets stay\\nout of artifacts', 10.78, 3.45, 1.25, 0.56, { fontSize: 10, bold: true, align: 'center' });
text('✓ Stop on\\nuncertain submit', 10.78, 4.35, 1.25, 0.56, { fontSize: 10, bold: true, align: 'center' });

text('Read → generate → execute → evidence → deliver', 0.72, 6.55, 7.3, 0.28, { fontSize: 15, bold: true, color: C.white });
text('Every handoff is observable, policy-bound, and reversible until the final verified push.', 0.72, 6.88, 8.2, 0.22, { fontSize: 10.5, color: C.muted });
text('MCP = Model Context Protocol', 10.2, 6.82, 2.35, 0.18, { fontSize: 9, color: C.muted, align: 'right' });

slide.addNotes(`Narrative:
This architecture separates the control plane from the browser and delivery plane.
Jira remains the source of acceptance criteria. MCP provides a read-only tool gateway.
AI agents transform criteria into a Playwright test and enforce execution policy.
Playwright uses the visible ServiceNow UI only, with dynamic waits and one create action.
The report captures evidence, while GitHub is updated only after review and verification.

Animation suggestion:
Reveal nodes left to right with Morph. Pulse the active node during each stage.
Animate the safety-gate checks last to emphasize that delivery is conditional.`);

pptx.writeFile({ fileName: 'mcp-jira-to-github-solution-architecture.pptx' });
