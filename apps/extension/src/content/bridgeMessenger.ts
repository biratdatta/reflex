import {
  REFLEX_CHANNEL,
  isBridgeEvent,
  isBridgeReply,
  type BridgeEvent,
  type BridgeMessage,
  type BridgeReply,
  type BridgeRequest,
} from '@reflex/capability-model';

type Pending = { resolve: (reply: BridgeReply) => void; reject: (error: Error) => void; timer: number };

/**
 * The content script and the page runtime live in different JavaScript worlds,
 * so everything crosses via window.postMessage. Each request carries an id and
 * resolves a promise, which keeps callers from having to think about the split.
 */
export class BridgeMessenger {
  private readonly pending = new Map<string, Pending>();
  private readonly eventListeners = new Set<(event: BridgeEvent) => void>();
  private counter = 0;

  constructor(private readonly timeoutMs = 8000) {
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data as unknown;

      if (isBridgeReply(data)) {
        const pending = this.pending.get(data.requestId);
        if (!pending) return;
        window.clearTimeout(pending.timer);
        this.pending.delete(data.requestId);
        pending.resolve(data);
        return;
      }

      if (isBridgeEvent(data)) {
        for (const listener of this.eventListeners) listener(data);
      }
    });
  }

  onEvent(listener: (event: BridgeEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  send(message: BridgeRequest, timeoutMs = this.timeoutMs): Promise<BridgeReply> {
    this.counter += 1;
    const requestId = `rq${Date.now().toString(36)}_${this.counter}`;
    const payload = { channel: REFLEX_CHANNEL, direction: 'to-page', requestId, ...message } as BridgeMessage;

    return new Promise<BridgeReply>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('The Reflex page runtime did not respond. Try reloading the page.'));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      window.postMessage(payload, window.location.origin === 'null' ? '*' : window.location.origin);
    });
  }
}
