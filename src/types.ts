export interface AppConfig {
  atemIp: string;
  targetMvIndex: number;        // 0-indexed (0 = MV 1, 1 = MV 2, etc.)
  bgMode: 'chroma' | 'transparent' | 'keyfill';
  chromaColor: string;          // Default: '#00FF00'
  borderColor: string;          // Default: '#555555'
  borderWidthPx: number;        // Default: 2
  showBorders: boolean;         // Default: true
  showLabels: boolean;          // Default: true
  showTally: boolean;           // Default: true
  meIndex: number;              // Which M/E to track for tally (Default: 0 for M/E 1)
  previewTallyColor: string;    // Default: '#00CC00' or '#FFAA00' (avoids chroma key clash)
  programTallyColor: string;    // Default: '#FF0000'
  tallyBorderWidthPx: number;   // Default: 4
  mockMode: boolean;            // Allows offline testing with simulated switcher
  hiddenWindows: number[];      // Window indices (0..15) where label is explicitly hidden
  port: number;                 // Server listening port (default: 3000)
}

export interface WindowData {
  windowIndex: number;          // 0 to 15
  sourceId: number;             // ATEM raw input ID
  longName: string;             // e.g., "Camera 1" or "First Line"
  shortName: string;            // e.g., "Cam1"
  isProgram: boolean;           // Red border trigger
  isPreview: boolean;           // Green border trigger
  hideLabel?: boolean;          // Per-window label hiding (for special widgets)
  colStart?: number;            // CSS grid column start: 1..4
  colSpan?: number;             // CSS grid column span: 1 or 2
  rowStart?: number;            // CSS grid row start: 1..4
  rowSpan?: number;             // CSS grid row span: 1 or 2
}

export interface DropdownOption {
  index: number;
  label: string;
}

export interface MultiviewStatePayload {
  connected: boolean;
  atemModel: string;
  atemIp: string;
  mvIndex: number;
  layout: number;               // Raw ATEM layout bitmask (0 to 15)
  windows: WindowData[];        // Array of active windows based on layout
  config: AppConfig;
  availableMultiViewers: number;
  availableMEs: number;
  mvOptions: DropdownOption[];
  meOptions: DropdownOption[];
}
