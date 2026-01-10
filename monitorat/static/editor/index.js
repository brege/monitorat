/* global localStorage, alert */

window.Editor = (function () {
  const DRAFT_PREFIX = 'editor-draft-'
  const DRAFT_TIME_PREFIX = 'editor-draft-time-'

  let currentFile = null
  let editorElement = null
  let previewElement = null
  let draftIndicator = null
  let saveCallback = null
  let mode = 'edit'

  function getMarkdownRenderer () {
    return window.markdownit({ html: true })
      .use(window.markdownItAnchor, {
        permalink: window.markdownItAnchor.permalink.linkInsideHeader({
          symbol: '#',
          placement: 'after'
        })
      })
  }

  function saveDraft (file, content) {
    try {
      localStorage.setItem(DRAFT_PREFIX + file, content)
      localStorage.setItem(DRAFT_TIME_PREFIX + file, Date.now().toString())
    } catch (_) {
      /* localStorage unavailable */
    }
  }

  function loadDraft (file) {
    try {
      return localStorage.getItem(DRAFT_PREFIX + file)
    } catch (_) {
      return null
    }
  }

  function getDraftTime (file) {
    try {
      const time = localStorage.getItem(DRAFT_TIME_PREFIX + file)
      return time ? parseInt(time, 10) : null
    } catch (_) {
      return null
    }
  }

  function clearDraft (file) {
    try {
      localStorage.removeItem(DRAFT_PREFIX + file)
      localStorage.removeItem(DRAFT_TIME_PREFIX + file)
    } catch (_) {
      /* localStorage unavailable */
    }
  }

  function formatDraftTime (timestamp) {
    if (!timestamp) return ''
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  function updateDraftIndicator () {
    if (!draftIndicator || !currentFile) return
    const time = getDraftTime(currentFile)
    if (time) {
      draftIndicator.textContent = `Draft saved ${formatDraftTime(time)}`
      draftIndicator.style.display = ''
    } else {
      draftIndicator.style.display = 'none'
    }
  }

  function renderPreview () {
    if (!editorElement || !previewElement) return
    const md = getMarkdownRenderer()
    previewElement.innerHTML = md.render(editorElement.value)
  }

  function setMode (newMode) {
    mode = newMode
    const container = document.querySelector('.editor-modal-content')
    if (!container) return

    const editPane = container.querySelector('.editor-edit-pane')
    const previewPane = container.querySelector('.editor-preview-pane')
    const curtain = container.querySelector('.editor-curtain')
    const curtainLabel = curtain?.querySelector('.editor-curtain-label')
    const curtainChevron = curtain?.querySelector('.editor-curtain-chevron')

    if (mode === 'edit') {
      editPane.classList.add('active')
      previewPane.classList.remove('active')
      curtain.dataset.target = 'preview'
      curtainLabel.textContent = 'Preview'
      curtainChevron.innerHTML = '<polyline points="6 9 12 15 18 9"/>'
    } else {
      editPane.classList.remove('active')
      previewPane.classList.add('active')
      curtain.dataset.target = 'edit'
      curtainLabel.textContent = 'Edit'
      curtainChevron.innerHTML = '<polyline points="18 15 12 9 6 15"/>'
      renderPreview()
    }
  }

  function toggleMode () {
    setMode(mode === 'edit' ? 'preview' : 'edit')
  }

  async function open (options = {}) {
    const { widget, file, content, onSave, readonly = false } = options

    currentFile = file || widget
    saveCallback = onSave

    const draft = loadDraft(currentFile)
    const initialContent = draft || content

    const chevronDown = '<polyline points="6 9 12 15 18 9"/>'

    const modalContent = document.createElement('div')
    modalContent.className = 'editor-modal-content'
    modalContent.innerHTML = `
      <div class="editor-panes">
        <div class="editor-edit-pane active">
          <textarea class="editor-textarea" spellcheck="false"${readonly ? ' readonly' : ''}></textarea>
        </div>
        <div class="editor-preview-pane">
          <div class="editor-preview markdown-body"></div>
        </div>
      </div>
      <div class="editor-curtain" data-target="preview">
        <svg class="editor-curtain-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${chevronDown}
        </svg>
        <span class="editor-curtain-label">Preview</span>
      </div>
      <div class="editor-footer">
        <span class="editor-draft-indicator"></span>
        <div class="editor-actions">
          <button type="button" class="editor-btn editor-btn-cancel">Cancel</button>
          <button type="button" class="editor-btn editor-btn-primary editor-btn-save"${readonly ? ' disabled' : ''}>Save</button>
        </div>
      </div>
    `

    editorElement = modalContent.querySelector('.editor-textarea')
    previewElement = modalContent.querySelector('.editor-preview')
    draftIndicator = modalContent.querySelector('.editor-draft-indicator')

    editorElement.value = initialContent

    window.Modal.show({
      title: `Edit: ${widget}`,
      content: modalContent,
      onClose: () => {
        currentFile = null
        editorElement = null
        previewElement = null
        draftIndicator = null
        saveCallback = null
        mode = 'edit'
      }
    })

    const curtain = modalContent.querySelector('.editor-curtain')
    curtain.addEventListener('click', toggleMode)

    const cancelBtn = modalContent.querySelector('.editor-btn-cancel')
    cancelBtn.addEventListener('click', () => {
      window.Modal.hide()
    })

    const saveBtn = modalContent.querySelector('.editor-btn-save')
    if (!readonly) {
      saveBtn.addEventListener('click', async () => {
        const newContent = editorElement.value
        if (typeof saveCallback === 'function') {
          saveBtn.disabled = true
          saveBtn.textContent = 'Saving...'
          try {
            await saveCallback(newContent)
            clearDraft(currentFile)
            window.Modal.hide()
          } catch (error) {
            saveBtn.disabled = false
            saveBtn.textContent = 'Save'
            alert(`Save failed: ${error.message}`)
          }
        }
      })
    }

    let debounceTimer = null
    editorElement.addEventListener('input', () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        saveDraft(currentFile, editorElement.value)
        updateDraftIndicator()
      }, 1000)
    })

    updateDraftIndicator()
    setMode('edit')
    editorElement.focus()
  }

  return {
    open,
    saveDraft,
    loadDraft,
    clearDraft
  }
})()
