import { IpcMain, BrowserWindow, safeStorage } from 'electron';
import * as https from 'https';
import * as crypto from 'crypto';
import Store from 'electron-store';

const store = new Store();

interface GitHubUser {
  id: number;
  login: string;
  name: string;
  email: string;
  avatar_url: string;
}

const CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'Ov23li34gxKFR3F8129J';
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '5fd834a712aa7aeaf4acb85a13e8725b592b2d81';
const SCOPES = 'user:email,repo';

// IMPORTANT: In your GitHub OAuth App settings (github.com/settings/developers),
// set the "Authorization callback URL" to:
//   http://localhost:3100/auth/github/callback
//
// The Electron popup intercepts the redirect via will-redirect/did-navigate before
// the callback URL actually loads, so the URL just needs to be one GitHub accepts.
// Any localhost URL works. The app does NOT need a running server at that path.

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

async function exchangeCodeForToken(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
  });

  const raw = await httpsPost('github.com', '/login/oauth/access_token', params.toString(), {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
  });

  const parsed = JSON.parse(raw);
  if (parsed.error) {
    throw new Error(parsed.error_description || parsed.error);
  }
  return parsed.access_token;
}

async function fetchGitHubUser(token: string): Promise<GitHubUser> {
  const raw = await httpsGet('api.github.com', '/user', {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'User-Agent': 'TitanAI-Desktop',
  });
  return JSON.parse(raw) as GitHubUser;
}

function saveSession(token: string, user: GitHubUser): void {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token);
    store.set('auth.encryptedToken', encrypted.toString('base64'));
  } else {
    store.set('auth.token', token);
  }
  store.set('auth.user', user);
}

export function registerAuthHandlers(ipcMain: IpcMain, parentWin: BrowserWindow): void {

  ipcMain.handle('auth:signInWithGithub', async () => {
    if (!CLIENT_ID) {
      throw new Error('GITHUB_CLIENT_ID is not configured');
    }

    const state = crypto.randomBytes(16).toString('hex');
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(CLIENT_ID)}&scope=${encodeURIComponent(SCOPES)}&state=${state}`;

    return new Promise<{ token: string; user: GitHubUser }>((resolve, reject) => {
      const popup = new BrowserWindow({
        width: 520,
        height: 720,
        parent: parentWin,
        modal: true,
        title: 'Sign in to GitHub — Titan AI',
        backgroundColor: '#0a0a14',
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      popup.setMenuBarVisibility(false);

      let settled = false;

      const handleRedirect = async (url: string) => {
        if (settled) return;

        let parsed: URL;
        try { parsed = new URL(url); } catch { return; }

        // Ignore intermediate SSO redirects (Google/Microsoft/etc) that can also
        // include code/state params; only process our configured OAuth callback.
        if (parsed.hostname !== 'localhost') return;

        const code = parsed.searchParams.get('code');
        const returnedState = parsed.searchParams.get('state');
        const error = parsed.searchParams.get('error');

        if (!code && !error) return;
        if (!returnedState) return;

        settled = true;
        popup.close();

        if (error) {
          reject(new Error(`GitHub denied access: ${parsed.searchParams.get('error_description') || error}`));
          return;
        }

        if (returnedState !== state) {
          reject(new Error('OAuth state mismatch — possible CSRF attack'));
          return;
        }

        try {
          const token = await exchangeCodeForToken(code!);
          const user = await fetchGitHubUser(token);
          saveSession(token, user);
          resolve({ token, user });
        } catch (err) {
          reject(err);
        }
      };

      const isCallbackUrl = (url: string) => {
        try {
          const u = new URL(url);
          if (u.hostname !== 'localhost') return false;
          return (u.searchParams.has('code') && u.searchParams.has('state')) || u.searchParams.has('error');
        } catch { return false; }
      };

      // --- Network-level interceptor (most reliable) ---
      // Catches the redirect at Chromium's network stack before any navigation
      // events fire.  Works regardless of SSO redirect chains (Google → GitHub → localhost).
      const ses = popup.webContents.session;
      const filter = { urls: ['http://localhost/*'] };
      ses.webRequest.onBeforeRequest(filter, (details, callback) => {
        if (settled) { callback({}); return; }
        try {
          const u = new URL(details.url);
          if (u.hostname === 'localhost' &&
              ((u.searchParams.has('code') && u.searchParams.has('state')) || u.searchParams.has('error'))) {
            callback({ cancel: true });
            handleRedirect(details.url);
            return;
          }
        } catch { /* ignore malformed URLs */ }
        callback({});
      });

      // --- Navigation-event handlers (kept as secondary fallbacks) ---
      popup.webContents.on('will-navigate', (_event, navUrl) => {
        handleRedirect(navUrl);
      });

      popup.webContents.on('will-redirect', (event, navUrl) => {
        if (isCallbackUrl(navUrl)) {
          event.preventDefault();
        }
        handleRedirect(navUrl);
      });

      popup.webContents.on('did-navigate', (_event, navUrl) => {
        handleRedirect(navUrl);
      });

      // did-redirect-navigation fires after a server-side redirect completes
      popup.webContents.on('did-redirect-navigation' as any, (_event: any, navUrl: string) => {
        handleRedirect(navUrl);
      });

      popup.on('closed', () => {
        // Clean up the network interceptor to avoid leaking across sessions
        ses.webRequest.onBeforeRequest(filter, null as any);
        if (!settled) {
          settled = true;
          reject(new Error('Sign-in window was closed'));
        }
      });

      popup.loadURL(authUrl);
    });
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
