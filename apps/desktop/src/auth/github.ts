import { IpcMain, BrowserWindow, safeStorage, shell } from 'electron';
import * as https from 'https';
import Store from 'electron-store';

const store = new Store();

interface GitHubUser {
  id: number;
  login: string;
  name: string;
  email: string;
  avatar_url: string;
}

interface AuthSession {
  token: string;
  user: GitHubUser;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

const CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'Ov23li34gxKFR3F8129J';

function httpsPost(hostname: string, path: string, body: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(hostname: string, path: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname, path, method: 'GET', headers,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });
}

export function registerAuthHandlers(ipcMain: IpcMain, _win: BrowserWindow): void {

  // Step 1: Request device + user codes from GitHub
  ipcMain.handle('auth:startDeviceFlow', async () => {
    if (!CLIENT_ID) {
      throw new Error('GITHUB_CLIENT_ID is not configured');
    }

    const body = `client_id=${encodeURIComponent(CLIENT_ID)}&scope=${encodeURIComponent('user:email,repo')}`;
    const raw = await httpsPost('github.com', '/login/oauth/device/code', body, {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    });

    let parsed: DeviceCodeResponse & { error?: string; error_description?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('GitHub returned invalid response. Make sure Device Flow is enabled in your GitHub OAuth App settings (github.com/settings/developers).');
    }
    if (parsed.error) {
      throw new Error(parsed.error_description || parsed.error);
    }

    shell.openExternal(parsed.verification_uri);

    return {
      deviceCode: parsed.device_code,
      userCode: parsed.user_code,
      verificationUri: parsed.verification_uri,
      expiresIn: parsed.expires_in,
      interval: parsed.interval,
    };
  });

  // Step 2: Poll GitHub for token (called repeatedly by renderer)
  ipcMain.handle('auth:pollDeviceFlow', async (_e, deviceCode: string) => {
    if (!CLIENT_ID) throw new Error('GITHUB_CLIENT_ID is not configured');

    const body = `client_id=${encodeURIComponent(CLIENT_ID)}&device_code=${encodeURIComponent(deviceCode)}&grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:device_code')}`;

    const raw = await httpsPost('github.com', '/login/oauth/access_token', body, {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    });

    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { status: 'error' as const, error: 'Invalid response from GitHub' };
    }

    if (parsed.error === 'authorization_pending') {
      return { status: 'pending' as const };
    }
    if (parsed.error === 'slow_down') {
      return { status: 'slow_down' as const };
    }
    if (parsed.error === 'expired_token') {
      return { status: 'expired' as const };
    }
    if (parsed.error) {
      return { status: 'error' as const, error: parsed.error_description || parsed.error };
    }

    const accessToken = parsed.access_token as string;
    const userRaw = await httpsGet('api.github.com', '/user', {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'User-Agent': 'TitanAI-Desktop',
    });
    const user = JSON.parse(userRaw) as GitHubUser;

    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(accessToken);
      store.set('auth.encryptedToken', encrypted.toString('base64'));
    } else {
      store.set('auth.token', accessToken);
    }
    store.set('auth.user', user);

    return { status: 'success' as const, session: { token: accessToken, user } };
  });

  // Legacy handler kept for backward compat (redirects to device flow)
  ipcMain.handle('auth:signInWithGithub', async () => {
    throw new Error('Use auth:startDeviceFlow instead');
  });

  ipcMain.handle('auth:getSession', async () => {
    try {
      let token: string | null = null;
      const encryptedB64 = store.get('auth.encryptedToken') as string | undefined;
      if (encryptedB64 && safeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(encryptedB64, 'base64');
        token = safeStorage.decryptString(buffer);
      } else {
        token = (store.get('auth.token') as string) || null;
      }
      if (!token) return null;

      const user = store.get('auth.user') as GitHubUser | undefined;
      if (!user) return null;

      return { token, user };
    } catch {
      return null;
    }
  });

  ipcMain.handle('auth:signOut', async () => {
    store.delete('auth.encryptedToken');
    store.delete('auth.token');
    store.delete('auth.user');
  });
}
