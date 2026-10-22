import express from 'express';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { configManager } from './configManager';
import { atemManager } from './atemManager';
import { AppConfig } from './types';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(express.json());
app.use(
  express.static(path.join(process.cwd(), 'public'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  })
);

// Routes
app.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.get('/out', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.sendFile(path.join(process.cwd(), 'public', 'out.html'));
});

app.get('/key', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.sendFile(path.join(process.cwd(), 'public', 'key.html'));
});

// REST API endpoints
app.get('/api/state', (_req, res) => {
  res.json(atemManager.getStatePayload());
});

app.get('/api/config', (_req, res) => {
  res.json(configManager.getConfig());
});

app.post('/api/config', (req, res) => {
  const previousConfig = configManager.getConfig();
  const updatedConfig = configManager.updateConfig(req.body);

  if (
    updatedConfig.mockMode !== previousConfig.mockMode ||
    (!updatedConfig.mockMode && updatedConfig.atemIp !== previousConfig.atemIp)
  ) {
    if (updatedConfig.mockMode) {
      console.log('[Server] Switched to Mock Mode');
      atemManager.broadcastState();
    } else {
      console.log(`[Server] Reconnecting ATEM to IP: ${updatedConfig.atemIp}`);
      atemManager.connectToAtem(updatedConfig.atemIp);
    }
  } else {
    atemManager.broadcastState();
  }

  res.json({ success: true, config: updatedConfig });
});

// Socket.io Events
io.on('connection', (socket) => {
  // Immediately emit current state to newly connected client
  socket.emit('stateUpdate', atemManager.getStatePayload());

  // Handle config updates from Control Panel
  socket.on('updateConfig', (partialConfig: Partial<AppConfig>) => {
    const previousConfig = configManager.getConfig();
    const updatedConfig = configManager.updateConfig(partialConfig);

    const ipChanged = updatedConfig.atemIp !== previousConfig.atemIp;
    const mockChanged = updatedConfig.mockMode !== previousConfig.mockMode;

    if (mockChanged || (!updatedConfig.mockMode && ipChanged)) {
      if (updatedConfig.mockMode) {
        atemManager.broadcastState();
      } else {
        atemManager.connectToAtem(updatedConfig.atemIp);
      }
    } else {
      atemManager.broadcastState();
    }
  });

  // Mock Control events (Simulation Mode)
  socket.on('setMockLayout', (layout: number) => {
    atemManager.setMockLayout(layout);
  });

  socket.on('setMockTally', (data: { programInput: number; previewInput: number }) => {
    atemManager.setMockTally(data.programInput, data.previewInput);
  });

  socket.on('setMockSource', (data: { windowIndex: number; sourceId: number }) => {
    atemManager.setMockWindowSource(data.windowIndex, data.sourceId);
  });

  // Toggle Hide Label for a specific window
  socket.on('toggleWindowLabel', (windowIndex: number) => {
    const config = configManager.getConfig();
    const hidden = new Set(config.hiddenWindows || []);
    if (hidden.has(windowIndex)) {
      hidden.delete(windowIndex);
    } else {
      hidden.add(windowIndex);
    }
    configManager.updateConfig({ hiddenWindows: Array.from(hidden) });
    atemManager.broadcastState();
  });

  // Force reload all connected /out views
  socket.on('reloadOutput', () => {
    io.emit('reloadOutput');
  });
});

// Relay ATEM state changes to all connected Socket.io clients
atemManager.on('stateUpdate', (payload) => {
  io.emit('stateUpdate', payload);
});

// Start Server
const config = configManager.getConfig();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : config.port || 3000;

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` ATEM Multiview Overlay (MVO) running on port ${PORT}`);
  console.log(` Control Panel: http://localhost:${PORT}/`);
  console.log(` Output / Fill: http://localhost:${PORT}/out`);
  console.log(` Key Output:    http://localhost:${PORT}/key`);
  console.log(`====================================================`);
  atemManager.init();
});
