const root = document.querySelector('#root');
let catalogue = [];
let selected = 'bracket';
let controller;

const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

root.innerHTML = `
  <a class="skip-link" href="#workbench">Skip to workbench</a>
  <header class="topbar">
    <div class="brand"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="m5 10 11-5 11 5v13l-11 5-11-5zm0 0 11 5 11-5M16 15v13" /></svg><span>SolidDraft<span class="brand-dot">.</span></span></div>
    <span class="edition">WORKBENCH <span class="version">v0.1</span></span>
  </header>
  <main id="workbench" tabindex="-1">
    <div class="intro"><div><p class="eyebrow">FROM AN IDEA TO A PART</p><h1>A place to shape<br>your next build.</h1><p class="intro-copy">Start with a trusted template. Make room for your idea.</p></div><p class="intro-note">Brackets. Enclosures. Spacers.<br><span>Small parts, useful possibilities.</span></p></div>
    <div class="workbench">
      <section class="editor" aria-labelledby="setup-title">
        <div class="section-heading"><span class="step">01</span><h2 id="setup-title">Choose your starting point</h2></div>
        <p class="helper">Three focused templates for everyday builds.</p>
        <div class="catalog-status" role="status" aria-live="polite"></div>
        <div class="templates" role="group" aria-label="Part template"></div>
        <div class="request"><label for="description">Describe your part <span>SESSION DRAFT</span></label><textarea id="description" maxlength="1000" rows="4" placeholder="For example, a bracket to mount a small shelf, with two screw holes…" aria-describedby="draft-help draft-count"></textarea><div class="field-footer"><span id="draft-help">Use millimetres for dimensions. Draft clears on reload.</span><span id="draft-count">0/1000</span></div></div>
        <button class="generate" disabled aria-describedby="generation-note">Generate part <span aria-hidden="true">↗</span></button>
        <p id="generation-note" class="availability">CAD generation and STL export are coming in the next build stages.</p>
      </section>
      <section class="preview" aria-labelledby="preview-title">
        <div class="preview-heading"><h2 id="preview-title">Template reference</h2><span class="preview-tag">STATIC ILLUSTRATION</span></div>
        <div class="canvas"></div>
        <div class="part-caption" aria-live="polite"></div>
        <p class="preview-note">Illustrative dimensions only. Generated geometry, editing and validation will be added in later tasks.</p>
      </section>
    </div>
    <footer><p id="connection" role="status"></p><span>BUILT FOR THE THINGS YOU MAKE.</span></footer>
  </main>`;

const shapes = {
  bracket: `<path class="part-side" d="m119 222 111 55 109-57-110-54z"/><path class="part-top" d="m119 115 31-16 110 55-31 16z"/><path class="part-front" d="m119 115 110 55v90l-110-55z"/><path class="part-top" d="m229 260 110-57v17l-109 57-111-55v-17z"/><path class="part-side" d="m229 170 31-16v90l-31 16z"/><ellipse class="part-hole" cx="174" cy="184" rx="12" ry="17" transform="rotate(-26 174 184)"/><ellipse class="part-hole" cx="282" cy="225" rx="14" ry="7" transform="rotate(-26 282 225)"/>`,
  enclosure: `<path class="part-side" d="m100 141 141-65 110 57v109l-139 70-112-59z"/><path class="part-top" d="m100 141 141-65 110 57-139 70zm25 1 116-54 85 45-114 57z" fill-rule="evenodd"/><path class="part-front" d="m100 141 112 62v109l-112-59z"/><path class="part-hole" d="m125 142 87 48 114-57v87l-114 55-87-45z"/><path d="m212 190 0 85m-87-45 114-56 87 46" fill="none"/>`,
  spacer: `<path class="part-front" d="M126 131v106c0 61 188 61 188 0V131z"/><ellipse class="part-top" cx="220" cy="131" rx="94" ry="46"/><ellipse class="part-hole" cx="220" cy="131" rx="30" ry="15"/><path d="M146 154v83m148-83v83" fill="none" opacity=".45"/>`,
};

function showPreview(part) {
  root.querySelector('.canvas').innerHTML = part ? `
    <svg class="part-drawing" viewBox="0 0 440 330" role="img" aria-label="Static ${escape(part.name)} template illustration; not generated CAD">
      <g class="drawing-lines" stroke-linejoin="round" stroke-width="2">${shapes[part.id]}</g>
      <g class="dimension-lines" fill="none" stroke-width="1"><path d="M100 290h240m-240-5v10m240-10v10M365 90v170m-5-170h10m-10 170h10"/></g>
      <g class="axis" stroke-width="2"><path d="M44 270v-30m0 30 26 14m-26-14-24 14"/><text x="40" y="230">Z</text><text x="74" y="292">X</text><text x="10" y="298">Y</text></g>
    </svg><span class="canvas-label">REFERENCE VIEW / MM</span>` : '<p class="canvas-empty">Your reference appears when the template catalogue is available.</p>';
  root.querySelector('.part-caption').innerHTML = part ? `<div><p class="eyebrow">TEMPLATE / ${escape(part.id.toUpperCase())}</p><h3>${escape(part.reference)}</h3></div><span class="measurement">${escape(part.dimensions)}</span>` : '<div><p class="eyebrow">NO TEMPLATE SELECTED</p><h3>Your starting point appears here</h3></div>';
}

function selectTemplate(id) {
  selected = id;
  for (const button of root.querySelectorAll('[data-template]')) {
    const chosen = button.dataset.template === id;
    button.classList.toggle('selected', chosen);
    button.setAttribute('aria-pressed', String(chosen));
    button.querySelector('.selection-mark').textContent = chosen ? '●' : '○';
  }
  showPreview(catalogue.find(item => item.id === id));
}

async function loadCatalogue() {
  controller?.abort();
  controller = new AbortController();
  const request = controller;
  const timeout = setTimeout(() => request.abort(), 10000);
  const status = root.querySelector('.catalog-status');
  const templates = root.querySelector('.templates');
  status.textContent = 'Connecting to the workbench…';
  templates.replaceChildren();
  templates.setAttribute('aria-busy', 'true');
  showPreview(null);
  root.querySelector('#connection').textContent = 'Connecting to API';
  try {
    const [health, response] = await Promise.all([
      fetch('/api/health', { signal: request.signal }),
      fetch('/api/templates', { signal: request.signal }),
    ]);
    if (!health.ok || !response.ok || (await health.json()).status !== 'ok') throw new Error('API unavailable');
    const data = await response.json();
    if (!Array.isArray(data.templates) || data.templates.some(item => !Object.hasOwn(shapes, item.id) || ['name', 'description', 'reference', 'dimensions'].some(key => typeof item[key] !== 'string'))) throw new Error('Invalid catalogue');
    catalogue = data.templates;
    status.textContent = '';
    if (!catalogue.length) {
      status.innerHTML = '<p>No templates are available yet.</p><button data-retry>Refresh templates</button>';
      root.querySelector('#connection').textContent = 'API connected · catalogue empty';
      return;
    }
    templates.innerHTML = catalogue.map((item, index) => `<button class="template" data-template="${escape(item.id)}" aria-pressed="false"><span class="template-number">0${index + 1}</span><span><strong>${escape(item.name)}</strong><small>${escape(item.description)}</small></span><span class="selection-mark" aria-hidden="true">○</span></button>`).join('');
    selectTemplate(catalogue.some(item => item.id === selected) ? selected : catalogue[0].id);
    root.querySelector('#connection').innerHTML = '<span class="status-dot connected" aria-hidden="true"></span>API connected';
  } catch {
    status.innerHTML = '<div class="error"><p>Could not connect to the API. Check that the server is running, then try again.</p><button data-retry>Retry connection</button></div>';
    root.querySelector('#connection').textContent = 'API unavailable';
  } finally {
    clearTimeout(timeout);
    templates.setAttribute('aria-busy', 'false');
  }
}

root.addEventListener('click', event => {
  const template = event.target.closest('[data-template]');
  if (template) selectTemplate(template.dataset.template);
  if (event.target.closest('[data-retry]')) void loadCatalogue();
});
root.querySelector('#description').addEventListener('input', event => {
  root.querySelector('#draft-count').textContent = `${event.target.value.length}/1000`;
});
void loadCatalogue();
