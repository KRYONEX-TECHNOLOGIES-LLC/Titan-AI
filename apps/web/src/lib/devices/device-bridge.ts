/**
 * Titan Device Bridge — unified smart home / IoT control layer.
 *
 * Provides a generic device_command interface that Alfred and the tool
 * registry use. Under the hood, pluggable integrations (Home Assistant,
 * Tuya, custom webhooks, etc.) do the actual work.
 *
 * Nexus add-ons can register new integrations.
 */

export type DeviceType = 'thermostat' | 'light' | 'camera' | 'lock' | 'sensor' | 'switch' | 'speaker' | 'display' | 'other';

export type DeviceAction =
  | 'on' | 'off' | 'toggle'
  | 'set_temp' | 'set_brightness' | 'set_color' | 'set_volume'
  | 'lock' | 'unlock'
  | 'snapshot' | 'stream'
  | 'arm' | 'disarm'
  | 'status' | 'info';

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  location: string;
  integration: string;
  state: Record<string, unknown>;
  lastSeen: number;
  online: boolean;
}

export interface DeviceCommandResult {
  success: boolean;
  deviceId: string;
  action: string;
  output: string;
  data?: Record<string, unknown>;
  error?: string;
}

export interface DeviceIntegration {
  id: string;
  name: string;
  execute(device: Device, action: DeviceAction, params?: Record<string, unknown>): Promise<DeviceCommandResult>;
  listDevices(): Promise<Device[]>;
  getStatus(device: Device): Promise<Record<string, unknown>>;
}

const DEVICES_KEY = 'titan-devices';
const INTEGRATIONS_KEY = 'titan-device-integrations-config';

function loadDevices(): Device[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DEVICES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveDevices(devices: Device[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DEVICES_KEY, JSON.stringify(devices));
  } catch { /* quota */ }
}

// ═══ Home Assistant Integration ═══

interface HAConfig {
  url: string;
  token: string;
}

function loadHAConfig(): HAConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(INTEGRATIONS_KEY);
    if (!raw) return null;
    const configs = JSON.parse(raw);
    return configs.homeassistant || null;
  } catch { return null; }
}

class HomeAssistantIntegration implements DeviceIntegration {
  id = 'homeassistant';
  name = 'Home Assistant';

  private getConfig(): HAConfig | null {
    return loadHAConfig();
  }

  async execute(device: Device, action: DeviceAction, params?: Record<string, unknown>): Promise<DeviceCommandResult> {
    const cfg = this.getConfig();
    if (!cfg) return { success: false, deviceId: device.id, action, output: '', error: 'Home Assistant not configured. Set URL and token in Settings > Devices.' };

    try {
      const entityId = device.state.entityId as string || device.id;
      let domain = 'homeassistant';
      let service: string = action;

      switch (device.type) {
        case 'light':
          domain = 'light';
          if (action === 'on') service = 'turn_on';
          else if (action === 'off') service = 'turn_off';
          else if (action === 'toggle') service = 'toggle';
          else if (action === 'set_brightness') { service = 'turn_on'; params = { ...params, brightness_pct: params?.brightness ?? params?.value }; }
          else if (action === 'set_color') { service = 'turn_on'; params = { ...params, rgb_color: params?.color }; }
          break;
        case 'thermostat':
          domain = 'climate';
          if (action === 'set_temp') { service = 'set_temperature'; params = { ...params, temperature: params?.temp ?? params?.value }; }
          else if (action === 'on') service = 'turn_on';
          else if (action === 'off') service = 'turn_off';
          break;
        case 'lock':
          domain = 'lock';
          if (action === 'lock') service = 'lock';
          else if (action === 'unlock') service = 'unlock';
          break;
        case 'switch':
          domain = 'switch';
          if (action === 'on') service = 'turn_on';
          else if (action === 'off') service = 'turn_off';
          else if (action === 'toggle') service = 'toggle';
          break;
        case 'camera':
          if (action === 'snapshot') {
            return this.cameraSnapshot(cfg, entityId);
          }
          break;
      }

      if (action === 'status' || action === 'info') {
        return this.getDeviceStatus(cfg, entityId, device);
      }

      const res = await fetch(`${cfg.url}/api/services/${domain}/${service}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify({ entity_id: entityId, ...params }),
      });

      if (res.ok) {
        return { success: true, deviceId: device.id, action, output: `${device.name}: ${action} executed` };
      }
      const text = await res.text().catch(() => '');
      return { success: false, deviceId: device.id, action, output: '', error: `HA API error (${res.status}): ${text.slice(0, 200)}` };
    } catch (err) {
      return { success: false, deviceId: device.id, action, output: '', error: err instanceof Error ? err.message : 'HA command failed' };
    }
  }

  private async getDeviceStatus(cfg: HAConfig, entityId: string, device: Device): Promise<DeviceCommandResult> {
    try {
      const res = await fetch(`${cfg.url}/api/states/${entityId}`, {
        headers: { Authorization: `Bearer ${cfg.token}` },
      });
      if (!res.ok) return { success: false, deviceId: device.id, action: 'status', output: '', error: `HA status error (${res.status})` };
      const data = await res.json();
      return {
        success: true,
        deviceId: device.id,
        action: 'status',
        output: `${device.name}: state=${data.state}, attributes=${JSON.stringify(data.attributes || {}).slice(0, 300)}`,
        data: { state: data.state, attributes: data.attributes },
      };
    } catch (err) {
      return { success: false, deviceId: device.id, action: 'status', output: '', error: err instanceof Error ? err.message : 'Status fetch failed' };
    }
  }

  private async cameraSnapshot(cfg: HAConfig, entityId: string): Promise<DeviceCommandResult> {
    try {
      const res = await fetch(`${cfg.url}/api/camera_proxy/${entityId}`, {
        headers: { Authorization: `Bearer ${cfg.token}` },
      });
      if (res.ok) {
        return { success: true, deviceId: entityId, action: 'snapshot', output: `Camera snapshot captured from ${entityId}`, data: { imageUrl: `${cfg.url}/api/camera_proxy/${entityId}` } };
      }
      return { success: false, deviceId: entityId, action: 'snapshot', output: '', error: `Camera snapshot failed (${res.status})` };
    } catch (err) {
      return { success: false, deviceId: entityId, action: 'snapshot', output: '', error: err instanceof Error ? err.message : 'Snapshot failed' };
    }
  }

  async listDevices(): Promise<Device[]> {
    const cfg = this.getConfig();
    if (!cfg) return [];
    try {
      const res = await fetch(`${cfg.url}/api/states`, {
        headers: { Authorization: `Bearer ${cfg.token}` },
      });
      if (!res.ok) return [];
      const states: Array<{ entity_id: string; attributes: Record<string, unknown>; state: string }> = await res.json();
      return states
        .filter(s => /^(light|climate|lock|switch|camera|sensor|cover)\./.test(s.entity_id))
        .map(s => {
          const [domain] = s.entity_id.split('.');
          const typeMap: Record<string, DeviceType> = { light: 'light', climate: 'thermostat', lock: 'lock', switch: 'switch', camera: 'camera', sensor: 'sensor', cover: 'other' };
          return {
            id: s.entity_id,
            name: (s.attributes.friendly_name as string) || s.entity_id,
            type: typeMap[domain] || 'other',
            location: (s.attributes.area as string) || 'unknown',
            integration: 'homeassistant',
            state: { entityId: s.entity_id, currentState: s.state, ...s.attributes },
            lastSeen: Date.now(),
            online: s.state !== 'unavailable',
          };
        });
    } catch { return []; }
  }

  async getStatus(device: Device): Promise<Record<string, unknown>> {
    const cfg = this.getConfig();
    if (!cfg) return { error: 'Not configured' };
    const entityId = (device.state.entityId as string) || device.id;
    try {
      const res = await fetch(`${cfg.url}/api/states/${entityId}`, {
        headers: { Authorization: `Bearer ${cfg.token}` },
      });
      if (!res.ok) return { error: `HTTP ${res.status}` };
      return await res.json();
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed' };
    }
  }
}

// ═══ Webhook Integration (generic) ═══

class WebhookIntegration implements DeviceIntegration {
  id = 'webhook';
  name = 'Custom Webhook';

  async execute(device: Device, action: DeviceAction, params?: Record<string, unknown>): Promise<DeviceCommandResult> {
    const webhookUrl = device.state.webhookUrl as string;
    if (!webhookUrl) return { success: false, deviceId: device.id, action, output: '', error: 'No webhook URL configured for this device' };

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: device.id, action, params }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: true, deviceId: device.id, action, output: `${device.name}: ${action} via webhook`, data };
      }
      return { success: false, deviceId: device.id, action, output: '', error: `Webhook returned ${res.status}` };
    } catch (err) {
      return { success: false, deviceId: device.id, action, output: '', error: err instanceof Error ? err.message : 'Webhook failed' };
    }
  }

  async listDevices(): Promise<Device[]> { return []; }
  async getStatus(device: Device): Promise<Record<string, unknown>> { return device.state; }
}

// ═══ Device Bridge ═══

class DeviceBridge {
  private integrations: Map<string, DeviceIntegration> = new Map();

  constructor() {
    this.integrations.set('homeassistant', new HomeAssistantIntegration());
    this.integrations.set('webhook', new WebhookIntegration());
  }

  registerIntegration(integration: DeviceIntegration): void {
    this.integrations.set(integration.id, integration);
  }

  async execute(deviceId: string, action: DeviceAction, params?: Record<string, unknown>): Promise<DeviceCommandResult> {
    const devices = loadDevices();
    const device = devices.find(d => d.id === deviceId);
    if (!device) return { success: false, deviceId, action: action as string, output: '', error: `Device not found: ${deviceId}` };

    const integration = this.integrations.get(device.integration);
    if (!integration) return { success: false, deviceId, action: action as string, output: '', error: `No integration: ${device.integration}` };

    return integration.execute(device, action, params);
  }

  async listAll(): Promise<Device[]> {
    const manual = loadDevices();
    const discovered: Device[] = [];
    for (const integration of this.integrations.values()) {
      try {
        const devs = await integration.listDevices();
        discovered.push(...devs);
      } catch { /* ignore */ }
    }
    const merged = [...manual];
    for (const d of discovered) {
      if (!merged.some(m => m.id === d.id)) merged.push(d);
    }
    return merged;
  }

  async getStatus(deviceId: string): Promise<Record<string, unknown>> {
    const devices = loadDevices();
    const device = devices.find(d => d.id === deviceId);
    if (!device) return { error: 'Device not found' };
    const integration = this.integrations.get(device.integration);
    if (!integration) return { error: 'No integration' };
    return integration.getStatus(device);
  }

  addDevice(device: Device): void {
    const devices = loadDevices();
    const idx = devices.findIndex(d => d.id === device.id);
    if (idx >= 0) devices[idx] = device;
    else devices.push(device);
    saveDevices(devices);
  }

  removeDevice(deviceId: string): void {
    const devices = loadDevices().filter(d => d.id !== deviceId);
    saveDevices(devices);
  }
}

export const deviceBridge = new DeviceBridge();
