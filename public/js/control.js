(function () {
  'use strict';

  // @ts-ignore
  const socket = io();

  // DOM Elements - Navigation & Header
  const pillElement = document.getElementById('connection-pill');
  const statusText = document.getElementById('connection-status-text');
  const modelBadge = document.getElementById('atem-model-badge');
  const btnToggleMock = document.getElementById('btn-toggle-mock');
  const mockBadgeIndicator = document.getElementById('mock-badge-indicator');
  const mockBtnText = document.getElementById('mock-btn-text');
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  const themeText = document.getElementById('theme-text');
  const btnCopyUrl = document.getElementById('btn-copy-url');
  const btnCopyKeyUrl = document.getElementById('btn-copy-key-url');
  const toast = document.getElementById('toast');

  // DOM Elements - Config Form
  const inputAtemIp = document.getElementById('cfg-atem-ip');
  const btnApplyIp = document.getElementById('btn-apply-ip');
  const selectTargetMv = document.getElementById('cfg-target-mv');
  const selectMeIndex = document.getElementById('cfg-me-index');
  const radioBgChroma = document.getElementById('bg-mode-chroma');
  const radioBgTransparent = document.getElementById('bg-mode-transparent');
  const radioBgKeyFill = document.getElementById('bg-mode-keyfill');
  const chromaOptionsDiv = document.getElementById('chroma-options');
  const inputChromaColor = document.getElementById('cfg-chroma-color');
  const inputChromaHex = document.getElementById('cfg-chroma-hex');
  const inputBorderColor = document.getElementById('cfg-border-color');
  const inputBorderHex = document.getElementById('cfg-border-hex');
  const inputBorderWidth = document.getElementById('cfg-border-width');
  const valBorderWidth = document.getElementById('val-border-width');
  const inputPreviewColor = document.getElementById('cfg-preview-color');
  const inputPreviewHex = document.getElementById('cfg-preview-hex');
  const inputProgramColor = document.getElementById('cfg-program-color');
  const inputProgramHex = document.getElementById('cfg-program-hex');
  const inputTallyWidth = document.getElementById('cfg-tally-width');
  const valTallyWidth = document.getElementById('val-tally-width');
  const checkShowBorders = document.getElementById('cfg-show-borders');
  const checkShowTally = document.getElementById('cfg-show-tally');
  const checkShowLabels = document.getElementById('cfg-show-labels');

  // Mock Controls
  const mockFieldset = document.getElementById('mock-controls-fieldset');
  const layoutButtons = document.querySelectorAll('.btn-layout');
  const pvwButtons = document.querySelectorAll('.btn-pvw');
  const pgmButtons = document.querySelectorAll('.btn-pgm');

  // Preview & Table
  const previewFrame = document.getElementById('preview-frame');
  const btnRefreshPreview = document.getElementById('btn-refresh-preview');
  const btnPreviewFill = document.getElementById('btn-preview-fill');
  const btnPreviewKey = document.getElementById('btn-preview-key');
  const routingTableBody = document.getElementById('routing-table-body');

  let currentConfig = null;
  let isEditingIp = false;
  let lastMvOptionsSig = '';
  let lastMeOptionsSig = '';
  let activePreviewRoute = '/out';

  // Theme Management (Auto / Dark / Light)
  typeThemeInit();

  function typeThemeInit() {
    const savedTheme = localStorage.getItem('mv-theme') || 'auto';
    applyTheme(savedTheme, false);

    // Watch OS system preference changes
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const currentPref = localStorage.getItem('mv-theme') || 'auto';
        if (currentPref === 'auto') {
          applyTheme('auto', false);
        }
      });
    }
  }

  function applyTheme(theme, save = true) {
    if (save) {
      localStorage.setItem('mv-theme', theme);
    }

    let effectiveTheme = theme;
    if (theme === 'auto') {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      effectiveTheme = prefersDark ? 'dark' : 'light';
    }

    document.documentElement.setAttribute('data-theme', effectiveTheme);

    // Update button text and icon
    if (themeText) {
      if (theme === 'auto') {
        themeText.textContent = `Auto (${effectiveTheme.toUpperCase()})`;
      } else {
        themeText.textContent = theme.charAt(0).toUpperCase() + theme.slice(1);
      }
    }

    if (themeIcon) {
      if (theme === 'auto') {
        // Monitor/Desktop Icon
        themeIcon.innerHTML = '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>';
      } else if (effectiveTheme === 'light') {
        // Sun Icon
        themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
      } else {
        // Moon Icon
        themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
      }
    }
  }

  function cycleTheme() {
    const current = localStorage.getItem('mv-theme') || 'auto';
    const cycle = { auto: 'light', light: 'dark', dark: 'auto' };
    const next = cycle[current] || 'auto';
    applyTheme(next, true);
    showToast(`Theme set to ${next.toUpperCase()}`);
  }

  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', cycleTheme);
  }

  // Track user typing in IP field so incoming state updates don't overwrite user cursor
  inputAtemIp.addEventListener('focus', () => { isEditingIp = true; });
  inputAtemIp.addEventListener('blur', () => { isEditingIp = false; });

  // Socket.io Events
  socket.on('stateUpdate', (payload) => {
    if (!payload) return;
    currentConfig = payload.config;
    updateHeader(payload);
    updateDropdowns(payload);
    updateForm(payload.config, payload);
    updateMockControls(payload);
    renderRoutingTable(payload);
  });

  function updateDropdowns(payload) {
    const mvCount = payload.availableMultiViewers || 1;
    const mvOptions =
      Array.isArray(payload.mvOptions) && payload.mvOptions.length > 0
        ? payload.mvOptions
        : Array.from({ length: mvCount }, (_, i) => ({
          index: i,
          label: `MV ${i + 1} (Multiviewer ${i + 1})`
        }));

    const mvSig = JSON.stringify(mvOptions);
    if (mvSig !== lastMvOptionsSig) {
      lastMvOptionsSig = mvSig;
      selectTargetMv.innerHTML = '';
      for (const opt of mvOptions) {
        const optionEl = document.createElement('option');
        optionEl.value = String(opt.index);
        optionEl.textContent = opt.label;
        selectTargetMv.appendChild(optionEl);
      }
    }

    const meCount = payload.availableMEs || 1;
    const meOptions =
      Array.isArray(payload.meOptions) && payload.meOptions.length > 0
        ? payload.meOptions
        : Array.from({ length: meCount }, (_, i) => ({
          index: i,
          label: `M/E ${i + 1}`
        }));

    const meSig = JSON.stringify(meOptions);
    if (meSig !== lastMeOptionsSig) {
      lastMeOptionsSig = meSig;
      selectMeIndex.innerHTML = '';
      for (const opt of meOptions) {
        const optionEl = document.createElement('option');
        optionEl.value = String(opt.index);
        optionEl.textContent = opt.label;
        selectMeIndex.appendChild(optionEl);
      }
    }
  }

  function updateHeader(payload) {
    const config = payload.config || {};
    const isMock = !!config.mockMode;

    if (isMock) {
      pillElement.className = 'status-pill status-simulated';
      statusText.textContent = 'SIMULATION';
      mockBadgeIndicator.className = 'mode-tag mode-sim';
      mockBadgeIndicator.textContent = 'SIMULATION';
      mockBtnText.textContent = 'Connect Hardware';
      mockFieldset.style.display = 'block';
    } else {
      mockBadgeIndicator.className = 'mode-tag mode-hw';
      mockBadgeIndicator.textContent = 'HARDWARE';
      mockBtnText.textContent = 'Switch to Sim';
      mockFieldset.style.display = 'none';

      if (payload.connected) {
        pillElement.className = 'status-pill status-connected';
        statusText.textContent = 'CONNECTED';
      } else {
        pillElement.className = 'status-pill status-disconnected';
        statusText.textContent = 'DISCONNECTED';
      }
    }

    modelBadge.textContent = payload.atemModel || 'Unknown Switcher';
  }

  function updateForm(config, payload) {
    if (!config) return;

    if (!isEditingIp && inputAtemIp) {
      inputAtemIp.value = config.atemIp || '';
    }

    const activeMv = payload && typeof payload.mvIndex === 'number' ? payload.mvIndex : (config.targetMvIndex ?? 0);
    const maxMe = payload && typeof payload.availableMEs === 'number' ? Math.max(0, payload.availableMEs - 1) : 3;
    const activeMe = Math.min(config.meIndex ?? 0, maxMe);

    selectTargetMv.value = String(activeMv);
    selectMeIndex.value = String(activeMe);

    if (config.bgMode === 'transparent') {
      radioBgTransparent.checked = true;
      chromaOptionsDiv.style.opacity = '0.4';
      chromaOptionsDiv.style.pointerEvents = 'none';
    } else if (config.bgMode === 'keyfill') {
      if (radioBgKeyFill) radioBgKeyFill.checked = true;
      chromaOptionsDiv.style.opacity = '0.4';
      chromaOptionsDiv.style.pointerEvents = 'none';
    } else {
      radioBgChroma.checked = true;
      chromaOptionsDiv.style.opacity = '1';
      chromaOptionsDiv.style.pointerEvents = 'auto';
    }

    // Colors & sliders
    const chroma = config.chromaColor || '#00FF00';
    inputChromaColor.value = chroma;
    inputChromaHex.value = chroma.toUpperCase();

    const border = config.borderColor || '#555555';
    inputBorderColor.value = border;
    inputBorderHex.value = border.toUpperCase();

    inputBorderWidth.value = String(config.borderWidthPx ?? 2);
    valBorderWidth.textContent = (config.borderWidthPx ?? 2) + 'px';

    const pvw = config.previewTallyColor || '#00CC00';
    inputPreviewColor.value = pvw;
    inputPreviewHex.value = pvw.toUpperCase();

    const pgm = config.programTallyColor || '#FF0000';
    inputProgramColor.value = pgm;
    inputProgramHex.value = pgm.toUpperCase();

    inputTallyWidth.value = String(config.tallyBorderWidthPx ?? 4);
    valTallyWidth.textContent = (config.tallyBorderWidthPx ?? 4) + 'px';

    checkShowBorders.checked = config.showBorders !== false;
    checkShowTally.checked = config.showTally !== false;
    checkShowLabels.checked = config.showLabels !== false;
  }

  function updateMockControls(payload) {
    const layout = payload.layout ?? 12;
    layoutButtons.forEach((btn) => {
      const btnLayout = parseInt(btn.getAttribute('data-layout'), 10);
      if (btnLayout === layout) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function renderRoutingTable(payload) {
    const windows = payload.windows || [];
    const config = payload.config || {};
    const hiddenSet = new Set(config.hiddenWindows || []);

    if (windows.length === 0) {
      routingTableBody.innerHTML = '<tr><td colspan="6" class="empty-cell">No active windows reported.</td></tr>';
      return;
    }

    routingTableBody.innerHTML = '';

    for (const w of windows) {
      const tr = document.createElement('tr');

      // Window Index
      const tdIdx = document.createElement('td');
      tdIdx.innerHTML = `<strong>#${w.windowIndex}</strong>`;
      tr.appendChild(tdIdx);

      // Grid Position
      const tdPos = document.createElement('td');
      const isSpan = (w.colSpan && w.colSpan > 1) || (w.rowSpan && w.rowSpan > 1);
      tdPos.textContent = `Col ${w.colStart}, Row ${w.rowStart} ${isSpan ? '(Large 2x2)' : '(1x1)'}`;
      tr.appendChild(tdPos);

      // Source ID
      const tdSrc = document.createElement('td');
      tdSrc.textContent = String(w.sourceId);
      tr.appendChild(tdSrc);

      // Input Name
      const tdName = document.createElement('td');
      tdName.textContent = w.longName || w.shortName || `Input ${w.sourceId}`;
      tr.appendChild(tdName);

      // Tally Status
      const tdTally = document.createElement('td');
      if (w.isProgram && w.isPreview) {
        tdTally.innerHTML = '<span class="badge badge-pgm">PGM</span> <span class="badge badge-pvw">PVW</span>';
      } else if (w.isProgram) {
        tdTally.innerHTML = '<span class="badge badge-pgm">PROGRAM</span>';
      } else if (w.isPreview) {
        tdTally.innerHTML = '<span class="badge badge-pvw">PREVIEW</span>';
      } else {
        tdTally.innerHTML = '<span class="badge badge-none">OFF AIR</span>';
      }
      tr.appendChild(tdTally);

      // Label Toggle Action
      const tdAction = document.createElement('td');
      const isHidden = hiddenSet.has(w.windowIndex) || w.hideLabel;
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = `btn btn-xs ${isHidden ? 'btn-secondary' : 'btn-primary'}`;
      toggleBtn.textContent = isHidden ? 'Label Hidden (Show)' : 'Label Visible (Hide)';
      toggleBtn.title = 'Toggle text label visibility on this window';
      toggleBtn.addEventListener('click', () => {
        socket.emit('toggleWindowLabel', w.windowIndex);
      });
      tdAction.appendChild(toggleBtn);
      tr.appendChild(tdAction);

      routingTableBody.appendChild(tr);
    }
  }

  // Event Listeners for Configuration Changes
  function emitConfigUpdate(partial) {
    socket.emit('updateConfig', partial);
  }

  // Connect / Apply IP
  btnApplyIp.addEventListener('click', () => {
    const ip = inputAtemIp.value.trim();
    if (!ip) {
      showToast('Please enter an ATEM IP address');
      return;
    }
    emitConfigUpdate({ atemIp: ip });
    showToast(`Connecting to ATEM at ${ip}...`);
  });

  inputAtemIp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnApplyIp.click();
    }
  });

  // Target MV and M/E
  selectTargetMv.addEventListener('change', () => {
    emitConfigUpdate({ targetMvIndex: parseInt(selectTargetMv.value, 10) });
  });

  selectMeIndex.addEventListener('change', () => {
    emitConfigUpdate({ meIndex: parseInt(selectMeIndex.value, 10) });
  });

  // Keying Mode
  radioBgChroma.addEventListener('change', () => {
    if (radioBgChroma.checked) {
      emitConfigUpdate({ bgMode: 'chroma' });
    }
  });

  radioBgTransparent.addEventListener('change', () => {
    if (radioBgTransparent.checked) {
      emitConfigUpdate({ bgMode: 'transparent' });
    }
  });

  if (radioBgKeyFill) {
    radioBgKeyFill.addEventListener('change', () => {
      if (radioBgKeyFill.checked) {
        emitConfigUpdate({ bgMode: 'keyfill' });
      }
    });
  }

  // Chroma Color
  inputChromaColor.addEventListener('input', () => {
    inputChromaHex.value = inputChromaColor.value.toUpperCase();
    emitConfigUpdate({ chromaColor: inputChromaColor.value });
  });

  inputChromaHex.addEventListener('change', () => {
    let val = inputChromaHex.value.trim();
    if (!val.startsWith('#')) val = '#' + val;
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      inputChromaColor.value = val;
      emitConfigUpdate({ chromaColor: val });
    }
  });

  document.querySelectorAll('.btn-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const color = btn.getAttribute('data-color');
      inputChromaColor.value = color;
      inputChromaHex.value = color.toUpperCase();
      emitConfigUpdate({ chromaColor: color });
    });
  });

  // Border Color & Width
  inputBorderColor.addEventListener('input', () => {
    inputBorderHex.value = inputBorderColor.value.toUpperCase();
    emitConfigUpdate({ borderColor: inputBorderColor.value });
  });

  inputBorderHex.addEventListener('change', () => {
    let val = inputBorderHex.value.trim();
    if (!val.startsWith('#')) val = '#' + val;
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      inputBorderColor.value = val;
      emitConfigUpdate({ borderColor: val });
    }
  });

  inputBorderWidth.addEventListener('input', () => {
    const val = parseInt(inputBorderWidth.value, 10);
    valBorderWidth.textContent = val + 'px';
    emitConfigUpdate({ borderWidthPx: val });
  });

  // Preview Tally Color
  inputPreviewColor.addEventListener('input', () => {
    inputPreviewHex.value = inputPreviewColor.value.toUpperCase();
    emitConfigUpdate({ previewTallyColor: inputPreviewColor.value });
  });

  inputPreviewHex.addEventListener('change', () => {
    let val = inputPreviewHex.value.trim();
    if (!val.startsWith('#')) val = '#' + val;
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      inputPreviewColor.value = val;
      emitConfigUpdate({ previewTallyColor: val });
    }
  });

  document.querySelectorAll('.btn-preset-pvw').forEach((btn) => {
    btn.addEventListener('click', () => {
      const color = btn.getAttribute('data-color');
      inputPreviewColor.value = color;
      inputPreviewHex.value = color.toUpperCase();
      emitConfigUpdate({ previewTallyColor: color });
    });
  });

  // Program Tally Color
  inputProgramColor.addEventListener('input', () => {
    inputProgramHex.value = inputProgramColor.value.toUpperCase();
    emitConfigUpdate({ programTallyColor: inputProgramColor.value });
  });

  inputProgramHex.addEventListener('change', () => {
    let val = inputProgramHex.value.trim();
    if (!val.startsWith('#')) val = '#' + val;
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      inputProgramColor.value = val;
      emitConfigUpdate({ programTallyColor: val });
    }
  });

  // Tally Border Width
  inputTallyWidth.addEventListener('input', () => {
    const val = parseInt(inputTallyWidth.value, 10);
    valTallyWidth.textContent = val + 'px';
    emitConfigUpdate({ tallyBorderWidthPx: val });
  });

  // Visibility Checkboxes
  checkShowBorders.addEventListener('change', () => {
    emitConfigUpdate({ showBorders: checkShowBorders.checked });
  });

  checkShowTally.addEventListener('change', () => {
    emitConfigUpdate({ showTally: checkShowTally.checked });
  });

  checkShowLabels.addEventListener('change', () => {
    emitConfigUpdate({ showLabels: checkShowLabels.checked });
  });

  // Simulation Toggle
  btnToggleMock.addEventListener('click', () => {
    if (!currentConfig) return;
    const nextMock = !currentConfig.mockMode;
    emitConfigUpdate({ mockMode: nextMock });
    showToast(nextMock ? 'Switched to Simulation Mode' : 'Switched to Hardware Mode');
  });

  // Simulation Layout Buttons
  layoutButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const layout = parseInt(btn.getAttribute('data-layout'), 10);
      socket.emit('setMockLayout', layout);
    });
  });

  // Simulation Tally Cut Buttons
  let currentSimPgm = 1;
  let currentSimPvw = 2;

  pvwButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      currentSimPvw = parseInt(btn.getAttribute('data-pvw'), 10);
      socket.emit('setMockTally', { programInput: currentSimPgm, previewInput: currentSimPvw });
    });
  });

  pgmButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      currentSimPgm = parseInt(btn.getAttribute('data-pgm'), 10);
      socket.emit('setMockTally', { programInput: currentSimPgm, previewInput: currentSimPvw });
    });
  });

  // Preview Switcher (/out Fill vs /key Key)
  function setPreviewRoute(route) {
    activePreviewRoute = route;
    if (btnPreviewFill && btnPreviewKey) {
      if (route === '/key') {
        btnPreviewKey.className = 'btn btn-xs btn-primary';
        btnPreviewFill.className = 'btn btn-xs btn-secondary';
      } else {
        btnPreviewFill.className = 'btn btn-xs btn-primary';
        btnPreviewKey.className = 'btn btn-xs btn-secondary';
      }
    }
    if (previewFrame) {
      previewFrame.src = `${route}?preview=1&t=${Date.now()}`;
    }
  }

  if (btnPreviewFill) {
    btnPreviewFill.addEventListener('click', () => setPreviewRoute('/out'));
  }

  if (btnPreviewKey) {
    btnPreviewKey.addEventListener('click', () => setPreviewRoute('/key'));
  }

  // Refresh Preview Frame & Connected /out and /key Views
  btnRefreshPreview.addEventListener('click', () => {
    socket.emit('reloadOutput');
    if (previewFrame) {
      previewFrame.src = `${activePreviewRoute}?preview=1&t=${Date.now()}`;
    }
    showToast('Reloaded preview and connected /out & /key views');
  });

  // Copy Output URLs
  async function copyRouteUrl(route, label) {
    const url = `${window.location.origin}${route}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const temp = document.createElement('input');
        temp.value = url;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }
      showToast(`${label} URL copied to clipboard!`);
    } catch (err) {
      showToast('Copied: ' + url);
    }
  }

  btnCopyUrl.addEventListener('click', () => {
    copyRouteUrl('/out', 'Fill / Output (/out)');
  });

  if (btnCopyKeyUrl) {
    btnCopyKeyUrl.addEventListener('click', () => {
      copyRouteUrl('/key', 'Key (/key)');
    });
  }

  // Toast Notification
  let toastTimer = null;
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }
})();
