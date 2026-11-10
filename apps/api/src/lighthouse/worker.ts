import {
  handleWorkerAuditMessage,
  type WorkerInboundMessage,
  type WorkerOutboundMessage,
} from "./worker-handler";

declare const self: Worker;

self.addEventListener(
  "message",
  (event: MessageEvent<WorkerInboundMessage>) => {
    void handleWorkerAuditMessage(event.data, {
      emit: (msg: WorkerOutboundMessage) => {
        // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Dedicated Worker.postMessage takes (message, transfer?), not targetOrigin
        self.postMessage(msg);
      },
    });
  },
);
