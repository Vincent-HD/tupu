const lockName = "tupu-database";
const channelName = "tupu-database";
const takeoverMessage = "takeover";

export interface DatabaseLock {
  readonly release: () => void;
}

const supported = () => typeof navigator !== "undefined" && "locks" in navigator;

export const claimDatabase = (options: {
  readonly wait: boolean;
}): Promise<DatabaseLock | null> => {
  if (!supported()) return Promise.resolve({ release: () => undefined });
  return new Promise((resolve) => {
    void navigator.locks.request(lockName, { ifAvailable: !options.wait }, (lock) => {
      if (!lock) {
        resolve(null);
        return undefined;
      }
      return new Promise<void>((release) => resolve({ release }));
    });
  });
};

export const requestTakeover = () => {
  const channel = new BroadcastChannel(channelName);
  channel.postMessage(takeoverMessage);
  channel.close();
};

export const onTakeover = (handler: () => void) => {
  const channel = new BroadcastChannel(channelName);
  channel.addEventListener("message", (event) => {
    if (event.data !== takeoverMessage) return;
    channel.close();
    handler();
  });
};
