const root = document.querySelector('#root');
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const state = { templates: [], project: null, draft: null, baseline: '', viewedRevision: null, busy: false, historyBusy: false, listBusy: false, route: '', projects: [], revisions: [], total: 0, revisionTotal: 0 };
let routeToken = 0, listToken = 0, historyToken = 0, dialogResolve;
const $ = selector => root.querySelector(selector);
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" class="icon" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${({ plus: '<path d="M12 5v14M5 12h14"/>', arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', check: '<path d="m5 12 4 4L19 6"/>', save: '<path d="M5 3h12l4 4v14H3V3zm2 0v6h10V3M7 21v-8h10v8"/>', cube: '<path d="m3 7 9-5 9 5v10l-9 5-9-5zm0 0 9 5 9-5M12 12v10"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', folder: '<path d="M3 6h7l2 3h9v11H3z"/>' })[name] || ''}</svg>`;
const date = value => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const template = () => state.templates.find(item => item.id === state.draft?.templateId);
const snapshot = () => JSON.stringify(state.draft);
const dirty = () => Boolean(state.draft && snapshot() !== state.baseline);
const projectPath = id => `/api/projects/${encodeURIComponent(id)}`;

root.innerHTML = `
  <a class="skip-link" href="#content">Skip to content</a>
  <header class="topbar"><a class="brand" href="#/new/bracket" data-nav>${icon('cube')}<span>SolidDraft<span class="brand-dot">.</span></span></a>
    <nav aria-label="Main navigation"><a href="#/new/bracket" data-nav data-tab="workbench">Workbench</a><a href="#/parts" data-nav data-tab="parts">Saved parts</a></nav>
    <span class="edition">LOCAL WORKBENCH <span class="version">v0.1</span></span></header>
  <main id="content" tabindex="-1"><div id="page" aria-busy="true"><div class="boot-state"><p class="eyebrow">OPENING YOUR WORKBENCH</p><h1>Getting the templates ready…</h1><p>Connecting to the local API.</p></div></div></main>
  <footer><p id="connection" role="status">Connecting to API…</p><span>SMALL PARTS. USEFUL POSSIBILITIES.</span></footer>
  <div id="announcement" class="sr-only" role="status" aria-live="polite"></div>
  <dialog id="confirm-dialog" aria-labelledby="dialog-title" aria-describedby="dialog-copy"><form id="dialog-form"><h2 id="dialog-title"></h2><p id="dialog-copy"></p><div id="dialog-input"></div><div class="dialog-actions"><button type="button" data-dialog-cancel>Cancel</button><button type="submit" id="dialog-confirm" class="primary">Continue</button></div></form></dialog>`;

function announce(message) { $('#announcement').textContent = message; }
async function api(path, options = {}) {
  let response;
  try { response = await fetch(path, { ...options, headers: options.body ? { 'Content-Type': 'application/json' } : undefined, signal: AbortSignal.timeout(12000) }); }
  catch { throw new Error('Could not reach the local API. Check the server, then try again. Your draft is still here.'); }
  if (response.status === 204) return null;
  let data;
  try { data = await response.json(); }
  catch { throw new Error('The API returned an unreadable response. Try again. Your draft is still here.'); }
  if (!response.ok) throw Object.assign(new Error(data.error || 'The request could not be completed.'), { code: data.code, details: data.details, status: response.status });
  return data;
}
const write = (method, value) => ({ method, body: JSON.stringify(value) });
function confirmAction({ title, copy, action = 'Continue', value, danger = false }) {
  if (dialogResolve) return Promise.resolve(false);
  $('#dialog-title').textContent = title; $('#dialog-copy').textContent = copy;
  $('#dialog-input').innerHTML = value === undefined ? '' : `<label for="rename-input">Part name</label><input id="rename-input" name="name" value="${escape(value)}" required maxlength="120" autocomplete="off">`;
  $('#dialog-confirm').textContent = action; $('#dialog-confirm').className = danger ? 'danger' : 'primary';
  $('#confirm-dialog').showModal();
  (value === undefined ? $('[data-dialog-cancel]') : $('#rename-input')).focus();
  return new Promise(resolve => { dialogResolve = resolve; });
}
function closeDialog(value) { const resolve = dialogResolve; dialogResolve = null; $('#confirm-dialog').close(); resolve?.(value); }
$('#dialog-form').addEventListener('submit', event => {
  event.preventDefault(); const input = $('#rename-input');
  if (input && !input.value.trim()) { input.setCustomValidity('Enter a part name.'); input.reportValidity(); return; }
  closeDialog(input ? input.value.trim() : true);
});
$('#dialog-input').addEventListener('input', event => event.target.setCustomValidity(''));
$('#confirm-dialog').addEventListener('cancel', event => { event.preventDefault(); closeDialog(false); });
$('[data-dialog-cancel]').addEventListener('click', () => closeDialog(false));
async function mayDiscard() { return !dirty() || await confirmAction({ title: 'Leave this draft?', copy: 'Your unsaved changes will be discarded. Saved revisions stay in your library.', action: 'Discard changes', danger: true }); }

function setBusy(busy, action, label) {
  state.busy = busy;
  const form = $('#part-form');
  if (form) {
    form.setAttribute('aria-busy', String(busy)); form.querySelector('fieldset').disabled = busy;
    for (const button of form.querySelectorAll('button')) button.disabled = busy;
    if (action) $(`[data-action="${action}"]`).textContent = busy ? label : ({ save: state.project ? 'Save new revision' : 'Save part', validate: 'Check dimensions', rename: 'Rename' })[action];
  }
  for (const control of root.querySelectorAll('[data-action="new"], [data-action="delete"], [data-action="reload"]')) control.disabled = busy;
  for (const control of root.querySelectorAll('[data-template]')) control.disabled = busy || Boolean(state.project);
  for (const control of root.querySelectorAll('[data-revision]')) control.disabled = busy || state.revisions.find(rev => rev.id === control.dataset.revision)?.number === state.viewedRevision;
  for (const control of root.querySelectorAll('[data-action="history-refresh"], [data-action="history-more"]')) control.disabled = busy || state.historyBusy;
  for (const link of root.querySelectorAll('[data-nav]')) link.setAttribute('aria-disabled', String(busy));
}
function clearErrors() {
  for (const input of root.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
  for (const message of root.querySelectorAll('.field-error')) message.textContent = '';
  if ($('#form-feedback')) { $('#form-feedback').className = 'feedback'; $('#form-feedback').replaceChildren(); }
}
function showError(error) {
  clearErrors(); const details = error.details || [];
  for (const issue of details) {
    const key = issue.field.replace('parameters.', ''); const input = document.getElementById(`field-${key}`), message = document.getElementById(`error-${key}`);
    if (input && message) { input.setAttribute('aria-invalid', 'true'); message.textContent = issue.message; }
  }
  $('#form-feedback').className = 'feedback error';
  $('#form-feedback').innerHTML = `<h3>${escape(error.message)}</h3>${details.length ? `<ul>${details.map(issue => {
    const key = issue.field.replace('parameters.', '');
    return `<li>${document.getElementById(`field-${key}`) ? `<a href="#field-${escape(key)}" data-error-field="${escape(key)}">${escape(issue.message)}</a>` : escape(issue.message)}</li>`;
  }).join('')}</ul>` : ''}${error.code === 'REVISION_CONFLICT' ? '<p>A newer revision was saved elsewhere. Copy any changes you need before reloading.</p><button type="button" data-action="reload">Reload latest revision</button>' : ''}`;
  $('#form-feedback').focus(); announce(error.message);
}
function success(message) { clearErrors(); $('#form-feedback').className = 'feedback success'; $('#form-feedback').textContent = message; announce(message); }

const shapes = {
  bracket: `<path class="part-side" d="m119 222 111 55 109-57-110-54z"/><path class="part-top" d="m119 115 31-16 110 55-31 16z"/><path class="part-front" d="m119 115 110 55v90l-110-55z"/><path class="part-top" d="m229 260 110-57v17l-109 57-111-55v-17z"/><path class="part-side" d="m229 170 31-16v90l-31 16z"/><ellipse class="part-hole" cx="174" cy="184" rx="12" ry="17" transform="rotate(-26 174 184)"/><ellipse class="part-hole" cx="282" cy="225" rx="14" ry="7" transform="rotate(-26 282 225)"/>`,
  enclosure: `<path class="part-side" d="m100 141 141-65 110 57v109l-139 70-112-59z"/><path class="part-top" d="m100 141 141-65 110 57-139 70zm25 1 116-54 85 45-114 57z" fill-rule="evenodd"/><path class="part-front" d="m100 141 112 62v109l-112-59z"/><path class="part-hole" d="m125 142 87 48 114-57v87l-114 55-87-45z"/><path d="m212 190 0 85m-87-45 114-56 87 46" fill="none"/>`,
  spacer: `<path class="part-front" d="M126 131v106c0 61 188 61 188 0V131z"/><ellipse class="part-top" cx="220" cy="131" rx="94" ry="46"/><ellipse class="part-hole" cx="220" cy="131" rx="30" ry="15"/><path d="M146 154v83m148-83v83" fill="none" opacity=".45"/>`,
};
function renderEditor() {
  const part = template(), saved = state.project;
  $('#page').innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">${saved ? 'SAVED PART / REVISION ' + state.viewedRevision : 'FROM AN IDEA TO A PART'}</p><h1>${saved ? escape(saved.name) : 'Make your next small thing.'}</h1><p>${saved ? 'Edit dimensions. Save a new revision. Keep every step.' : 'Start with a trusted template, then make it yours.'}</p></div><button type="button" data-action="new">${icon('plus')} New part</button></div>
    <div class="workbench"><section class="editor" aria-labelledby="setup-title">
      <div class="section-heading"><span class="step">01</span><h2 id="setup-title">${saved ? 'Your part setup' : 'Choose a starting point'}</h2><span class="unit-tag">mm</span></div>
      <div class="templates" role="group" aria-label="Part template">${state.templates.map(item => `<button type="button" class="template ${item.id === part.id ? 'selected' : ''}" data-template="${escape(item.id)}" aria-pressed="${item.id === part.id}" ${saved ? 'disabled' : ''}>${icon('cube')}<span>${escape(item.name)}</span>${item.id === part.id ? icon('check') : ''}</button>`).join('')}</div>
      <p class="helper">${escape(part.description)} ${saved ? 'The template is fixed for this saved part.' : 'Choose a shape for your build.'}</p>
      <form id="part-form" novalidate><fieldset><legend class="sr-only">Part details and dimensions</legend>
        <div class="field"><div class="label-row"><label for="field-name">Part name</label>${saved ? '<button type="button" class="text-button" data-action="rename">Rename</button>' : ''}</div><input id="field-name" name="name" value="${escape(state.draft.name)}" maxlength="120" required ${saved ? 'readonly' : ''} aria-describedby="error-name" placeholder="e.g. Workshop shelf support"><p class="field-error" id="error-name"></p></div>
        <div class="field"><label for="field-description">Describe your part <span class="optional">optional</span></label><textarea id="field-description" name="description" maxlength="4000" rows="3" aria-describedby="description-help error-description" placeholder="What will it hold, protect or keep apart?">${escape(state.draft.description)}</textarea><p id="description-help" class="field-hint">Saved with your revision. Set dimensions below; text does not change them.</p><p class="field-error" id="error-description"></p></div>
        <div class="section-heading dimensions-heading"><span class="step">02</span><h2>Set your dimensions</h2><button type="button" class="text-button" data-action="defaults">Reset defaults</button></div>
        <div class="parameter-grid">${Object.entries(part.parameters).map(([key, rule]) => `<div class="field"><label for="field-${escape(key)}">${escape(rule.label)}</label><div class="number-wrap"><input type="number" id="field-${escape(key)}" name="${escape(key)}" data-parameter="${escape(key)}" value="${escape(state.draft.parameters[key])}" min="${rule.min}" max="${rule.max}" step="any" inputmode="decimal" required aria-describedby="hint-${escape(key)} error-${escape(key)}"><span aria-hidden="true">mm</span></div><p class="field-hint" id="hint-${escape(key)}">${rule.min}–${rule.max} mm${/Diameter/.test(key) && rule.min === 0 ? ' · 0 for no hole' : ''}</p><p class="field-error" id="error-${escape(key)}"></p></div>`).join('')}</div>
      </fieldset><div id="form-feedback" class="feedback" tabindex="-1" role="status" aria-live="polite"></div><p id="save-state" class="save-state"></p>
      <div class="form-actions"><button type="button" data-action="validate">${icon('check')} Check dimensions</button><button type="submit" class="primary" data-action="save">${icon('save')} ${saved ? 'Save new revision' : 'Save part'}</button></div>
      <p class="availability">Parameter checks and revision storage are available. CAD generation and STL export are coming in later stages.</p></form>
    </section><aside class="reference-column">
      <section class="preview" aria-labelledby="preview-title"><div class="preview-heading"><h2 id="preview-title">Template reference</h2><span class="preview-tag">ILLUSTRATION</span></div>
        <div class="canvas"><svg class="part-drawing" viewBox="0 0 440 330" role="img" aria-label="Static ${escape(part.name)} illustration, not generated CAD"><g class="drawing-lines" stroke-linejoin="round" stroke-width="2">${shapes[part.id]}</g><g class="dimension-lines" fill="none" stroke-width="1"><path d="M100 290h240m-240-5v10m240-10v10M365 90v170m-5-170h10m-10 170h10"/></g><g class="axis" stroke-width="2"><path d="M44 270v-30m0 30 26 14m-26-14-24 14"/><text x="40" y="230">Z</text><text x="74" y="292">X</text><text x="10" y="298">Y</text></g></svg><span class="canvas-label">REFERENCE VIEW / MM</span></div>
        <p class="eyebrow">TRUSTED TEMPLATE / V${part.version}</p><h3>${escape(part.reference)}</h3><dl id="dimension-readout" class="dimension-readout"></dl><p class="preview-note">The illustration stays fixed. Your dimension readout reflects the draft; validation checks parameter rules, not printability or strength.</p>
      </section><section class="history" aria-labelledby="history-title"><div class="section-heading">${icon('clock')}<h2 id="history-title">Revision history</h2>${saved ? '<button type="button" class="text-button" data-action="history-refresh">Refresh</button>' : ''}</div><div id="history-content">${saved ? '<p class="loading">Loading saved revisions…</p>' : '<div class="empty-history"><p>Your first save starts the story.</p><small>Each revision keeps a complete snapshot of your dimensions and description.</small></div>'}</div></section>
      ${saved ? '<button type="button" class="delete-button" data-action="delete">Delete this part</button>' : ''}
    </aside></div>`;
  updateDraftStatus(); updateReadout();
  $('#part-form').addEventListener('submit', event => { event.preventDefault(); void savePart(); });
  $('#part-form').addEventListener('input', event => {
    const input = event.target;
    if (input.dataset.parameter) state.draft.parameters[input.dataset.parameter] = input.value === '' ? null : input.valueAsNumber;
    else if (['name', 'description'].includes(input.name)) state.draft[input.name] = input.value;
    clearErrors(); updateDraftStatus(); updateReadout();
  });
}
function updateReadout() { $('#dimension-readout').innerHTML = Object.entries(template().parameters).map(([key, rule]) => `<div><dt>${escape(rule.label)}</dt><dd>${Number.isFinite(state.draft.parameters[key]) ? escape(state.draft.parameters[key]) + ' mm' : '—'}</dd></div>`).join(''); }
function updateDraftStatus() {
  $('#save-state').textContent = state.project ? `${dirty() ? 'Unsaved changes' : 'Saved snapshot'} · editing revision ${state.viewedRevision} · next save creates revision ${state.project.latestRevision.number + 1}` : `${dirty() ? 'Unsaved draft' : 'New draft'} · not yet in your library`;
}
function newDraft(id) {
  const part = state.templates.find(item => item.id === id) || state.templates[0];
  state.project = null; state.viewedRevision = null;
  state.draft = { name: '', description: '', templateId: part.id, parameters: Object.fromEntries(Object.entries(part.parameters).map(([key, rule]) => [key, rule.default])) };
  state.baseline = snapshot(); renderEditor();
}
function adoptProject(project) { state.project = project; adoptRevision(project.latestRevision); }
function adoptRevision(revision) {
  state.viewedRevision = revision.number;
  state.draft = { name: state.project.name, description: revision.description, templateId: state.project.templateId, parameters: { ...revision.parameters } };
  state.baseline = JSON.stringify({ ...state.draft, description: state.project.latestRevision.description, parameters: state.project.latestRevision.parameters });
  renderEditor();
}
function validateLocal(includeName) {
  const details = [];
  if (includeName && !state.draft.name.trim()) details.push({ field: 'name', message: 'Enter a name for your part.' });
  if (includeName && state.draft.name.length > 120) details.push({ field: 'name', message: 'Keep the part name to 120 characters or fewer.' });
  if (state.draft.description.length > 4000) details.push({ field: 'description', message: 'Keep the description to 4000 characters or fewer.' });
  for (const [key, rule] of Object.entries(template().parameters)) {
    const value = state.draft.parameters[key];
    if (!Number.isFinite(value) || value < rule.min || value > rule.max) details.push({ field: `parameters.${key}`, message: `${rule.label}: enter a number from ${rule.min} to ${rule.max} mm.` });
  }
  if (details.length) throw Object.assign(new Error('Check the highlighted fields.'), { details });
}
async function resetDefaults() {
  if (state.busy || dialogResolve) return;
  const rules = template().parameters;
  const changed = Object.entries(rules).some(([key, rule]) => state.draft.parameters[key] !== rule.default);
  if (changed && !await confirmAction({ title: 'Reset dimensions?', copy: 'Replace your edited dimensions with this template’s defaults. Your part name, description and saved revisions stay intact.', action: 'Reset dimensions' })) return;
  if (state.busy) return;
  for (const [key, rule] of Object.entries(rules)) { state.draft.parameters[key] = rule.default; document.getElementById(`field-${key}`).value = rule.default; }
  clearErrors(); updateDraftStatus(); updateReadout(); announce('Template defaults restored to the draft.');
}
async function checkDimensions() {
  if (state.busy) return;
  try {
    validateLocal(false); setBusy(true, 'validate', 'Checking…');
    await api(`/api/templates/${encodeURIComponent(template().id)}/validate`, write('POST', { parameters: state.draft.parameters }));
    success('Dimensions pass this template’s parameter checks. You can save your part.');
  } catch (error) { showError(error); } finally { setBusy(false, 'validate'); }
}
async function savePart() {
  if (state.busy) return;
  try {
    validateLocal(true); setBusy(true, 'save', 'Saving…');
    if (state.project) {
      const { revision } = await api(`${projectPath(state.project.id)}/revisions`, write('POST', { parameters: state.draft.parameters, description: state.draft.description, baseRevision: state.project.latestRevision.number }));
      state.project = { ...state.project, latestRevision: revision, updatedAt: revision.createdAt };
    } else { const { project } = await api('/api/projects', write('POST', state.draft)); state.project = project; }
    adoptProject(state.project); state.route = `#/projects/${state.project.id}`; history.replaceState(null, '', state.route);
    success(`Revision ${state.project.latestRevision.number} saved. Your part is in Saved parts.`); void loadHistory();
  } catch (error) { showError(error); } finally { setBusy(false, 'save'); }
}

async function loadHistory(append = false) {
  if (!state.project || !$('#history-content') || (append && state.historyBusy)) return;
  const token = ++historyToken, id = state.project.id, offset = append ? state.revisions.length : 0;
  state.historyBusy = true; $('#history-content').setAttribute('aria-busy', 'true');
  const refresh = $('[data-action="history-refresh"]'); if (refresh) refresh.disabled = true;
  if (!append) { state.revisions = []; $('#history-content').innerHTML = '<p class="loading">Loading saved revisions…</p>'; }
  else { $('[data-action="history-more"]').disabled = true; $('[data-action="history-more"]').textContent = 'Loading…'; }
  try {
    const result = await api(`${projectPath(id)}/revisions?limit=10&offset=${offset}`);
    if (token !== historyToken || state.project?.id !== id || !$('#history-content')) return;
    state.revisions = append ? [...state.revisions, ...result.revisions] : result.revisions; state.revisionTotal = result.total; renderHistory();
  } catch (error) {
    if (token !== historyToken || state.project?.id !== id || !$('#history-content')) return;
    $('#history-content').innerHTML = `${append ? '<ol class="history-list">' + historyRows() + '</ol>' : ''}<div class="feedback error"><p>${escape(error.message)}</p><button type="button" data-action="${append ? 'history-more' : 'history-refresh'}">Retry history</button></div>`;
  } finally {
    if (token === historyToken && state.project?.id === id && $('#history-content')) {
      state.historyBusy = false; $('#history-content').setAttribute('aria-busy', 'false'); setBusy(state.busy);
    }
  }
}
function historyRows() {
  return state.revisions.map(revision => `<li><div><strong>Revision ${revision.number}${revision.number === state.project.latestRevision.number ? ' <span class="pill">Latest</span>' : ''}</strong><time datetime="${escape(revision.createdAt)}">${escape(date(revision.createdAt))}</time><p>${escape(revision.description || 'No description saved.')}</p></div><button type="button" data-revision="${escape(revision.id)}" ${state.busy || revision.number === state.viewedRevision ? 'disabled' : ''} aria-label="Use revision ${revision.number}">${revision.number === state.viewedRevision ? 'In editor' : 'Use revision'}</button></li>`).join('');
}
function renderHistory() { $('#history-content').innerHTML = `<p class="field-hint">Use a snapshot in the editor. Saving it creates a new revision.</p><ol class="history-list">${historyRows()}</ol>${state.revisions.length < state.revisionTotal ? '<button type="button" data-action="history-more" class="load-more">Load older revisions</button>' : ''}`; }
async function useRevision(id) {
  if (state.busy || !await mayDiscard()) return;
  if (state.busy) return;
  setBusy(true);
  try {
    const { revision } = await api(`${projectPath(state.project.id)}/revisions/${encodeURIComponent(id)}`);
    adoptRevision(revision); success(`Revision ${revision.number} loaded into the editor. Save to create a new revision.`); $('#field-name').focus();
  } catch (error) { showError(error); } finally { setBusy(false); renderHistory(); }
}
async function renamePart() {
  if (state.busy || !state.project) return;
  const name = await confirmAction({ title: 'Rename your part', copy: 'This updates the library name. Saved dimensions and revisions stay intact.', action: 'Save name', value: state.project.name });
  if (!name || name === state.project.name) return;
  setBusy(true, 'rename', 'Renaming…');
  try {
    const { project } = await api(projectPath(state.project.id), write('PATCH', { name }));
    // Keep the known base revision so concurrent writes still produce a conflict.
    state.project.name = project.name; state.project.updatedAt = project.updatedAt;
    const baseline = JSON.parse(state.baseline); baseline.name = project.name; state.baseline = JSON.stringify(baseline);
    state.draft.name = project.name; $('#field-name').value = project.name; $('.page-heading h1').textContent = project.name;
    success('Part renamed.'); updateDraftStatus();
  } catch (error) { showError(error); } finally { setBusy(false, 'rename'); }
}
async function deletePart() {
  if (state.busy || !state.project) return;
  if (!await confirmAction({ title: 'Delete this part?', copy: `“${state.project.name}” and all its revisions will be permanently deleted. This cannot be undone.`, action: 'Delete part', danger: true })) return;
  setBusy(true);
  try { await api(projectPath(state.project.id), { method: 'DELETE' }); state.baseline = snapshot(); location.hash = '#/parts'; announce('Part and its revisions deleted.'); }
  catch (error) { showError(error); } finally { setBusy(false); }
}

function renderLibrary() {
  $('#page').innerHTML = `<div class="page-heading"><div><p class="eyebrow">YOUR PART LIBRARY</p><h1>Saved parts</h1><p>Pick up where you left off. Every revision is kept.</p></div><button type="button" class="primary" data-action="new">${icon('plus')} New part</button></div><section class="library" aria-labelledby="library-title"><div class="library-heading"><h2 id="library-title">Parts on this machine</h2><button type="button" data-action="parts-refresh">Refresh library</button></div><div id="parts-content" aria-live="polite"></div></section>`;
}
function projectRows() {
  return `<ul class="project-list">${state.projects.map(project => `<li><a href="#/projects/${encodeURIComponent(project.id)}" data-nav><span class="part-symbol">${icon('cube')}</span><span class="project-info"><strong>${escape(project.name)}</strong><span>${escape(state.templates.find(item => item.id === project.templateId)?.name || project.templateId)} / Revision ${project.latestRevision.number}</span></span><time datetime="${escape(project.updatedAt)}">${escape(date(project.updatedAt))}</time>${icon('arrow')}</a></li>`).join('')}</ul>`;
}
async function loadProjects(append = false) {
  if (!$('#parts-content') || (append && state.listBusy)) return;
  const token = ++listToken, offset = append ? state.projects.length : 0;
  state.listBusy = true;
  $('[data-action="parts-refresh"]').disabled = true;
  if (!append) { state.projects = []; $('#parts-content').innerHTML = '<p class="loading">Loading your saved parts…</p>'; }
  else { $('[data-action="parts-more"]').disabled = true; $('[data-action="parts-more"]').textContent = 'Loading…'; }
  $('#parts-content').setAttribute('aria-busy', 'true');
  try {
    const result = await api(`/api/projects?limit=12&offset=${offset}`);
    if (token !== listToken || !$('#parts-content')) return;
    state.projects = append ? [...state.projects, ...result.projects] : result.projects; state.total = result.total;
    $('#parts-content').innerHTML = state.projects.length ? `<p class="list-count">${state.projects.length} of ${state.total} saved parts</p>${projectRows()}${state.projects.length < state.total ? '<button type="button" data-action="parts-more" class="load-more">Load more parts</button>' : ''}` : `<div class="empty-library">${icon('folder')}<h3>A home for your first part.</h3><p>Choose a template, set its dimensions and save it here.</p><button type="button" data-action="new">${icon('plus')} Create a part</button></div>`;
  } catch (error) {
    if (token !== listToken || !$('#parts-content')) return;
    $('#parts-content').innerHTML = `${append ? projectRows() : ''}<div class="feedback error"><h3>Could not load saved parts</h3><p>${escape(error.message)}</p><button type="button" data-action="${append ? 'parts-more' : 'parts-refresh'}">Retry library</button></div>`;
  } finally {
    if (token === listToken && $('#parts-content')) {
      state.listBusy = false; $('#parts-content').setAttribute('aria-busy', 'false');
      $('[data-action="parts-refresh"]').disabled = false;
    }
  }
}

async function route(force = false) {
  if (!state.templates.length) return;
  const hash = location.hash || '#/new/bracket';
  if (hash === state.route && !force) return;
  if (state.busy || dialogResolve || (!force && !await mayDiscard())) { history.replaceState(null, '', state.route || '#/new/bracket'); return; }
  const token = ++routeToken; ++historyToken; ++listToken;
  state.route = hash; state.draft = null; state.project = null; state.historyBusy = false; state.listBusy = false; state.revisions = [];
  const library = hash === '#/parts';
  for (const link of root.querySelectorAll('[data-tab]')) { const active = link.dataset.tab === (library ? 'parts' : 'workbench'); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); }
  $('#page').setAttribute('aria-busy', 'true');
  try {
    if (library) { renderLibrary(); void loadProjects(); }
    else if (/^#\/projects\/[^/]+$/.test(hash)) {
      $('#page').innerHTML = '<div class="boot-state"><h1>Opening your part…</h1><p>Loading the latest saved revision.</p></div>';
      const { project } = await api(projectPath(decodeURIComponent(hash.split('/')[2])));
      if (token !== routeToken) return;
      adoptProject(project); void loadHistory();
    } else newDraft(hash.split('/')[2]);
    if (token === routeToken) $('#content').focus({ preventScroll: true });
  } catch (error) {
    if (token !== routeToken) return;
    $('#page').innerHTML = `<div class="boot-state feedback error"><h1>${error.status === 404 ? 'This part could not be found.' : 'Could not open this part.'}</h1><p>${escape(error.message)}</p><div class="form-actions"><button data-action="route-retry">Try again</button><a class="button" href="#/parts" data-nav>Back to saved parts</a></div></div>`;
  } finally { if (token === routeToken) $('#page').setAttribute('aria-busy', 'false'); }
}
root.addEventListener('click', async event => {
  const errorLink = event.target.closest('[data-error-field]');
  if (errorLink) { event.preventDefault(); document.getElementById(`field-${errorLink.dataset.errorField}`).focus(); return; }
  const link = event.target.closest('[data-nav]');
  if (link && (state.busy || dialogResolve)) { event.preventDefault(); return; }
  const choice = event.target.closest('[data-template]');
  if (choice && !choice.disabled && choice.dataset.template !== template()?.id && await mayDiscard()) { state.baseline = snapshot(); location.hash = `#/new/${choice.dataset.template}`; return; }
  const revision = event.target.closest('[data-revision]');
  if (revision && !revision.disabled) { void useRevision(revision.dataset.revision); return; }
  const control = event.target.closest('[data-action]');
  if (!control || control.disabled || state.busy || dialogResolve) return;
  switch (control.dataset.action) {
    case 'new': if (await mayDiscard()) { state.baseline = snapshot(); if (location.hash === '#/new/bracket') { newDraft('bracket'); $('#field-name').focus(); } else location.hash = '#/new/bracket'; } break;
    case 'validate': void checkDimensions(); break;
    case 'defaults': void resetDefaults(); break;
    case 'rename': void renamePart(); break;
    case 'delete': void deletePart(); break;
    case 'reload': if (await mayDiscard()) { state.baseline = snapshot(); void route(true); } break;
    case 'history-refresh': void loadHistory(); break;
    case 'history-more': void loadHistory(true); break;
    case 'parts-refresh': void loadProjects(); break;
    case 'parts-more': void loadProjects(true); break;
    case 'route-retry': void route(true); break;
    case 'connect': void boot(); break;
  }
});
window.addEventListener('hashchange', () => { void route(); });
window.addEventListener('beforeunload', event => { if (dirty() || state.busy) { event.preventDefault(); event.returnValue = ''; } });
async function boot() {
  $('#page').setAttribute('aria-busy', 'true');
  const retry = $('[data-action="connect"]'); if (retry) { retry.disabled = true; retry.textContent = 'Connecting…'; }
  try {
    const [health, catalogue] = await Promise.all([api('/api/health'), api('/api/templates')]);
    if (health.status !== 'ok') throw new Error('The API is not healthy. Try again after restarting the server.');
    state.templates = catalogue.templates;
    if (!state.templates.length) throw new Error('No templates are available. Refresh after the catalogue is restored.');
    $('#connection').innerHTML = '<span class="status-dot" aria-hidden="true"></span> Local API connected'; await route(true);
  } catch (error) {
    $('#connection').textContent = 'API unavailable';
    $('#page').innerHTML = `<div class="boot-state feedback error"><p class="eyebrow">CONNECTION NEEDED</p><h1>Your workbench is waiting.</h1><p>${escape(error.message)}</p><button type="button" data-action="connect">Retry connection</button></div>`;
  } finally { $('#page').setAttribute('aria-busy', 'false'); }
}
void boot();
