/* global localStorage, alert */

window.Editor = (() => {
  const DRAFT_PREFIX = 'editor-draft-';
  const DRAFT_TIME_PREFIX = 'editor-draft-time-';
  const CHEVRON_DOWN = '<polyline points="6 9 12 15 18 9"/>';
  const CHEVRON_UP = '<polyline points="18 15 12 9 6 15"/>';
  const ICON_SAVE =
    '<svg aria-hidden="true" viewBox="0 0 448 512" fill="currentColor"><path d="M433.941 129.941l-83.882-83.882A48 48 0 0 0 316.118 32H48C21.49 32 0 53.49 0 80v352c0 26.51 21.49 48 48 48h352c26.51 0 48-21.49 48-48V163.882a48 48 0 0 0-14.059-33.941zM224 416c-35.346 0-64-28.654-64-64 0-35.346 28.654-64 64-64s64 28.654 64 64c0 35.346-28.654 64-64 64zm96-304.52V212c0 6.627-5.373 12-12 12H76c-6.627 0-12-5.373-12-12V108c0-6.627 5.373-12 12-12h228.52c3.183 0 6.235 1.264 8.485 3.515l3.48 3.48A11.996 11.996 0 0 1 320 111.48z"></path></svg>';
  const ICON_RESTORE =
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path fill="none" d="M0 0h24v24H0V0z"></path><path d="M13 3a9 9 0 0 0-9 9H1l4 3.99L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V8z"></path></svg>';
  const ICON_DELETE =
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
  const ICON_CANCEL =
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"></path><path d="M18.364 5.636l-12.728 12.728"></path></svg>';

  let currentFile = null;
  let editorElement = null;
  let previewElement = null;
  let draftIndicator = null;
  let saveCallback = null;
  let deleteCallback = null;
  let previewRenderer = null;
  let mode = 'edit';

  function getMarkdownRenderer() {
    return window.markdownit({ html: true }).use(window.markdownItAnchor, {
      permalink: window.markdownItAnchor.permalink.linkInsideHeader({
        symbol: '#',
        placement: 'after',
      }),
    });
  }

  function saveDraft(file, content) {
    try {
      localStorage.setItem(DRAFT_PREFIX + file, content);
      localStorage.setItem(DRAFT_TIME_PREFIX + file, Date.now().toString());
    } catch (_) {
      /* localStorage unavailable */
    }
  }

  function loadDraft(file) {
    try {
      return localStorage.getItem(DRAFT_PREFIX + file);
    } catch (_) {
      return null;
    }
  }

  function getDraftTime(file) {
    try {
      const time = localStorage.getItem(DRAFT_TIME_PREFIX + file);
      return time ? parseInt(time, 10) : null;
    } catch (_) {
      return null;
    }
  }

  function clearDraft(file) {
    try {
      localStorage.removeItem(DRAFT_PREFIX + file);
      localStorage.removeItem(DRAFT_TIME_PREFIX + file);
    } catch (_) {
      /* localStorage unavailable */
    }
  }

  function formatDraftTime(timestamp) {
    if (!timestamp) return '';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function updateDraftIndicator() {
    if (!draftIndicator || !currentFile) return;
    const time = getDraftTime(currentFile);
    if (time) {
      draftIndicator.textContent = `Draft saved ${formatDraftTime(time)}`;
      draftIndicator.style.visibility = 'visible';
    } else {
      draftIndicator.textContent = '';
      draftIndicator.style.visibility = 'hidden';
    }
  }

  async function renderPreview() {
    if (!editorElement || !previewElement) return;
    if (typeof previewRenderer === 'function') {
      await previewRenderer(editorElement.value, previewElement);
    } else {
      const md = getMarkdownRenderer();
      previewElement.innerHTML = md.render(editorElement.value);
    }
  }

  async function setMode(newMode) {
    mode = newMode;
    const container = document.querySelector('.editor-modal-content');
    if (!container) return;

    const editPane = container.querySelector('.editor-edit-pane');
    const previewPane = container.querySelector('.editor-preview-pane');
    const curtain = container.querySelector('.editor-curtain');
    const curtainLabel = curtain?.querySelector('.editor-curtain-label');
    const curtainChevron = curtain?.querySelector('.editor-curtain-chevron');

    if (mode === 'edit') {
      editPane.classList.add('active');
      previewPane.classList.remove('active');
      curtain.dataset.mode = 'edit';
      curtainLabel.textContent = 'Editor';
      curtainChevron.innerHTML = CHEVRON_DOWN;
    } else {
      editPane.classList.remove('active');
      previewPane.classList.add('active');
      curtain.dataset.mode = 'preview';
      curtainLabel.textContent = 'Preview';
      curtainChevron.innerHTML = CHEVRON_UP;
      await renderPreview();
    }
  }

  function toggleMode() {
    setMode(mode === 'edit' ? 'preview' : 'edit');
  }

  async function open(options = {}) {
    const {
      widget,
      file,
      content,
      onSave,
      onDelete = null,
      readonly = false,
      previewRenderer: customRenderer = null,
      initialMode = 'edit',
    } = options;

    currentFile = file || widget;
    saveCallback = onSave;
    deleteCallback = onDelete;
    previewRenderer = customRenderer;

    const originalContent = content || '';
    const draft = loadDraft(currentFile);
    const initialContent = draft || originalContent;

    const modalContent = document.createElement('div');
    modalContent.className = 'editor-modal-content';
    modalContent.innerHTML = `
      <div class="editor-curtain" data-mode="edit">
        <svg class="editor-curtain-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${CHEVRON_DOWN}
        </svg>
        <span class="editor-curtain-label">Editor</span>
      </div>
      <div class="editor-panes">
        <div class="editor-edit-pane active">
          <textarea class="editor-textarea" spellcheck="false"${readonly ? ' readonly' : ''}></textarea>
        </div>
        <div class="editor-preview-pane">
          <div class="editor-preview markdown-body"></div>
        </div>
      </div>
      <div class="editor-footer">
        <span class="editor-draft-indicator"></span>
        <div class="editor-actions">
          <div class="editor-actions-left"></div>
          <div class="editor-actions-right">
            <button type="button" class="icon-label editor-action-cancel">
              <span class="icon-label-icon">${ICON_CANCEL}</span>
              <span class="icon-label-text">Cancel</span>
            </button>
            <button type="button" class="icon-label icon-label-keep status-ok editor-action-save"${readonly ? ' disabled' : ''}>
              <span class="icon-label-icon">${ICON_SAVE}</span>
              <span class="icon-label-text">Save</span>
            </button>
          </div>
        </div>
      </div>
    `;

    editorElement = modalContent.querySelector('.editor-textarea');
    previewElement = modalContent.querySelector('.editor-preview');
    draftIndicator = modalContent.querySelector('.editor-draft-indicator');

    editorElement.value = initialContent;

    window.Modal.show({
      title: `Edit: ${widget}`,
      content: modalContent,
      onClose: () => {
        currentFile = null;
        editorElement = null;
        previewElement = null;
        draftIndicator = null;
        saveCallback = null;
        deleteCallback = null;
        previewRenderer = null;
        mode = 'edit';
        setTimeout(() => {
          document
            .querySelector('.modal-container')
            ?.classList.remove('editor-modal');
        }, 300);
      },
    });

    document.querySelector('.modal-container')?.classList.add('editor-modal');

    const curtain = modalContent.querySelector('.editor-curtain');
    curtain.addEventListener('click', toggleMode);

    const cancelBtn = modalContent.querySelector('.editor-action-cancel');
    cancelBtn.addEventListener('click', () => {
      window.Modal.hide();
    });

    if (!readonly && deleteCallback) {
      const editorActionsLeft = modalContent.querySelector(
        '.editor-actions-left',
      );
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'icon-label status-critical editor-action-delete';
      deleteBtn.innerHTML = `
        <span class="icon-label-icon">${ICON_DELETE}</span>
        <span class="icon-label-text">Delete</span>
      `;
      editorActionsLeft.appendChild(deleteBtn);

      deleteBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to delete this?')) {
          deleteBtn.disabled = true;
          deleteBtn.querySelector('.icon-label-text').textContent =
            'Deleting...';
          try {
            await deleteCallback();
            window.Modal.hide();
          } catch (error) {
            deleteBtn.disabled = false;
            deleteBtn.querySelector('.icon-label-text').textContent = 'Delete';
            alert(`Delete failed: ${error.message}`);
          }
        }
      });
    }

    const saveBtn = modalContent.querySelector('.editor-action-save');
    if (!readonly) {
      saveBtn.addEventListener('click', async () => {
        const newContent = editorElement.value;
        if (typeof saveCallback === 'function') {
          saveBtn.disabled = true;
          saveBtn.querySelector('.icon-label-text').textContent = 'Saving...';
          try {
            await saveCallback(newContent);
            clearDraft(currentFile);
            window.Modal.hide();
          } catch (error) {
            saveBtn.disabled = false;
            saveBtn.querySelector('.icon-label-text').textContent = 'Save';
            alert(`Save failed: ${error.message}`);
          }
        }
      });
    }

    let debounceTimer = null;
    editorElement.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        saveDraft(currentFile, editorElement.value);
        updateDraftIndicator();
      }, 1000);
    });

    updateDraftIndicator();
    await setMode(initialMode);
    if (initialMode === 'edit') {
      editorElement.focus();
    }
  }

  return {
    open,
    saveDraft,
    loadDraft,
    clearDraft,
  };
})();
