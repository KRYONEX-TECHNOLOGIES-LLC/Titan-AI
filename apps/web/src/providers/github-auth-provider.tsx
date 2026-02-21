'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { isElectron, electronAPI } from '@/lib/electron';

export interface GitHubUser {
  id: number;
  login: string;
  name: string;
  email: string;
  avatar_url: string;
}

export interface DeviceFlowState {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
}

export interface GitHubAuth {
  user: GitHubUser | null;
  token: string | null;
  isConnected: boolean;
  isLoading: boolean;
  deviceFlow: DeviceFlowState | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  cancelDeviceFlow: () => void;
}

const GitHubAuthContext = createContext<GitHubAuth>({
  user: null,
  token: null,
  isConnected: false,
  isLoading: true,
  deviceFlow: null,
  signIn: async () => {},
  signOut: async () => {},
  cancelDeviceFlow: () => {},
});

export function useGitHubAuth(): GitHubAuth {
  return useContext(GitHubAuthContext);
}

export default function GitHubAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowState | null>(null);
  const pollingRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!isElectron || !electronAPI) {
      setIsLoading(false);
      return;
    }
    electronAPI.auth.getSession().then((session) => {
      if (session) {
        setToken(session.token);
        setUser(session.user as GitHubUser);
      }
      setIsLoading(false);
    }).catch(() => {
      setIsLoading(false);
    });
  }, []);

  const signIn = useCallback(async () => {
    if (!isElectron || !electronAPI) return;
    if (pollingRef.current) return;

    try {
      setIsLoading(true);
      cancelledRef.current = false;

      const result = await electronAPI.auth.startDeviceFlow();
      setDeviceFlow({
        userCode: result.userCode,
        verificationUri: result.verificationUri,
        expiresIn: result.expiresIn,
      });
      setIsLoading(false);

      pollingRef.current = true;
      const interval = Math.max((result.interval || 5) * 1000, 5000);
      const maxTime = Date.now() + result.expiresIn * 1000;

      while (pollingRef.current && Date.now() < maxTime && !cancelledRef.current) {
        await new Promise(r => setTimeout(r, interval));
        if (cancelledRef.current || !pollingRef.current) break;

        try {
          const poll = await electronAPI.auth.pollDeviceFlow(result.deviceCode);

          if (poll.status === 'success') {
            setToken(poll.session.token);
            setUser(poll.session.user as GitHubUser);
            setDeviceFlow(null);
            pollingRef.current = false;
            return;
          }
          if (poll.status === 'expired' || poll.status === 'error') {
            console.error('[GitHubAuth] Device flow failed:', poll.status);
            setDeviceFlow(null);
            pollingRef.current = false;
            return;
          }
          // 'pending' or 'slow_down' -> keep polling
        } catch (err) {
          console.error('[GitHubAuth] Poll error:', err);
        }
      }

      pollingRef.current = false;
      setDeviceFlow(null);
    } catch (err) {
      console.error('[GitHubAuth] Device flow start failed:', err);
      setIsLoading(false);
      setDeviceFlow(null);
    }
  }, []);

  const cancelDeviceFlow = useCallback(() => {
    cancelledRef.current = true;
    pollingRef.current = false;
    setDeviceFlow(null);
    setIsLoading(false);
  }, []);

  const signOut = useCallback(async () => {
    if (!isElectron || !electronAPI) return;
    try {
      await electronAPI.auth.signOut();
      setUser(null);
      setToken(null);
    } catch (err) {
      console.error('[GitHubAuth] Sign out failed:', err);
    }
  }, []);

  return (
    <GitHubAuthContext.Provider value={{
      user,
      token,
      isConnected: !!token && !!user,
      isLoading,
      deviceFlow,
      signIn,
      signOut,
      cancelDeviceFlow,
    }}>
      {children}
    </GitHubAuthContext.Provider>
  );
}
