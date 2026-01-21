/* global alert */
const ItemEditor = (() => {
  function parseArrayValue(value) {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string') {
      if (value.startsWith('[') && value.endsWith(']')) {
        try {
          return JSON.parse(value);
        } catch (error) {
          const trimmed = value.slice(1, -1).split(',');
          return trimmed
            .map((item) => {
              // Strip matching single or double quotes around each item.
              return item.trim().replace(/^["']|["']$/g, '');
            })
            .filter(Boolean);
        }
      }
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  async function open(options) {
    const {
      editorKey,
      itemKey,
      item,
      path,
      schema,
      imgRoot,
      onSave,
      onDelete,
    } = options;

    if (!window.Editor) {
      throw new Error('Editor modal is unavailable');
    }

    if (
      !schema?.buildForm ||
      !schema?.buildPayload ||
      !schema?.buildInitialState
    ) {
      throw new Error(
        'ItemEditor requires buildForm, buildPayload, and buildInitialState',
      );
    }
    if (
      schema.preview?.renderer &&
      typeof schema.preview.renderer !== 'function'
    ) {
      throw new Error('ItemEditor preview.renderer must be a function');
    }
    if (
      schema.preview?.dataProvider &&
      typeof schema.preview.dataProvider !== 'function'
    ) {
      throw new Error('ItemEditor preview.dataProvider must be a function');
    }
    if (schema.onFormReady && typeof schema.onFormReady !== 'function') {
      throw new Error('ItemEditor onFormReady must be a function');
    }

    let handleSave = async () => {};
    let activePreviewProvider = schema.preview?.dataProvider || (() => null);

    await window.Editor.open({
      widget: editorKey,
      file: path,
      content: '',
      initialMode: schema.initialMode || 'edit',
      title: schema.title || 'Editor',
      labels: schema.labels || { edit: 'Edit', preview: 'Preview' },
      previewRenderer: schema.preview?.renderer || null,
      previewDataProvider: () => activePreviewProvider(),
      useForm: true,
      onSave: async () => handleSave(),
      onDelete,
    });

    const modalContent = document.querySelector('.editor-modal-content');
    if (!modalContent) {
      return;
    }

    const editPane =
      modalContent.querySelector('.editor-form-pane') ||
      modalContent.querySelector('.editor-edit-pane');
    if (!editPane) {
      return;
    }

    const curtain = modalContent.querySelector('.editor-curtain');
    if (curtain) {
      curtain.style.display = 'none';
    }

    const isEditing = Boolean(itemKey);
    const initialState = schema.buildInitialState({
      item: item || {},
      itemKey,
      parseArrayValue,
    });

    const form = schema.buildForm({ isEditing });
    if (!form) {
      return;
    }

    window.FormFields.setFormState(form, initialState, schema.fieldConfig);
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'form-scroll';
    scrollContainer.appendChild(form);
    editPane.appendChild(scrollContainer);

    if (schema.iconField) {
      window.FormFields.setupIconField({
        form,
        imgRoot,
        onUpdate: () => {},
        ...schema.iconField,
      });
    }

    if (schema.onFormReady) {
      const result = schema.onFormReady(form, {
        parseArrayValue,
        getState: () =>
          window.FormFields.getFormState(form, schema.fieldConfig),
        setState: (state) =>
          window.FormFields.setFormState(form, state, schema.fieldConfig),
      });
      if (typeof result === 'function') {
        activePreviewProvider = result;
      }
    }

    handleSave = async () => {
      const state = window.FormFields.getFormState(form, schema.fieldConfig);
      const payload = schema.buildPayload(state);
      await onSave({ id: state.id, item: payload });
    };
  }

  return { open };
})();

window.monitorShared = window.monitorShared || {};
window.monitorShared.ItemEditor = ItemEditor;
