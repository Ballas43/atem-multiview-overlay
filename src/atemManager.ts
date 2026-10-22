import { Atem, Enums, listVisibleInputs } from 'atem-connection';
import { EventEmitter } from 'events';
import { AppConfig, DropdownOption, MultiviewStatePayload, WindowData } from './types';
import { configManager } from './configManager';

// Fallback lookup table for well-known ATEM source IDs matching Blackmagic protocol
const WELL_KNOWN_SOURCES: Record<number, { long: string; short: string }> = {
  0: { long: 'Black', short: 'BLK' },
  1000: { long: 'Color Bars', short: 'BARS' },
  2001: { long: 'Color 1', short: 'COL1' },
  2002: { long: 'Color 2', short: 'COL2' },
  3010: { long: 'Media Player 1', short: 'MP1' },
  3011: { long: 'Media Player 1 Key', short: 'MP1K' },
  3020: { long: 'Media Player 2', short: 'MP2' },
  3021: { long: 'Media Player 2 Key', short: 'MP2K' },
  3030: { long: 'Media Player 3', short: 'MP3' },
  3031: { long: 'Media Player 3 Key', short: 'MP3K' },
  3040: { long: 'Media Player 4', short: 'MP4' },
  3041: { long: 'Media Player 4 Key', short: 'MP4K' },
  4010: { long: 'ME 1 Key 1 Mask', short: 'M1K1' },
  4020: { long: 'ME 1 Key 2 Mask', short: 'M1K2' },
  4030: { long: 'ME 1 Key 3 Mask', short: 'M1K3' },
  4040: { long: 'ME 1 Key 4 Mask', short: 'M1K4' },
  4050: { long: 'ME 2 Key 1 Mask', short: 'M2K1' },
  4060: { long: 'ME 2 Key 2 Mask', short: 'M2K2' },
  4070: { long: 'ME 2 Key 3 Mask', short: 'M2K3' },
  4080: { long: 'ME 2 Key 4 Mask', short: 'M2K4' },
  4090: { long: 'ME 3 Key 1 Mask', short: 'M3K1' },
  4100: { long: 'ME 3 Key 2 Mask', short: 'M3K2' },
  4110: { long: 'ME 3 Key 3 Mask', short: 'M3K3' },
  4120: { long: 'ME 3 Key 4 Mask', short: 'M3K4' },
  4130: { long: 'ME 4 Key 1 Mask', short: 'M4K1' },
  4140: { long: 'ME 4 Key 2 Mask', short: 'M4K2' },
  4150: { long: 'ME 4 Key 3 Mask', short: 'M4K3' },
  4160: { long: 'ME 4 Key 4 Mask', short: 'M4K4' },
  5010: { long: 'DSK 1 Mask', short: 'DK1M' },
  5020: { long: 'DSK 2 Mask', short: 'DK2M' },
  5030: { long: 'DSK 3 Mask', short: 'DK3M' },
  5040: { long: 'DSK 4 Mask', short: 'DK4M' },
  6000: { long: 'SuperSource 1', short: 'SS1' },
  6001: { long: 'SuperSource 2', short: 'SS2' },
  7001: { long: 'Clean Feed 1', short: 'CFD1' },
  7002: { long: 'Clean Feed 2', short: 'CFD2' },
  7003: { long: 'Clean Feed 3', short: 'CFD3' },
  7004: { long: 'Clean Feed 4', short: 'CFD4' },
  9101: { long: 'Audio Meters', short: 'AUD' },
  9200: { long: 'Streaming Status', short: 'STRM' },
  9201: { long: 'Recording Status', short: 'REC' },
  9202: { long: 'Audio Status', short: 'AUD' },
  10010: { long: 'Program', short: 'M/E1' },
  10011: { long: 'Preview', short: 'PVW1' },
  10020: { long: 'ME 2', short: 'M/E2' },
  10021: { long: 'ME 2 PVW', short: 'PVW2' },
  10030: { long: 'ME 3', short: 'M/E3' },
  10031: { long: 'ME 3 PVW', short: 'PVW3' },
  10040: { long: 'ME 4', short: 'M/E4' },
  10041: { long: 'ME 4 PVW', short: 'PVW4' },
};

// Dedicated status widget IDs (e.g. ATEM Mini Pro/Extreme status views)
const WIDGET_SOURCES = new Set([9101, 9200, 9201, 9202]);

export class AtemManager extends EventEmitter {
  private atem: Atem | null = null;
  private isAtemConnected: boolean = false;
  private currentIp: string = '';
  private lastPayload: MultiviewStatePayload | null = null;
  private stateThrottleTimer: NodeJS.Timeout | null = null;

  // Mock State for offline / simulation mode (16 windows in 4x4 row-major order)
  private mockLayout: number = 12; // Default ProgramTop (Q1=0 large, Q2=2 large, Q3/Q4 subdivided)
  private mockProgramInput: number = 1;
  private mockPreviewInput: number = 2;
  private mockWindowSources: number[] = [
    10010, // Window 0 (Row 1, Col 1 - Q1 Top-Left / Q1 Large)
    1,     // Window 1 (Row 1, Col 2 - Q1 Top-Right)
    10011, // Window 2 (Row 1, Col 3 - Q2 Top-Left / Q2 Large)
    2,     // Window 3 (Row 1, Col 4 - Q2 Top-Right)
    3,     // Window 4 (Row 2, Col 1 - Q1 Bottom-Left)
    4,     // Window 5 (Row 2, Col 2 - Q1 Bottom-Right)
    5,     // Window 6 (Row 2, Col 3 - Q2 Bottom-Left)
    6,     // Window 7 (Row 2, Col 4 - Q2 Bottom-Right)
    1,     // Window 8 (Row 3, Col 1 - Q3 Top-Left / Q3 Large)
    2,     // Window 9 (Row 3, Col 2 - Q3 Top-Right)
    3,     // Window 10 (Row 3, Col 3 - Q4 Top-Left / Q4 Large)
    4,     // Window 11 (Row 3, Col 4 - Q4 Top-Right)
    5,     // Window 12 (Row 4, Col 1 - Q3 Bottom-Left)
    6,     // Window 13 (Row 4, Col 2 - Q3 Bottom-Right)
    7,     // Window 14 (Row 4, Col 3 - Q4 Bottom-Left)
    8      // Window 15 (Row 4, Col 4 - Q4 Bottom-Right)
  ];

  constructor() {
    super();
  }

  public init(): void {
    const config = configManager.getConfig();
    if (config.mockMode) {
      console.log('[AtemManager] Starting in Mock Mode (offline simulation)');
      this.broadcastState();
    } else {
      console.log(`[AtemManager] Initializing ATEM connection to ${config.atemIp}...`);
      this.connectToAtem(config.atemIp);
    }
  }

  public connectToAtem(ip: string): void {
    if (this.atem) {
      try {
        this.atem.disconnect();
        this.atem.removeAllListeners();
      } catch (err) {
        console.warn('[AtemManager] Error while disconnecting existing ATEM instance:', err);
      }
      this.atem = null;
    }

    this.currentIp = ip;
    this.isAtemConnected = false;
    this.broadcastState();

    try {
      this.atem = new Atem();

      this.atem.on('connected', () => {
        console.log(`[AtemManager] Connected to ATEM at ${this.currentIp}`);
        this.isAtemConnected = true;
        this.broadcastState();
      });

      this.atem.on('disconnected', () => {
        console.warn(`[AtemManager] Disconnected from ATEM at ${this.currentIp}`);
        this.isAtemConnected = false;
        this.broadcastState();
      });

      this.atem.on('error', (err: string | Error) => {
        console.error('[AtemManager] ATEM connection error:', err);
      });

      this.atem.on('stateChanged', (_state, pathToChange) => {
        let isRelevant = false;
        if (Array.isArray(pathToChange)) {
          isRelevant =
            pathToChange.length === 0 ||
            pathToChange.some(
              (p: string) =>
                p.startsWith('video.') ||
                p.startsWith('inputs') ||
                p.startsWith('settings.multiViewers') ||
                p.startsWith('info')
            );
        } else {
          isRelevant = true;
        }

        if (isRelevant) {
          this.scheduleBroadcast();
        }
      });

      this.atem.connect(ip).catch((err) => {
        console.error(`[AtemManager] Failed to initiate connection to ${ip}:`, err);
      });
    } catch (err) {
      console.error('[AtemManager] Exception creating Atem instance:', err);
    }
  }

  private scheduleBroadcast(): void {
    if (this.stateThrottleTimer) return;
    this.stateThrottleTimer = setTimeout(() => {
      this.stateThrottleTimer = null;
      this.broadcastState();
    }, 15);
  }

  public getAtemInstance(): Atem | null {
    return this.atem;
  }

  public getStatePayload(): MultiviewStatePayload {
    const config = configManager.getConfig();

    if (config.mockMode || !this.atem || !this.isAtemConnected) {
      if (!config.mockMode && this.lastPayload && !this.isAtemConnected) {
        // Retain last known grid state on screen rather than flashing white/clearing borders mid-show,
        // while still applying any local config changes (like bgMode, colors, hiddenWindows)
        const updatedWindows = this.lastPayload.windows.map((w) => ({
          ...w,
          hideLabel: config.hiddenWindows.includes(w.windowIndex) || WIDGET_SOURCES.has(w.sourceId)
        }));
        return {
          ...this.lastPayload,
          connected: false,
          atemIp: config.atemIp,
          windows: updatedWindows,
          config
        };
      }
      return this.buildMockPayload(config);
    }

    try {
      const state = this.atem.state;
      if (!state) {
        return this.buildMockPayload(config);
      }

      const modelName =
        state.info?.productIdentifier ||
        (state.info?.model !== undefined
          ? Enums.Model[state.info.model] || `ATEM Model ${state.info.model}`
          : 'Blackmagic ATEM');

      // Dynamically determine available Multiviewers and Mix Effects from ATEM state
      const definedMvs = (state.settings?.multiViewers || []).filter(Boolean).length;
      const capMvs = Number((state.info?.capabilities as any)?.multiviewers) || 0;
      const mvCount = Math.max(
        state.info?.multiviewer?.count && state.info.multiviewer.count > 0 ? state.info.multiviewer.count : 0,
        capMvs > 0 ? capMvs : 0,
        definedMvs,
        1
      );

      const definedMes = (state.video?.mixEffects || []).filter(Boolean).length;
      const infoMes = (state.info?.mixEffects || []).filter(Boolean).length;
      const meCount = Math.max(
        state.info?.capabilities?.mixEffects && state.info.capabilities.mixEffects > 0
          ? state.info.capabilities.mixEffects
          : 0,
        infoMes,
        definedMes,
        1
      );

      const mvOptions: DropdownOption[] = [];
      for (let i = 0; i < mvCount; i++) {
        const mvInput = state.inputs?.[9001 + i];
        const customName =
          mvInput?.longName && mvInput.longName !== '-' && !mvInput.areNamesDefault
            ? mvInput.longName
            : `Multiviewer ${i + 1}`;
        mvOptions.push({
          index: i,
          label: `MV ${i + 1} (${customName})`
        });
      }

      const meOptions: DropdownOption[] = [];
      for (let i = 0; i < meCount; i++) {
        const meInput = state.inputs?.[10010 + i * 10];
        const customName =
          meInput?.longName && meInput.longName !== '-' && meInput.longName !== `ME ${i + 1}`
            ? meInput.longName
            : null;
        meOptions.push({
          index: i,
          label: customName ? `M/E ${i + 1} (${customName})` : `M/E ${i + 1}`
        });
      }

      // Clamp targetMvIndex and meIndex to available hardware range
      const targetMvIndex = Math.min(Math.max(0, config.targetMvIndex || 0), mvCount - 1);
      const meIndex = Math.min(Math.max(0, config.meIndex || 0), meCount - 1);

      const mv = state.settings?.multiViewers?.[targetMvIndex];
      const rawWindows = mv?.windows || [];
      const isClassic10View = rawWindows.length > 0 && rawWindows.length <= 10 && rawWindows[10] === undefined;

      // On older 10-view switchers (< v8.0), mv.properties may be undefined; default to 12 (ProgramTop)
      const rawLayout = mv?.properties?.layout ?? (isClassic10View ? 12 : 0);

      // Extract Program & Preview visible inputs
      const pgmInputs = this.computeVisibleInputs('program', state, meIndex);
      const pvwInputs = this.computeVisibleInputs('preview', state, meIndex);

      // Build active windows for the layout
      const windows = this.buildWindowsFromAtem(mv, rawLayout, pgmInputs, pvwInputs, config);

      const payload: MultiviewStatePayload = {
        connected: this.isAtemConnected,
        atemModel: modelName,
        atemIp: config.atemIp,
        mvIndex: targetMvIndex,
        layout: rawLayout,
        windows,
        config,
        availableMultiViewers: mvCount,
        availableMEs: meCount,
        mvOptions,
        meOptions
      };

      this.lastPayload = payload;
      return payload;
    } catch (err) {
      console.error('[AtemManager] Error compiling state payload:', err);
      return this.buildMockPayload(config);
    }
  }

  private computeVisibleInputs(mode: 'program' | 'preview', state: any, meIndex: number): number[] {
    try {
      const visible = listVisibleInputs(mode, state, meIndex);
      return visible;
    } catch (_err) {
      const me = state.video?.mixEffects?.[meIndex];
      if (!me) return [];
      return [mode === 'program' ? me.programInput : me.previewInput];
    }
  }

  private buildWindowsFromAtem(
    mv: any,
    layout: number,
    pgmInputs: number[],
    pvwInputs: number[],
    config: AppConfig
  ): WindowData[] {
    const windowsData: WindowData[] = [];
    const atemInputs = this.atem?.state?.inputs || {};
    const rawWindows = mv?.windows || [];

    // Detect classic 10-window Multiviewer vs standard 16-window (4x4 row-major) Multiviewer
    const isClassic10View = rawWindows.length > 0 && rawWindows.length <= 10 && rawWindows[10] === undefined;
    const swapped = !!mv?.properties?.programPreviewSwapped;

    // In 16-window ATEM Multiviewers (Constellation, Extreme, 2 M/E, 4 M/E), the 4x4 grid is indexed row-by-row:
    //   Row 1:  0,  1 (Q1 top)    |  2,  3 (Q2 top)
    //   Row 2:  4,  5 (Q1 bottom) |  6,  7 (Q2 bottom)
    //   Row 3:  8,  9 (Q3 top)    | 10, 11 (Q4 top)
    //   Row 4: 12, 13 (Q3 bottom) | 14, 15 (Q4 bottom)
    // When a quadrant is Large (2x2), ATEM uses its top-left cell index:
    //   Q1 Large = 0, Q2 Large = 2, Q3 Large = 8, Q4 Large = 10.
    let quadrants: Array<{
      qIndex: number;
      subdivided: boolean;
      largeWindowIndex: number;
      subWindowIndices: number[];
      colStart: number;
      rowStart: number;
    }>;

    if (!isClassic10View) {
      quadrants = [
        {
          qIndex: 0,
          subdivided: (layout & 1) !== 0,
          largeWindowIndex: 0,
          subWindowIndices: [0, 1, 4, 5],
          colStart: 1,
          rowStart: 1
        },
        {
          qIndex: 1,
          subdivided: (layout & 2) !== 0,
          largeWindowIndex: 2,
          subWindowIndices: [2, 3, 6, 7],
          colStart: 3,
          rowStart: 1
        },
        {
          qIndex: 2,
          subdivided: (layout & 4) !== 0,
          largeWindowIndex: 8,
          subWindowIndices: [8, 9, 12, 13],
          colStart: 1,
          rowStart: 3
        },
        {
          qIndex: 3,
          subdivided: (layout & 8) !== 0,
          largeWindowIndex: 10,
          subWindowIndices: [10, 11, 14, 15],
          colStart: 3,
          rowStart: 3
        }
      ];
    } else {
      // Classic 10-window switcher (windows 0 & 1 are large PGM/PVW, windows 2..9 are 8 small boxes)
      const firstLarge = swapped ? 1 : 0;
      const secondLarge = swapped ? 0 : 1;
      let largeCounter = 0;
      let smallGroupCounter = 0;
      const smallGroups = [
        [2, 3, 6, 7],
        [4, 5, 8, 9]
      ];
      const coords = [
        { colStart: 1, rowStart: 1, bit: 1 },
        { colStart: 3, rowStart: 1, bit: 2 },
        { colStart: 1, rowStart: 3, bit: 4 },
        { colStart: 3, rowStart: 3, bit: 8 }
      ];
      quadrants = coords.map((c, idx) => {
        const sub = (layout & c.bit) !== 0;
        const largeIdx = largeCounter++ === 0 ? firstLarge : secondLarge;
        const subIdxArr = smallGroups[smallGroupCounter++ % 2];
        return {
          qIndex: idx,
          subdivided: sub,
          largeWindowIndex: largeIdx,
          subWindowIndices: subIdxArr,
          colStart: c.colStart,
          rowStart: c.rowStart
        };
      });
    }

    const subOffsets = [
      { dc: 0, dr: 0 },
      { dc: 1, dr: 0 },
      { dc: 0, dr: 1 },
      { dc: 1, dr: 1 }
    ];

    for (const q of quadrants) {
      if (!q.subdivided) {
        const wIdx = q.largeWindowIndex;
        const wObj = rawWindows[wIdx];
        const sourceId = wObj?.source ?? (q.qIndex === 0 ? 10010 : q.qIndex === 1 ? 10011 : q.qIndex + 1);

        const { longName, shortName } = this.resolveInputNames(sourceId, atemInputs);
        const isProgram = pgmInputs.includes(sourceId);
        const isPreview = pvwInputs.includes(sourceId);
        const hideLabel = config.hiddenWindows.includes(wIdx) || WIDGET_SOURCES.has(sourceId);

        windowsData.push({
          windowIndex: wIdx,
          sourceId,
          longName,
          shortName,
          isProgram,
          isPreview,
          hideLabel,
          colStart: q.colStart,
          colSpan: 2,
          rowStart: q.rowStart,
          rowSpan: 2
        });
      } else {
        for (let sub = 0; sub < 4; sub++) {
          const wIdx = q.subWindowIndices[sub];
          const wObj = rawWindows[wIdx];
          const sourceId = wObj?.source ?? (wIdx + 1);

          const { longName, shortName } = this.resolveInputNames(sourceId, atemInputs);
          const isProgram = pgmInputs.includes(sourceId);
          const isPreview = pvwInputs.includes(sourceId);
          const hideLabel = config.hiddenWindows.includes(wIdx) || WIDGET_SOURCES.has(sourceId);

          windowsData.push({
            windowIndex: wIdx,
            sourceId,
            longName,
            shortName,
            isProgram,
            isPreview,
            hideLabel,
            colStart: q.colStart + subOffsets[sub].dc,
            colSpan: 1,
            rowStart: q.rowStart + subOffsets[sub].dr,
            rowSpan: 1
          });
        }
      }
    }

    // Sort by windowIndex ascending so the Routing Inspector Table lists windows in clean numerical order
    windowsData.sort((a, b) => a.windowIndex - b.windowIndex);

    return windowsData;
  }

  private resolveInputNames(
    sourceId: number,
    atemInputs: Record<number, any>
  ): { longName: string; shortName: string } {
    const input = atemInputs[sourceId];
    if (input) {
      const rawLong = typeof input.longName === 'string' ? input.longName.trim() : '';
      const rawShort = typeof input.shortName === 'string' ? input.shortName.trim() : '';
      const longName = rawLong || rawShort || `Input ${sourceId}`;
      const shortName = rawShort || rawLong || `In${sourceId}`;
      return { longName, shortName };
    }

    const wellKnown = WELL_KNOWN_SOURCES[sourceId];
    if (wellKnown) {
      return { longName: wellKnown.long, shortName: wellKnown.short };
    }

    if (sourceId >= 8001 && sourceId <= 8099) {
      const auxNum = sourceId - 8000;
      return { longName: `Auxiliary ${auxNum}`, shortName: `AUX${auxNum}` };
    }

    if (sourceId >= 9001 && sourceId <= 9016) {
      const mvNum = sourceId - 9000;
      return { longName: `MultiViewer ${mvNum}`, shortName: `MV${mvNum}` };
    }

    if (sourceId >= 1 && sourceId <= 100) {
      return { longName: `Input ${sourceId}`, shortName: `In${sourceId}` };
    }

    return { longName: `Source ${sourceId}`, shortName: `S${sourceId}` };
  }

  private buildMockPayload(config: AppConfig): MultiviewStatePayload {
    const layout = this.mockLayout;
    const pgmInputs = [this.mockProgramInput];
    const pvwInputs = [this.mockPreviewInput];

    const quadrants = [
      {
        qIndex: 0,
        subdivided: (layout & 1) !== 0,
        largeWindowIndex: 0,
        subWindowIndices: [0, 1, 4, 5],
        colStart: 1,
        rowStart: 1
      },
      {
        qIndex: 1,
        subdivided: (layout & 2) !== 0,
        largeWindowIndex: 2,
        subWindowIndices: [2, 3, 6, 7],
        colStart: 3,
        rowStart: 1
      },
      {
        qIndex: 2,
        subdivided: (layout & 4) !== 0,
        largeWindowIndex: 8,
        subWindowIndices: [8, 9, 12, 13],
        colStart: 1,
        rowStart: 3
      },
      {
        qIndex: 3,
        subdivided: (layout & 8) !== 0,
        largeWindowIndex: 10,
        subWindowIndices: [10, 11, 14, 15],
        colStart: 3,
        rowStart: 3
      }
    ];

    const windowsData: WindowData[] = [];
    const subOffsets = [
      { dc: 0, dr: 0 },
      { dc: 1, dr: 0 },
      { dc: 0, dr: 1 },
      { dc: 1, dr: 1 }
    ];

    for (const q of quadrants) {
      if (!q.subdivided) {
        const wIdx = q.largeWindowIndex;
        const sourceId = this.mockWindowSources[wIdx] ?? (q.qIndex === 0 ? 10010 : q.qIndex === 1 ? 10011 : q.qIndex);
        const { longName, shortName } = this.resolveInputNames(sourceId, {});
        const isProgram = pgmInputs.includes(sourceId);
        const isPreview = pvwInputs.includes(sourceId);
        const hideLabel = config.hiddenWindows.includes(wIdx) || WIDGET_SOURCES.has(sourceId);

        windowsData.push({
          windowIndex: wIdx,
          sourceId,
          longName,
          shortName,
          isProgram,
          isPreview,
          hideLabel,
          colStart: q.colStart,
          colSpan: 2,
          rowStart: q.rowStart,
          rowSpan: 2
        });
      } else {
        for (let sub = 0; sub < 4; sub++) {
          const wIdx = q.subWindowIndices[sub];
          const sourceId = this.mockWindowSources[wIdx] ?? (wIdx + 1);
          const { longName, shortName } = this.resolveInputNames(sourceId, {});
          const isProgram = pgmInputs.includes(sourceId);
          const isPreview = pvwInputs.includes(sourceId);
          const hideLabel = config.hiddenWindows.includes(wIdx) || WIDGET_SOURCES.has(sourceId);

          windowsData.push({
            windowIndex: wIdx,
            sourceId,
            longName,
            shortName,
            isProgram,
            isPreview,
            hideLabel,
            colStart: q.colStart + subOffsets[sub].dc,
            colSpan: 1,
            rowStart: q.rowStart + subOffsets[sub].dr,
            rowSpan: 1
          });
        }
      }
    }

    windowsData.sort((a, b) => a.windowIndex - b.windowIndex);

    const mvOptions: DropdownOption[] = [0, 1, 2, 3].map((i) => ({
      index: i,
      label: `MV ${i + 1} (Multiviewer ${i + 1})`
    }));

    const meOptions: DropdownOption[] = [0, 1, 2, 3].map((i) => ({
      index: i,
      label: `M/E ${i + 1}`
    }));

    return {
      connected: config.mockMode ? true : this.isAtemConnected,
      atemModel: config.mockMode ? 'ATEM Constellation 8K (Simulated)' : 'Connecting...',
      atemIp: config.atemIp,
      mvIndex: config.targetMvIndex,
      layout,
      windows: windowsData,
      config,
      availableMultiViewers: 4,
      availableMEs: 4,
      mvOptions,
      meOptions
    };
  }

  // Simulation helpers for testing without hardware
  public setMockLayout(layout: number): void {
    this.mockLayout = layout;
    this.broadcastState();
  }

  public setMockTally(programInput: number, previewInput: number): void {
    this.mockProgramInput = programInput;
    this.mockPreviewInput = previewInput;
    this.broadcastState();
  }

  public setMockWindowSource(windowIndex: number, sourceId: number): void {
    if (windowIndex >= 0 && windowIndex < 16) {
      this.mockWindowSources[windowIndex] = sourceId;
      this.broadcastState();
    }
  }

  public broadcastState(): void {
    const payload = this.getStatePayload();
    this.emit('stateUpdate', payload);
  }
}

export const atemManager = new AtemManager();
