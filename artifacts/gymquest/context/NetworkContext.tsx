import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

interface NetworkContextValue {
  isOnline: boolean;
  isInternetReachable: boolean | null;
}

const NetworkContext = createContext<NetworkContextValue>({
  isOnline: true,
  isInternetReachable: null,
});

let _isOnline = true;

export function getIsOnline(): boolean {
  return _isOnline;
}

function deriveOnline(state: NetInfoState): boolean {
  if (state.isConnected !== true) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleOnline = () => { setIsOnline(true); _isOnline = true; };
      const handleOffline = () => { setIsOnline(false); _isOnline = false; };

      setIsOnline(navigator.onLine);
      _isOnline = navigator.onLine;

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = deriveOnline(state);
      setIsOnline(online);
      setIsInternetReachable(state.isInternetReachable);
      _isOnline = online;
    });

    NetInfo.fetch().then((state: NetInfoState) => {
      const online = deriveOnline(state);
      setIsOnline(online);
      setIsInternetReachable(state.isInternetReachable);
      _isOnline = online;
    });

    return () => unsubscribe();
  }, []);

  return (
    <NetworkContext.Provider value={{ isOnline, isInternetReachable }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
