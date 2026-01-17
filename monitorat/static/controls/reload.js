function initializeConfigReloadControl(options = {}) {
  const { demoEnabled = false } = options;
  const button = document.getElementById('config-reload');
  if (!button) {
    return;
  }

  const defaultTitle = button.getAttribute('title') || 'Reload configuration';
  const resetState = ({ keepTitle = false } = {}) => {
    button.dataset.state = 'idle';
    button.disabled = false;
    if (!keepTitle) {
      button.setAttribute('title', defaultTitle);
    }
  };

  resetState();

  button.addEventListener('click', async () => {
    if (button.dataset.state === 'loading') {
      return;
    }

    if (demoEnabled) {
      window.location.reload();
      return;
    }

    button.dataset.state = 'loading';
    button.disabled = true;
    button.setAttribute('title', 'Reloading configuration...');

    try {
      const response = await fetch('api/config/reload', {
        method: 'POST',
        cache: 'no-store',
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch (_) {
        /* ignore JSON decode issues */
      }

      if (!response.ok || (payload && payload.status !== 'ok')) {
        const errorDetail = payload?.error || `HTTP ${response.status}`;
        throw new Error(errorDetail);
      }

      button.dataset.state = 'success';
      button.setAttribute(
        'title',
        'Config reloaded. Refresh the page to apply changes.',
      );

      setTimeout(() => {
        window.location.reload();
      }, 600);
    } catch (error) {
      console.error('Failed to reload config:', error);
      button.dataset.state = 'error';
      const reason = error instanceof Error ? error.message : String(error);
      button.setAttribute('title', `Reload failed: ${reason}`);
    } finally {
      const finalState = button.dataset.state;
      setTimeout(() => {
        resetState({ keepTitle: finalState === 'success' });
      }, 2000);
    }
  });
}

window.monitorShared = window.monitorShared || {};
window.monitorShared.initializeConfigReloadControl =
  initializeConfigReloadControl;
