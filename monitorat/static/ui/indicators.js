/**
 * StatusIndicator - displays remote health status as a colored dot
 *
 * States:
 *   - ok (green): remote is healthy
 *   - degraded (yellow): remote is slow or returned non-200
 *   - offline (red): remote is unreachable
 *   - unknown (gray): status not yet checked
 */

const StatusIndicator = (() => {
  const STATES = {
    ok: { color: 'var(--status-ok, #22c55e)', label: 'Online' },
    degraded: { color: 'var(--status-degraded, #eab308)', label: 'Degraded' },
    offline: { color: 'var(--status-offline, #ef4444)', label: 'Offline' },
    unknown: { color: 'var(--status-unknown, #9ca3af)', label: 'Unknown' },
  };

  const LATENCY_THRESHOLD_MS = 2000;

  function determineState(healthResult) {
    if (!healthResult) {
      return 'unknown';
    }
    if (healthResult.ok === true) {
      if (
        healthResult.latency_ms &&
        healthResult.latency_ms > LATENCY_THRESHOLD_MS
      ) {
        return 'degraded';
      }
      return 'ok';
    }
    if (healthResult.error?.includes('Timeout')) {
      return 'degraded';
    }
    return 'offline';
  }

  function create(remoteName, healthResult) {
    const state = determineState(healthResult);
    const config = STATES[state];

    const indicator = document.createElement('span');
    indicator.className = 'status-indicator';
    indicator.dataset.remote = remoteName;
    indicator.dataset.state = state;

    indicator.style.cssText = `
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: ${config.color};
      margin-left: 8px;
      vertical-align: middle;
    `;

    let title = `${remoteName}: ${config.label}`;
    if (healthResult?.latency_ms) {
      title += ` (${healthResult.latency_ms}ms)`;
    }
    if (healthResult?.error) {
      title += ` - ${healthResult.error}`;
    }
    indicator.setAttribute('title', title);

    return indicator;
  }

  function update(indicator, healthResult) {
    const remoteName = indicator.dataset.remote;
    const state = determineState(healthResult);
    const config = STATES[state];

    indicator.dataset.state = state;
    indicator.style.backgroundColor = config.color;

    let title = `${remoteName}: ${config.label}`;
    if (healthResult?.latency_ms) {
      title += ` (${healthResult.latency_ms}ms)`;
    }
    if (healthResult?.error) {
      title += ` - ${healthResult.error}`;
    }
    indicator.setAttribute('title', title);
  }

  async function fetchStatus() {
    try {
      const response = await fetch('api/federation/status', {
        cache: 'no-store',
      });
      if (!response.ok) {
        return { enabled: false, remotes: {} };
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch federation status:', error);
      return { enabled: false, remotes: {} };
    }
  }

  return {
    create,
    update,
    fetchStatus,
    determineState,
    STATES,
  };
})();

window.StatusIndicator = StatusIndicator;
window.monitorShared = window.monitorShared || {};
window.monitorShared.StatusIndicator = StatusIndicator;
