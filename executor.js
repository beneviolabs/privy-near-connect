// src/types.ts
var CHANNEL_SOURCE = "privy-near-connect";
var channelMsg = {
  /**
   * Builds a `READY` message.
   * @returns A `READY` message.
   */
  ready: () => ({ source: CHANNEL_SOURCE, type: "READY" }),
  /**
   * Builds a `SIGN_REQUEST` message.
   * @param payload - Signing payload.
   * @returns A `SIGN_REQUEST` message.
   */
  signRequest: (payload) => ({
    source: CHANNEL_SOURCE,
    type: "SIGN_REQUEST",
    payload
  }),
  /**
   * Builds a `RESULT` message.
   * @param result - Signing result.
   * @returns A `RESULT` message.
   */
  result: (result) => ({
    source: CHANNEL_SOURCE,
    type: "RESULT",
    result
  }),
  /**
   * Builds an `ERROR` message.
   * @param message - Human-readable error description.
   * @returns An `ERROR` message.
   */
  error: (message) => ({
    source: CHANNEL_SOURCE,
    type: "ERROR",
    message
  })
};

// src/executor.ts
var LOG_PREFIX = "[privy-near-connect-executor]";
var ACCOUNT_ID_STORAGE_KEY = "privy-near-connect:account-id";
function requestWallet(signPageURL, payload) {
  return new Promise((resolve, reject) => {
    const popup = window.selector.open(signPageURL);
    const cleanup = () => {
      window.removeEventListener("message", handler);
      clearInterval(closedPoll);
    };
    const handler = (event) => {
      const msg = event.data;
      if (!msg || msg.source !== CHANNEL_SOURCE) return;
      /* @__PURE__ */ console.debug(
        LOG_PREFIX,
        "Received message from sign page",
        event.data,
        "origin:",
        event.origin
      );
      if (msg.type === "READY") {
        console.log(LOG_PREFIX, "Sign page is ready, sending SIGN_REQUEST", payload);
        popup.postMessage(channelMsg.signRequest(payload));
      } else if (msg.type === "RESULT") {
        cleanup();
        resolve(msg.result);
      } else if (msg.type === "ERROR") {
        cleanup();
        reject(new Error(msg.message));
      }
    };
    const closedPoll = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error("Privy Sign window closed"));
      }
    }, 300);
    window.addEventListener("message", handler);
  });
}
var wallet = {
  manifest: {},
  async signIn(data) {
    const accounts = await requestWallet(this.manifest.metadata.signPageURL, {
      kind: "signIn",
      ...data
    });
    const accountId = accounts[0]?.accountId;
    if (accountId) {
      await window.selector.storage.set(ACCOUNT_ID_STORAGE_KEY, accountId);
    }
    return accounts;
  },
  async signInAndSignMessage(data) {
    const accounts = await requestWallet(
      this.manifest.metadata.signPageURL,
      {
        kind: "signInAndSignMessage",
        ...data
      }
    );
    const accountId = accounts[0]?.accountId;
    if (accountId) {
      await window.selector.storage.set(ACCOUNT_ID_STORAGE_KEY, accountId);
    }
    return accounts;
  },
  async signOut(_data) {
    console.log(LOG_PREFIX, "signOut");
    await window.selector.storage.remove(ACCOUNT_ID_STORAGE_KEY);
  },
  async getAccounts(_data) {
    const accountId = await window.selector.storage.get(ACCOUNT_ID_STORAGE_KEY);
    if (!accountId) return [];
    return [
      {
        accountId
      }
    ];
  },
  async signMessage(params) {
    return requestWallet(this.manifest.metadata.signPageURL, { kind: "signMessage", ...params });
  },
  async signAndSendTransaction(params) {
    return requestWallet(this.manifest.metadata.signPageURL, {
      kind: "signAndSendTransaction",
      ...params
    });
  },
  async signAndSendTransactions(params) {
    return requestWallet(this.manifest.metadata.signPageURL, {
      kind: "signAndSendTransactions",
      ...params
    });
  },
  async signDelegateActions(params) {
    return requestWallet(this.manifest.metadata.signPageURL, {
      kind: "signDelegateActions",
      ...params
    });
  }
};
var SIGN_PAGE_URL = new URL("#privy-sign", "http://localhost:5173").href;
wallet.manifest = {
  metadata: {
    signPageURL: SIGN_PAGE_URL
  }
};
window.selector.ready(wallet);
//# sourceMappingURL=executor.js.map
//# sourceMappingURL=executor.js.map