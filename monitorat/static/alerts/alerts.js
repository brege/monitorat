function createAlertCard(options = {}) {
  const {
    classes = '',
    badge = null,
    content = null,
    actions = [],
    title = '',
    onClick = null,
  } = options;

  const card = document.createElement('div');
  card.classList.add('alert-card');
  if (typeof classes === 'string') {
    classes
      .split(' ')
      .map((name) => name.trim())
      .filter(Boolean)
      .forEach((name) => {
        card.classList.add(name);
      });
  } else if (Array.isArray(classes)) {
    classes.filter(Boolean).forEach((name) => {
      card.classList.add(name);
    });
  }

  if (badge?.text) {
    const badgeElement = document.createElement('span');
    badgeElement.className = `source-badge${badge.className ? ` ${badge.className}` : ''}`;
    badgeElement.textContent = badge.text;
    if (badge.title) {
      badgeElement.title = badge.title;
    }
    card.classList.add('has-badge');
    card.appendChild(badgeElement);
  }

  if (title) {
    card.title = title;
  }

  if (onClick) {
    card.addEventListener('click', onClick);
    card.style.cursor = 'pointer';
  }

  if (typeof content === 'string') {
    const body = document.createElement('span');
    body.className = 'alert-text';
    body.textContent = content;
    card.appendChild(body);
  } else if (Array.isArray(content)) {
    content.filter(Boolean).forEach((node) => {
      if (typeof node === 'string') {
        card.appendChild(document.createTextNode(node));
      } else {
        card.appendChild(node);
      }
    });
  } else if (content) {
    card.appendChild(content);
  }

  if (Array.isArray(actions)) {
    actions.filter(Boolean).forEach((node) => {
      card.appendChild(node);
    });
  }

  return card;
}

window.monitorShared = window.monitorShared || {};
window.monitorShared.Alerts = { createCard: createAlertCard };
