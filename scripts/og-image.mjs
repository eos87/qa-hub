// Renders the 1200x630 link-preview card (og.png) that Slack and other unfurlers show.
// Unfurlers do not render SVG, so the card is drawn as SVG and rasterised with resvg.
import fs from 'node:fs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function ogSvg({metrics: M, date, tests}) {
  const auto = M.complete + M.partial + M.undoc_code;
  const pct = Math.round(auto / M.real * 100);
  const segs = [
    [M.complete, '#3fb950', 'Complete'],
    [M.partial, '#58a6ff', 'Partial'],
    [M.undoc_code, '#a371f7', 'Code, no case text'],
    [M.manual_doc, '#f0616d', 'Not automated'],
    [M.manual_empty, '#7d8899', 'Empty page'],
  ];
  const barX = 80, barY = 400, barW = 1040, barH = 28;
  let x = barX;
  const bar = segs.map(([n, c]) => {
    const w = n / M.real * barW;
    const r = `<rect x="${x.toFixed(1)}" y="${barY}" width="${w.toFixed(1)}" height="${barH}" fill="${c}"/>`;
    x += w;
    return r;
  }).join('');
  let lx = barX;
  const legend = segs.map(([n, c, l]) => {
    const t = `${l} ${n}`;
    const g = `<circle cx="${lx + 7}" cy="472" r="7" fill="${c}"/><text x="${lx + 22}" y="479" class="leg">${esc(t)}</text>`;
    lx += 22 + t.length * 10 + 30;
    return g;
  }).join('');
  const font = "Inter, 'Helvetica Neue', Helvetica, Arial, 'DejaVu Sans', sans-serif";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs>
  <radialGradient id="g1" cx="10%" cy="0%" r="70%"><stop offset="0" stop-color="#7aa2ff" stop-opacity=".22"/><stop offset="1" stop-color="#7aa2ff" stop-opacity="0"/></radialGradient>
  <radialGradient id="g2" cx="95%" cy="0%" r="60%"><stop offset="0" stop-color="#a78bff" stop-opacity=".16"/><stop offset="1" stop-color="#a78bff" stop-opacity="0"/></radialGradient>
  <clipPath id="bar"><rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="14"/></clipPath>
  <style>
    text{font-family:${font};fill:#e6edf7}
    .kick{font-size:26px;font-weight:600;fill:#8b97a8;letter-spacing:.5px}
    .big{font-size:132px;font-weight:700}
    .of{font-size:56px;font-weight:600;fill:#8b97a8}
    .cap{font-size:32px;font-weight:500;fill:#c3ccd9}
    .stat{font-size:44px;font-weight:700}
    .statl{font-size:22px;fill:#8b97a8}
    .leg{font-size:19px;fill:#c3ccd9}
    .foot{font-size:20px;fill:#8b97a8}
  </style>
</defs>
<rect width="1200" height="630" fill="#0b0e14"/>
<rect width="1200" height="630" fill="url(#g1)"/><rect width="1200" height="630" fill="url(#g2)"/>
<text x="80" y="100" class="kick">SUPERDESK QA AUTOMATION COVERAGE</text>
<text x="76" y="250" class="big">${pct}%</text>
<text x="80" y="320" class="cap">${auto} of ${M.real} QA cases have e2e automation</text>
<text x="1120" y="190" class="stat" text-anchor="end">${M.complete}</text>
<text x="1120" y="222" class="statl" text-anchor="end">fully automated cases</text>
<text x="1120" y="300" class="stat" text-anchor="end">${tests ?? '-'}</text>
<text x="1120" y="332" class="statl" text-anchor="end">e2e test definitions</text>
<rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="14" fill="#212b3a"/>
<g clip-path="url(#bar)">${bar}</g>
${legend}
<text x="80" y="570" class="foot">Confluence "Superdesk QA Tests" mapped to Playwright specs · updated ${esc(date)}</text>
</svg>`;
}

// resvg is a devDependency installed in CI; a plain local build without it just skips the image.
export async function writeOgPng(file, data) {
  let Resvg;
  try { ({Resvg} = await import('@resvg/resvg-js')); } catch {
    console.error('[build] @resvg/resvg-js not installed; skipping og.png');
    return false;
  }
  const png = new Resvg(ogSvg(data), {
    fitTo: {mode: 'width', value: 1200},
    font: {loadSystemFonts: true, defaultFontFamily: 'Inter'},
  }).render().asPng();
  fs.writeFileSync(file, png);
  return true;
}
