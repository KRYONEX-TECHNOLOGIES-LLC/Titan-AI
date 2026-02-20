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

const CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';

export function registerAuthHandlers(ipcMain: IpcMain, win: BrowserWindow): void {

  ipcMain.handle('auth:signInWithGithub', async () => {
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&scope=user:email,repo&redirect_uri=titan-ai://auth/callback`;
    shell.openExternal(authUrl);

    return new Promise<AuthSession>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Authentication timed out'));
      }, 120000);

      const { protocol } = require('electron');

      const handleCallback = async (url: string) => {
        try {
          const urlObj = new URL(url);
          const code = urlObj.searchParams.get('code');
          if (!code) {
            reject(new Error('No authorization code received'));
            return;
          }

          const tokenData = await exchangeCodeForToken(code);
          const user = await getGitHubUser(tokenData.access_token);
          const session: AuthSession = { token: tokenData.access_token, user };

          if (safeStorage.isEncryptionAvailable()) {
            const encrypted = safeStorage.encryptString(tokenData.access_token);
            store.set('auth.encryptedToken', encrypted.toString('base64'));
          } else {
            store.set('auth.token', tokenData.access_token);
          }
          store.set('auth.user', user);

          clearTimeout(timeout);
          resolve(session);
        } catch (err) {
          clearTimeout(timeout);
          reject(err);
        }
      };

      try {
        protocol.handle('titan-ai', (request: { url: string }) => {
          handleCallback(request.url);
          return new Response('Authentication successful! You can close this tab.', {
            headers: { 'Content-Type': 'text/html' },
          });
        });
      } catch {
        // Protocol already registered -- listen for navigation
        win.webContents.on('will-navigate', (_event, url) => {
          if (url.startsWith('titan-ai://')) {
            handleCallback(url);
          }
        });
      }
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

function exchangeCodeForToken(code: string): Promise<{ access_token: string; token_type: string }> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
    });

    const req = https.request({
      hostname: 'github.com',
      path: '/login/oauth/access_token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error_description || parsed.error));
          } else {
            resolve(parsed);
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function getGitHubUser(token: string): Promise<GitHubUser> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: '/user',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'User-Agent': 'TitanAI-Desktop',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}
