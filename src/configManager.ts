import fs from 'fs';
import path from 'path';
import { AppConfig } from './types';

const CONFIG_FILE_PATH = path.join(process.cwd(), 'config.json');

export const DEFAULT_CONFIG: AppConfig = {
  atemIp: '192.168.10.240',
  targetMvIndex: 0,
  bgMode: 'chroma',
  chromaColor: '#00FF00',
  borderColor: '#555555',
  borderWidthPx: 2,
  showBorders: true,
  showLabels: true,
  showTally: true,
  meIndex: 0,
  previewTallyColor: '#00CC00',
  programTallyColor: '#FF0000',
  tallyBorderWidthPx: 4,
  mockMode: false,
  hiddenWindows: [],
  port: 3000
};

class ConfigManager {
  private config: AppConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): AppConfig {
    try {
      if (fs.existsSync(CONFIG_FILE_PATH)) {
        const raw = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        const merged: AppConfig = { ...DEFAULT_CONFIG, ...parsed };
        return merged;
      }
    } catch (err) {
      console.error('[ConfigManager] Failed to read config.json, using defaults:', err);
    }

    this.saveToFile(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }

  private saveToFile(cfg: AppConfig): void {
    try {
      fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ConfigManager] Failed to write config.json:', err);
    }
  }

  public getConfig(): AppConfig {
    return { ...this.config };
  }

  public updateConfig(partial: Partial<AppConfig>): AppConfig {
    // Validate inputs
    const updated: AppConfig = {
      ...this.config,
      ...partial
    };

    // Ensure valid bounds
    if (typeof updated.targetMvIndex === 'number') {
      updated.targetMvIndex = Math.max(0, Math.min(3, Math.floor(updated.targetMvIndex)));
    }
    if (typeof updated.meIndex === 'number') {
      updated.meIndex = Math.max(0, Math.min(3, Math.floor(updated.meIndex)));
    }
    if (typeof updated.borderWidthPx === 'number') {
      updated.borderWidthPx = Math.max(0, Math.min(20, Math.floor(updated.borderWidthPx)));
    }
    if (typeof updated.tallyBorderWidthPx === 'number') {
      updated.tallyBorderWidthPx = Math.max(1, Math.min(30, Math.floor(updated.tallyBorderWidthPx)));
    }
    if (updated.bgMode !== 'chroma' && updated.bgMode !== 'transparent' && updated.bgMode !== 'keyfill') {
      updated.bgMode = 'chroma';
    }
    if (!Array.isArray(updated.hiddenWindows)) {
      updated.hiddenWindows = [];
    }

    this.config = updated;
    this.saveToFile(this.config);
    return { ...this.config };
  }
}

export const configManager = new ConfigManager();
