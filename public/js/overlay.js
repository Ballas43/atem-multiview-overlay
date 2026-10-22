(function () {
  'use strict';

  const gridElement = document.getElementById('mv-grid');
  const keyWarningOverlay = document.getElementById('key-warning-overlay');
  const keyWarningModeName = document.getElementById('key-warning-mode-name');
  const isPreview = window.location.search.includes('preview=1');
  const isKeyView =
    document.body.dataset.view === 'key' || window.location.pathname.startsWith('/key');

  if (isPreview) {
    document.body.classList.add('in-preview');
  }
  if (isKeyView) {
    document.body.classList.add('view-key');
  }

  // Socket.io connection
  // @ts-ignore
  const socket = io();

  let lastPayload = null;

  socket.on('connect', () => {
    const link = document.querySelector('link[rel="stylesheet"]');
    if (link) {
      link.setAttribute('href', '/css/overlay.css?t=' + Date.now());
    }
  });

  socket.on('reloadOutput', () => {
    window.location.reload();
  });

  socket.on('disconnect', () => {
    // Retain last known grid state on screen mid-show
  });

  socket.on('stateUpdate', (payload) => {
    if (!payload) return;
    lastPayload = payload;
    applyStyles(payload.config);
    renderGrid(payload);
  });

  // Also fetch initial state via REST API immediately on load
  fetch('/api/state')
    .then((res) => res.json())
    .then((payload) => {
      if (payload && !lastPayload) {
        lastPayload = payload;
        applyStyles(payload.config);
        renderGrid(payload);
      }
    })
    .catch(() => { });

  function getModeDisplayName(bgMode) {
    if (bgMode === 'transparent') return 'Alpha Key (Transparent)';
    if (bgMode === 'keyfill') return 'Key & Fill';
    return 'Chroma Key (Solid Color)';
  }

  function applyStyles(config) {
    if (!config) return;

    const root = document.documentElement;
    const bgMode = config.bgMode || 'chroma';
    const isTransparent = bgMode === 'transparent';
    const isKeyFill = bgMode === 'keyfill';

    root.classList.remove('mode-transparent', 'mode-keyfill', 'mode-chroma');
    document.body.classList.remove('mode-transparent', 'mode-keyfill', 'mode-chroma');

    if (isKeyView) {
      // /key route always uses a pure black background when active
      root.style.setProperty('--bg-color', '#000000');
      root.classList.add('mode-keyfill');
      document.body.classList.add('mode-keyfill');

      // Show warning if Key & Fill mode is NOT selected
      if (keyWarningOverlay) {
        if (!isKeyFill) {
          keyWarningOverlay.classList.remove('hidden');
          if (keyWarningModeName) {
            keyWarningModeName.textContent = getModeDisplayName(bgMode);
          }
          if (gridElement) {
            gridElement.classList.add('hidden');
          }
        } else {
          keyWarningOverlay.classList.add('hidden');
          if (gridElement) {
            gridElement.classList.remove('hidden');
          }
        }
      }
    } else if (isTransparent) {
      root.style.setProperty('--bg-color', 'transparent');
      root.classList.add('mode-transparent');
      document.body.classList.add('mode-transparent');
    } else if (isKeyFill) {
      // /out in Key & Fill mode acts as the Fill channel over pure black (#000000)
      root.style.setProperty('--bg-color', '#000000');
      root.classList.add('mode-keyfill');
      document.body.classList.add('mode-keyfill');
    } else {
      const chroma = config.chromaColor || '#00FF00';
      root.style.setProperty('--bg-color', chroma);
      root.classList.add('mode-chroma');
      document.body.classList.add('mode-chroma');
    }

    if (isKeyView) {
      root.style.setProperty('--border-color', '#FFFFFF');
      root.style.setProperty('--preview-color', '#FFFFFF');
      root.style.setProperty('--program-color', '#FFFFFF');
    } else {
      root.style.setProperty('--border-color', config.borderColor || '#555555');
      root.style.setProperty('--preview-color', config.previewTallyColor || '#00CC00');
      root.style.setProperty('--program-color', config.programTallyColor || '#FF0000');
    }

    root.style.setProperty('--border-width', (config.borderWidthPx ?? 2) + 'px');
    root.style.setProperty('--tally-width', (config.tallyBorderWidthPx ?? 4) + 'px');
  }

  function renderGrid(payload) {
    if (!gridElement) return;
    const config = payload.config || {};
    const windows = payload.windows || [];
    const bgMode = config.bgMode || 'chroma';
    const isTransparent = bgMode === 'transparent';
    const isKeyFill = bgMode === 'keyfill';

    // If on /key and not in keyfill mode, keep grid hidden while warning is displayed
    if (isKeyView && !isKeyFill) {
      gridElement.innerHTML = '';
      return;
    }

    gridElement.innerHTML = '';

    for (const w of windows) {
      const cell = document.createElement('div');
      cell.className = 'mv-cell';
      cell.dataset.windowIndex = String(w.windowIndex);

      // Grid Placement
      const colStart = w.colStart || 1;
      const colSpan = w.colSpan || 1;
      const rowStart = w.rowStart || 1;
      const rowSpan = w.rowSpan || 1;

      cell.style.gridColumn = `${colStart} / span ${colSpan}`;
      cell.style.gridRow = `${rowStart} / span ${rowSpan}`;

      // Borders
      if (!config.showBorders) {
        cell.classList.add('no-borders');
      }

      // Tally Highlights
      if (config.showTally) {
        if (w.isProgram) {
          cell.classList.add('tally-program');
        }
        if (w.isPreview) {
          cell.classList.add('tally-preview');
        }
      }

      // Source Label
      const showLabel = config.showLabels && !w.hideLabel;
      if (showLabel) {
        const label = document.createElement('div');
        label.className = 'mv-label';
        label.textContent = w.longName || w.shortName || `Input ${w.sourceId}`;

        if (isKeyView) {
          // Key / Alpha Matte: 65% white luminance for translucent box fill, 100% white for border & text
          label.style.backgroundColor = 'rgba(255, 255, 255, 0.65)';
          label.style.border = '1.5px solid #FFFFFF';
          label.style.color = '#FFFFFF';
        } else if (isTransparent) {
          label.style.backgroundColor = 'rgba(0, 0, 0, 0.55)';
          label.style.border = '1.5px solid rgba(255, 255, 255, 0.55)';
        } else if (isKeyFill) {
          // Fill channel (/out): pure black box fill with grey border & white text
          label.style.backgroundColor = '#000000';
          label.style.border = '1.5px solid #96929a';
        } else {
          // Chroma Key mode: chroma-safe dark fill & grey border
          label.style.backgroundColor = '#161418';
          label.style.border = '1.5px solid #96929a';
        }
        label.style.textTransform = 'none';
        label.style.bottom = '2.5vh';

        cell.appendChild(label);
      }

      gridElement.appendChild(cell);
    }
  }
})();
