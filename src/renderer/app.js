/* Krate — main window renderer */
'use strict';

if (!window.krate) {
  document.body.innerHTML = '<div style="display:grid;place-items:center;height:100vh;color:#8d88a3;font-family:Segoe UI">Krate must be run inside Electron (npm start).</div>';
  throw new Error('no preload');
}

const $ = (id) => document.getElementById(id);

const state = {
  config: null,
  projects: [],
  // filters
  status: '',
  tag: null,
  query: '',
  sort: 'modified',
  // detail
  current: null, // { path, meta, tree }
  currentTab: 'overview',
  expanded: new Set(),
  selectedRel: '', // selected folder ('' = project root)
  highlightRel: null,
};

/* ------------------------------------------------------------ helpers --- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function fileUrl(abs) {
  return encodeURI('file:///' + abs.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

function absOf(rel) {
  return state.current.path + (rel ? '\\' + rel.split('/').join('\\') : '');
}

function tagColor(name) {
  const t = state.config.tags.find((t) => t.name === name);
  return t ? t.color : '#a855f7';
}

function chipHtml(name, removable = false) {
  const c = tagColor(name);
  return `<span class="chip" data-tag="${esc(name)}" style="color:${c};border-color:${c}55;background:${c}22">${esc(name)}${removable ? '<span class="x" data-untag="' + esc(name) + '">✕</span>' : ''}</span>`;
}

function timeAgo(iso) {
  if (!iso) return '';
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' h ago';
  const days = Math.floor(h / 24);
  if (days < 30) return days + ' d ago';
  return new Date(iso).toLocaleDateString();
}

function fmtSize(n) {
  if (n == null) return '';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}

const debounce = (fn, ms) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

async function refresh() {
  const s = await window.krate.getState();
  state.config = s.config;
  state.projects = s.projects;
  renderSidebar();
  if (!state.current) renderGrid();
}

/* -------------------------------------------------------------- modal --- */
function openModal(html) {
  $('modalBox').innerHTML = html;
  $('modalBackdrop').hidden = false;
  const first = $('modalBox').querySelector('input[type="text"],textarea');
  if (first) setTimeout(() => first.focus(), 30);
  return $('modalBox');
}
function closeModal() {
  $('modalBackdrop').hidden = true;
  $('modalBox').innerHTML = '';
}
$('modalBackdrop').addEventListener('mousedown', (e) => {
  if (e.target === $('modalBackdrop')) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('modalBackdrop').hidden) closeModal();
  if (e.key === 'f' && e.ctrlKey && !$('homeView').hidden) { e.preventDefault(); $('searchInput').focus(); }
});

/* ------------------------------------------------------------ sidebar --- */
function renderSidebar() {
  $('countAll').textContent = state.projects.length;
  document.querySelectorAll('#statusNav .nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.status === state.status && !state.tag);
  });

  const counts = {};
  for (const p of state.projects) for (const t of p.meta.tags) counts[t] = (counts[t] || 0) + 1;

  $('tagList').innerHTML = state.config.tags.map((t) => `
    <div class="tag-item ${state.tag === t.name ? 'active' : ''}" data-tag="${esc(t.name)}">
      <span class="tag-swatch" style="background:${t.color}"></span>
      <span class="tag-name">${esc(t.name)}</span>
      <span class="count">${counts[t.name] || ''}</span>
    </div>`).join('');

  $('tagList').querySelectorAll('.tag-item').forEach((el) => {
    el.onclick = () => {
      state.tag = state.tag === el.dataset.tag ? null : el.dataset.tag;
      goHome();
    };
  });
}

document.querySelectorAll('#statusNav .nav-item').forEach((el) => {
  el.onclick = () => { state.status = el.dataset.status; state.tag = null; goHome(); };
});

/* --------------------------------------------------------------- grid --- */
function filteredProjects() {
  let list = [...state.projects];
  if (state.status) list = list.filter((p) => (p.meta.status || 'active') === state.status);
  if (state.tag) list = list.filter((p) => p.meta.tags.includes(state.tag));
  if (state.query) {
    const q = state.query.toLowerCase();
    list = list.filter((p) =>
      p.meta.title.toLowerCase().includes(q) ||
      (p.meta.description || '').toLowerCase().includes(q) ||
      p.meta.tags.some((t) => t.toLowerCase().includes(q)));
  }
  const sorters = {
    modified: (a, b) => new Date(b.meta.modified) - new Date(a.meta.modified),
    created: (a, b) => new Date(b.meta.created) - new Date(a.meta.created),
    name: (a, b) => a.meta.title.localeCompare(b.meta.title),
  };
  list.sort(sorters[state.sort]);
  return list;
}

function renderGrid() {
  const list = filteredProjects();
  if (!list.length) {
    $('projectGrid').innerHTML = `
      <div class="empty-state">
        <div class="big">📦</div>
        <div>${state.projects.length ? 'Nothing matches your filter.' : 'No projects yet — create your first one!'}</div>
      </div>`;
    return;
  }
  $('projectGrid').innerHTML = list.map((p) => {
    const cover = p.meta.cover
      ? `style="background-image:url('${fileUrl(p.path + '\\' + p.meta.cover.split('/').join('\\'))}')"`
      : `style="background:linear-gradient(135deg,${p.meta.color || '#a855f7'}66,${p.meta.color || '#7c3aed'}22)"`;
    return `
      <div class="card" data-path="${esc(p.path)}">
        <div class="card-cover" ${cover}>${p.meta.cover ? '' : esc((p.meta.title[0] || '?').toUpperCase())}</div>
        <div class="card-body">
          <div class="card-title">${esc(p.meta.title)}</div>
          <div class="card-sub"><span class="dot dot-${esc(p.meta.status || 'active')}"></span>${timeAgo(p.meta.modified)}</div>
          <div class="card-chips">${p.meta.tags.map((t) => chipHtml(t)).join('')}</div>
        </div>
      </div>`;
  }).join('');
  $('projectGrid').querySelectorAll('.card').forEach((el) => {
    el.onclick = () => openProject(el.dataset.path);
  });
}

$('searchInput').addEventListener('input', debounce((e) => {
  state.query = e.target.value; renderGrid();
}, 120));
$('sortSelect').onchange = (e) => { state.sort = e.target.value; renderGrid(); };

function goHome() {
  state.current = null;
  $('detailView').hidden = true;
  $('homeView').hidden = false;
  renderSidebar();
  renderGrid();
}

/* ------------------------------------------------------------- detail --- */
async function openProject(path, opts = {}) {
  const { meta, tree } = await window.krate.loadProject(path);
  state.current = { path, meta, tree };
  state.expanded = new Set(tree.filter((n) => n.dir).map((n) => n.rel)); // root level open
  state.selectedRel = '';
  state.highlightRel = opts.highlightRel || null;
  state.currentTab = opts.tab || 'overview';
  $('homeView').hidden = true;
  $('detailView').hidden = false;
  renderDetail();
}

function renderDetail() {
  const { meta, path } = state.current;
  $('detTitle').value = meta.title;
  $('detStatus').value = meta.status || 'active';
  $('detPath').textContent = path;
  $('detDesc').value = meta.description || '';

  const cover = $('detCover');
  if (meta.cover) {
    cover.style.backgroundImage = `url('${fileUrl(absOf(meta.cover))}')`;
    cover.textContent = '';
  } else {
    cover.style.backgroundImage = '';
    cover.style.background = `linear-gradient(135deg,${meta.color || '#a855f7'},#7c3aed)`;
    cover.textContent = (meta.title[0] || '?').toUpperCase();
  }

  $('detTags').innerHTML = meta.tags.map((t) => chipHtml(t, true)).join('') +
    '<span class="chip chip-add" id="chipAdd">＋ tag</span>';
  $('detTags').querySelectorAll('.x').forEach((x) => {
    x.onclick = (e) => {
      e.stopPropagation();
      meta.tags = meta.tags.filter((t) => t !== x.dataset.untag);
      saveMetaNow();
      renderDetail();
    };
  });
  $('chipAdd').onclick = openTagPicker;

  document.querySelectorAll('#detTabs .tab').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === state.currentTab);
  });
  $('tabOverview').hidden = state.currentTab !== 'overview';
  $('tabFiles').hidden = state.currentTab !== 'files';
  $('tabPsettings').hidden = state.currentTab !== 'psettings';

  if (state.currentTab === 'overview') renderNotes();
  if (state.currentTab === 'files') renderTree();
  if (state.currentTab === 'psettings') renderPSettings();
}

document.querySelectorAll('#detTabs .tab').forEach((el) => {
  el.onclick = () => { state.currentTab = el.dataset.tab; renderDetail(); };
});

$('btnBack').onclick = () => { goHome(); refresh(); };
$('btnRevealProject').onclick = () => window.krate.reveal(state.current.path);
$('detCover').onclick = async () => {
  const meta = await window.krate.setCover(state.current.path);
  if (meta) { state.current.meta = meta; renderDetail(); }
};

async function saveMetaNow() {
  state.current.meta = await window.krate.saveMeta({
    path: state.current.path,
    meta: state.current.meta,
  });
}
const saveMetaSoon = debounce(saveMetaNow, 500);

$('detTitle').addEventListener('input', () => {
  state.current.meta.title = $('detTitle').value;
  saveMetaSoon();
});
$('detStatus').onchange = () => {
  state.current.meta.status = $('detStatus').value;
  saveMetaNow();
};
$('detDesc').addEventListener('input', () => {
  state.current.meta.description = $('detDesc').value;
  saveMetaSoon();
});

function openTagPicker() {
  const meta = state.current.meta;
  const box = openModal(`
    <h2>Tags</h2>
    <div class="tagpick">
      ${state.config.tags.map((t) => `
        <span class="chip ${meta.tags.includes(t.name) ? 'on' : ''}" data-t="${esc(t.name)}"
          style="color:${t.color};border-color:${t.color}55;background:${t.color}22">${esc(t.name)}</span>`).join('')}
    </div>
    <div class="modal-row" style="margin-top:14px">
      <input type="text" id="newTagName" placeholder="New custom tag…">
      <input type="color" id="newTagColor" value="#a855f7">
      <button class="btn" id="btnAddTag">Add</button>
    </div>
    <div class="modal-actions"><button class="btn btn-primary" id="btnTagDone">Done</button></div>
  `);
  box.querySelectorAll('.tagpick .chip').forEach((c) => {
    c.onclick = () => {
      const t = c.dataset.t;
      if (meta.tags.includes(t)) meta.tags = meta.tags.filter((x) => x !== t);
      else meta.tags.push(t);
      c.classList.toggle('on');
    };
  });
  box.querySelector('#btnAddTag').onclick = async () => {
    const name = box.querySelector('#newTagName').value.trim();
    if (!name) return;
    if (!state.config.tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      const tags = [...state.config.tags, { name, color: box.querySelector('#newTagColor').value }];
      const r = await window.krate.saveConfig({ tags });
      state.config = r.config;
    }
    if (!meta.tags.includes(name)) meta.tags.push(name);
    closeModal();
    saveMetaNow().then(() => { renderSidebar(); renderDetail(); });
    openTagPicker();
  };
  box.querySelector('#btnTagDone').onclick = () => {
    closeModal();
    saveMetaNow().then(() => { renderSidebar(); renderDetail(); });
  };
}

/* -------------------------------------------------------------- notes --- */
function renderNotes() {
  const notes = [...state.current.meta.notes].reverse();
  $('noteList').innerHTML = notes.length ? notes.map((n) => `
    <div class="note">
      <div class="note-date">${new Date(n.date).toLocaleString()}</div>
      <div class="note-text">${esc(n.text)}</div>
      <button class="note-del" data-id="${esc(n.id)}" title="Delete note">✕</button>
    </div>`).join('') : '<div class="muted small">No notes yet.</div>';
  $('noteList').querySelectorAll('.note-del').forEach((b) => {
    b.onclick = () => {
      state.current.meta.notes = state.current.meta.notes.filter((n) => n.id !== b.dataset.id);
      saveMetaNow();
      renderNotes();
    };
  });
}

function addNote() {
  const text = $('noteInput').value.trim();
  if (!text) return;
  state.current.meta.notes.push({ id: crypto.randomUUID(), text, date: new Date().toISOString() });
  $('noteInput').value = '';
  saveMetaNow();
  renderNotes();
}
$('btnAddNote').onclick = addNote;
$('noteInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); addNote(); }
});

/* -------------------------------------------------------------- files --- */
async function reloadTree() {
  const { meta, tree } = await window.krate.loadProject(state.current.path);
  state.current.meta = meta;
  state.current.tree = tree;
  renderTree();
}

function renderTree() {
  const { tree, meta } = state.current;
  $('dropTarget').textContent = 'Target: /' + state.selectedRel;

  function rows(nodes) {
    return nodes.map((n) => {
      const nick = meta.nicknames[n.rel];
      const isOpen = state.expanded.has(n.rel);
      const hl = state.highlightRel === n.rel ? ' highlighted' : '';
      const sel = n.dir && state.selectedRel === n.rel ? ' selected' : '';
      const icon = n.dir ? (isOpen ? '📂' : '📁') : iconFor(n.name);
      return `
        <div class="frow${sel}${hl}" data-rel="${esc(n.rel)}" data-dir="${n.dir ? 1 : 0}" draggable="true">
          <span class="ficon">${icon}</span>
          <span class="fname">${esc(n.name)}</span>
          ${nick ? `<span class="fnick">${esc(nick)}</span>` : ''}
          <span class="fsize">${n.dir ? '' : fmtSize(n.size)}</span>
          <span class="factions">
            <button class="fbtn" data-act="nick" title="Set nickname">✎</button>
            ${n.dir ? '' : '<button class="fbtn" data-act="open" title="Open">▶</button>'}
            <button class="fbtn" data-act="reveal" title="Show in Explorer">📂</button>
          </span>
        </div>
        ${n.dir && isOpen && n.children.length ? `<div class="fchildren">${rows(n.children)}</div>` : ''}`;
    }).join('');
  }

  $('fileTree').innerHTML = tree.length
    ? rows(tree)
    : '<div class="drop-hint">Empty project — add files with the button above or drop them here.</div>';

  $('fileTree').querySelectorAll('.frow').forEach((row) => {
    const rel = row.dataset.rel;
    const isDir = row.dataset.dir === '1';

    row.onclick = (e) => {
      if (e.target.closest('.fbtn')) return;
      if (isDir) {
        if (state.expanded.has(rel)) state.expanded.delete(rel);
        else state.expanded.add(rel);
        state.selectedRel = rel;
      } else {
        state.selectedRel = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
      }
      renderTree();
    };
    row.ondblclick = () => { if (!isDir) window.krate.open(absOf(rel)); };

    row.querySelectorAll('.fbtn').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        if (b.dataset.act === 'open') window.krate.open(absOf(rel));
        if (b.dataset.act === 'reveal') window.krate.reveal(absOf(rel));
        if (b.dataset.act === 'nick') openNicknameModal(rel);
      };
    });

    row.addEventListener('dragstart', (e) => {
      e.preventDefault();
      internalDrag = true;
      window.krate.startDrag(absOf(rel));
      setTimeout(() => { internalDrag = false; }, 400);
    });
  });

  if (state.highlightRel) {
    const el = $('fileTree').querySelector('.frow.highlighted');
    if (el) el.scrollIntoView({ block: 'center' });
    state.highlightRel = null;
  }
}

function iconFor(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'psd'].includes(ext)) return '🖼';
  if (['mp4', 'mov', 'mkv', 'avi', 'webm'].includes(ext)) return '🎬';
  if (['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext)) return '🎵';
  if (['prproj', 'aep', 'veg', 'drp'].includes(ext)) return '🎞';
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜';
  if (['txt', 'md', 'doc', 'docx', 'pdf'].includes(ext)) return '📄';
  if (['js', 'ts', 'py', 'java', 'json', 'html', 'css', 'c', 'cpp', 'cs'].includes(ext)) return '⌨';
  return '📄';
}

function openNicknameModal(rel) {
  const cur = state.current.meta.nicknames[rel] || '';
  const box = openModal(`
    <h2>Nickname</h2>
    <div class="muted small" style="margin-bottom:8px">${esc(rel)}</div>
    <input type="text" id="nickInput" value="${esc(cur)}" placeholder="e.g. main clip, thumbnail, final render…">
    <div class="hint">Nicknames make files easy to find in the quick-search overlay (${esc(state.config.hotkey)}).</div>
    <div class="modal-actions">
      <button class="btn" id="nickClear">Clear</button>
      <button class="btn btn-primary" id="nickSave">Save</button>
    </div>
  `);
  const save = (val) => {
    if (val) state.current.meta.nicknames[rel] = val;
    else delete state.current.meta.nicknames[rel];
    closeModal();
    saveMetaNow().then(renderTree);
  };
  box.querySelector('#nickSave').onclick = () => save(box.querySelector('#nickInput').value.trim());
  box.querySelector('#nickClear').onclick = () => save('');
  box.querySelector('#nickInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save(box.querySelector('#nickInput').value.trim());
  });
}

$('btnAddFiles').onclick = async () => {
  const n = await window.krate.addFiles({ path: state.current.path, targetRel: state.selectedRel });
  if (n) reloadTree();
};

$('btnNewFolder').onclick = () => {
  const box = openModal(`
    <h2>New Folder</h2>
    <div class="muted small" style="margin-bottom:8px">in /${esc(state.selectedRel)}</div>
    <input type="text" id="nfName" placeholder="Folder name">
    <div class="modal-actions"><button class="btn btn-primary" id="nfCreate">Create</button></div>
  `);
  const create = async () => {
    const name = box.querySelector('#nfName').value.trim();
    if (!name) return;
    const rel = (state.selectedRel ? state.selectedRel + '/' : '') + name;
    await window.krate.newFolder({ path: state.current.path, rel });
    if (state.selectedRel) state.expanded.add(state.selectedRel);
    closeModal();
    reloadTree();
  };
  box.querySelector('#nfCreate').onclick = create;
  box.querySelector('#nfName').addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
};

$('btnSaveTpl').onclick = () => {
  const box = openModal(`
    <h2>Save structure as template</h2>
    <input type="text" id="tplName" placeholder="Template name" value="${esc(state.current.meta.title)} structure">
    <div class="hint">Saves the folder layout (not the files) of this project as a reusable template.</div>
    <div class="modal-actions"><button class="btn btn-primary" id="tplSave">Save</button></div>
  `);
  box.querySelector('#tplSave').onclick = async () => {
    const name = box.querySelector('#tplName').value.trim();
    if (!name) return;
    await window.krate.saveTemplateFromProject({ path: state.current.path, name });
    await refresh();
    closeModal();
  };
};

/* drag & drop INTO the project */
let internalDrag = false;
const treeEl = $('fileTree');
treeEl.addEventListener('dragover', (e) => {
  if (internalDrag) return;
  e.preventDefault();
  treeEl.classList.add('dragover');
});
treeEl.addEventListener('dragleave', () => treeEl.classList.remove('dragover'));
treeEl.addEventListener('drop', async (e) => {
  e.preventDefault();
  treeEl.classList.remove('dragover');
  if (internalDrag) return;
  const paths = [...e.dataTransfer.files].map((f) => window.krate.pathForFile(f)).filter(Boolean);
  if (!paths.length) return;
  await window.krate.importPaths({ path: state.current.path, targetRel: state.selectedRel, paths });
  reloadTree();
});

/* --------------------------------------------------- project settings --- */
function renderPSettings() {
  const { path, meta } = state.current;
  $('psLocation').textContent = path;
  $('psColor').value = meta.color || '#a855f7';
  const external = state.config.externalProjects.some(
    (p) => p.toLowerCase() === path.toLowerCase());
  $('btnUnregister').hidden = !external;
}

$('psColor').onchange = () => {
  state.current.meta.color = $('psColor').value;
  saveMetaNow();
};

$('btnUnregister').onclick = async () => {
  await window.krate.unregisterProject({ path: state.current.path });
  goHome();
  refresh();
};

$('btnDeleteProject').onclick = async () => {
  const ok = await window.krate.deleteProject({ path: state.current.path });
  if (ok) { goHome(); refresh(); }
};

/* ---------------------------------------------------------- new proj --- */
$('btnNew').onclick = () => {
  let customLocation = null;
  const box = openModal(`
    <h2>New Project</h2>
    <label>Name</label>
    <input type="text" id="npName" placeholder="My awesome edit">
    <label>Tags</label>
    <div class="tagpick" id="npTags">
      ${state.config.tags.map((t) => `
        <span class="chip" data-t="${esc(t.name)}"
          style="color:${t.color};border-color:${t.color}55;background:${t.color}22">${esc(t.name)}</span>`).join('')}
    </div>
    <label>Folder template</label>
    <select id="npTpl">
      <option value="">— none —</option>
      ${state.config.templates.map((t) => `<option value="${esc(t.name)}">${esc(t.name)} (${t.dirs.length} folders)</option>`).join('')}
    </select>
    <label>Location</label>
    <div class="modal-row">
      <input type="text" id="npLoc" value="${esc(state.config.projectsRoot || '')}" readonly>
      <button class="btn" id="npBrowse">Browse</button>
    </div>
    <div class="error-text" id="npErr" hidden></div>
    <div class="modal-actions">
      <button class="btn" id="npCancel">Cancel</button>
      <button class="btn btn-primary" id="npCreate">Create</button>
    </div>
  `);
  box.querySelectorAll('#npTags .chip').forEach((c) => {
    c.onclick = () => c.classList.toggle('on');
  });
  box.querySelector('#npBrowse').onclick = async () => {
    const dir = await window.krate.pickFolder();
    if (dir) { customLocation = dir; box.querySelector('#npLoc').value = dir; }
  };
  box.querySelector('#npCancel').onclick = closeModal;
  const create = async () => {
    const name = box.querySelector('#npName').value.trim();
    if (!name) return;
    const tags = [...box.querySelectorAll('#npTags .chip.on')].map((c) => c.dataset.t);
    const template = box.querySelector('#npTpl').value || null;
    try {
      const { path } = await window.krate.createProject({ name, tags, template, location: customLocation });
      closeModal();
      await refresh();
      openProject(path);
    } catch (err) {
      const el = box.querySelector('#npErr');
      el.textContent = String(err.message || err).replace(/^.*Error:\s*/, '');
      el.hidden = false;
    }
  };
  box.querySelector('#npCreate').onclick = create;
  box.querySelector('#npName').addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
};

/* ----------------------------------------------------------- settings --- */
$('btnSettings').onclick = openSettings;

function openSettings() {
  const cfg = state.config;
  const box = openModal(`
    <h2>Settings</h2>

    <label>Default projects folder</label>
    <div class="modal-row">
      <input type="text" id="setRoot" value="${esc(cfg.projectsRoot || '')}" readonly placeholder="Not set">
      <button class="btn" id="setRootBrowse">Browse</button>
    </div>

    <label>Quick-search hotkey</label>
    <div class="modal-row">
      <input type="text" id="setHotkey" value="${esc(cfg.hotkey)}" spellcheck="false">
      <button class="btn" id="setHotkeyApply">Apply</button>
    </div>
    <div class="hint">Electron accelerator format, e.g. <b>Control+Alt+K</b>, <b>Control+Shift+Space</b>, <b>Alt+F1</b></div>
    <div class="error-text" id="hotkeyErr" hidden></div>

    <label>Tags</label>
    <div id="tagMgr"></div>
    <div class="modal-row">
      <input type="text" id="tagNewName" placeholder="New tag name">
      <input type="color" id="tagNewColor" value="#a855f7">
      <button class="btn" id="tagNewAdd">Add</button>
    </div>

    <label>Folder templates</label>
    <div class="modal-row">
      <select id="tplSelect"></select>
      <button class="btn" id="tplNew">New</button>
      <button class="btn mgr-del" id="tplDelete" title="Delete template">🗑</button>
    </div>
    <textarea id="tplEditor" rows="7" spellcheck="false" placeholder="One folder per line, e.g.&#10;Footage/Raw&#10;Audio/SFX&#10;Exports"></textarea>
    <div class="hint">One folder path per line. Use “/” for nesting. Changes are saved with the button below.</div>

    <div class="modal-actions">
      <button class="btn btn-primary" id="setDone">Save & Close</button>
    </div>
  `);

  // root picker
  box.querySelector('#setRootBrowse').onclick = async () => {
    const dir = await window.krate.pickFolder();
    if (dir) {
      box.querySelector('#setRoot').value = dir;
      const r = await window.krate.saveConfig({ projectsRoot: dir });
      state.config = r.config;
      refresh();
    }
  };

  // hotkey
  box.querySelector('#setHotkeyApply').onclick = async () => {
    const r = await window.krate.saveConfig({ hotkey: box.querySelector('#setHotkey').value.trim() });
    state.config = r.config;
    const err = box.querySelector('#hotkeyErr');
    err.hidden = r.hotkey.ok;
    if (!r.hotkey.ok) err.textContent = r.hotkey.error;
    else err.hidden = true;
  };

  // tag manager
  let tags = [...cfg.tags];
  const renderTagMgr = () => {
    box.querySelector('#tagMgr').innerHTML = tags.map((t, i) => `
      <div class="mgr-row">
        <input type="color" value="${t.color}" data-i="${i}" class="tagColorIn">
        <input type="text" value="${esc(t.name)}" data-i="${i}" class="tagNameIn">
        <button class="mgr-del" data-i="${i}" title="Delete tag">✕</button>
      </div>`).join('');
    box.querySelectorAll('#tagMgr .mgr-del').forEach((b) => {
      b.onclick = () => { tags.splice(+b.dataset.i, 1); renderTagMgr(); };
    });
    box.querySelectorAll('.tagColorIn').forEach((inp) => {
      inp.onchange = () => { tags[+inp.dataset.i].color = inp.value; };
    });
    box.querySelectorAll('.tagNameIn').forEach((inp) => {
      inp.onchange = () => { tags[+inp.dataset.i].name = inp.value.trim() || tags[+inp.dataset.i].name; };
    });
  };
  renderTagMgr();
  box.querySelector('#tagNewAdd').onclick = () => {
    const name = box.querySelector('#tagNewName').value.trim();
    if (!name || tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) return;
    tags.push({ name, color: box.querySelector('#tagNewColor').value });
    box.querySelector('#tagNewName').value = '';
    renderTagMgr();
  };

  // template manager
  let templates = cfg.templates.map((t) => ({ ...t, dirs: [...t.dirs] }));
  let tplIdx = 0;
  const tplSelect = box.querySelector('#tplSelect');
  const tplEditor = box.querySelector('#tplEditor');
  const renderTplSelect = () => {
    tplSelect.innerHTML = templates.map((t, i) =>
      `<option value="${i}" ${i === tplIdx ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    tplEditor.value = templates[tplIdx] ? templates[tplIdx].dirs.join('\n') : '';
  };
  renderTplSelect();
  tplSelect.onchange = () => { commitEditor(); tplIdx = +tplSelect.value; renderTplSelect(); };
  const commitEditor = () => {
    if (!templates[tplIdx]) return;
    templates[tplIdx].dirs = tplEditor.value.split('\n').map((s) => s.trim().replace(/^\/+|\/+$/g, '')).filter(Boolean);
  };
  box.querySelector('#tplNew').onclick = () => {
    commitEditor();
    const name = prompt('Template name:');
    if (!name) return;
    templates.push({ name: name.trim(), dirs: [] });
    tplIdx = templates.length - 1;
    renderTplSelect();
  };
  box.querySelector('#tplDelete').onclick = () => {
    if (!templates[tplIdx]) return;
    templates.splice(tplIdx, 1);
    tplIdx = Math.max(0, tplIdx - 1);
    renderTplSelect();
  };

  box.querySelector('#setDone').onclick = async () => {
    commitEditor();
    const r = await window.krate.saveConfig({ tags, templates });
    state.config = r.config;
    closeModal();
    refresh();
    if (state.current) renderDetail();
  };
}

/* ---------------------------------------------------------- first run --- */
function openWelcome() {
  const box = openModal(`
    <h2>Welcome to Krate 👋</h2>
    <p class="muted" style="line-height:1.6">
      Krate keeps every project — edits, apps, designs, anything — in one organized place:
      tagged, searchable and one hotkey away.<br><br>
      First, choose the folder where new projects will be stored by default.
    </p>
    <div class="modal-actions">
      <button class="btn btn-primary" id="wPick">📁 Choose projects folder</button>
    </div>
  `);
  box.querySelector('#wPick').onclick = async () => {
    const dir = await window.krate.pickFolder();
    if (!dir) return;
    const r = await window.krate.saveConfig({ projectsRoot: dir });
    state.config = r.config;
    closeModal();
    refresh();
  };
}

/* -------------------------------------------------------------- boot ---- */
window.krate.on('goto-project', ({ path, rel }) => {
  openProject(path, rel ? { tab: 'files', highlightRel: rel } : {});
});

window.addEventListener('focus', () => { if (!state.current) refresh(); });

(async function boot() {
  await refresh();
  if (!state.config.projectsRoot) openWelcome();
})();
