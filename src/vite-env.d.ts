import type { EngineTypes, SessionTypes } from '@walletconnect/types';

declare global {
  interface Window {
    selector: {
      nearConnectVersion?: string;
      walletConnect: {
        connect: (params: EngineTypes.ConnectParams) => Promise<SessionTypes.Struct>;
        disconnect: (params: EngineTypes.DisconnectParams) => Promise<void>;
        request: (params: EngineTypes.RequestParams) => Promise<unknown>;
        getSession: () => Promise<SessionTypes.Struct>;
        getProjectId: () => Promise<string>;
      };

      providers: { mainnet: string[]; testnet: string[] };
      network: 'testnet' | 'mainnet';
      location: string;
      manifest?: { signPageUrl?: string };

      ready: (wallet: unknown) => void;
      external: (entity: string, key: string, ...args: unknown[]) => Promise<unknown>;

      parentFrame?: {
        postMessage: (data: unknown) => Promise<void>;
      };

      ui: {
        whenApprove: (options: { title: string; button: string }) => Promise<void>;
        showIframe: () => void;
      };

      open: (
        url: string,
        newTab?: boolean | string,
        options?: string,
      ) => {
        close: () => void;
        postMessage: (message: unknown) => void;
        windowIdPromise: Promise<string | null>;
        closed: boolean;
      };

      showContent: () => void;
      storage: {
        set: (key: string, value: string) => Promise<void>;
        get: (key: string) => Promise<string>;
        remove: (key: string) => Promise<void>;
        keys: () => Promise<string[]>;
      };
    };
  }
}

export {};
