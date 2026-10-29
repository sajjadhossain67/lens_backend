import { FastifyReply, FastifyRequest } from "fastify";

export class SSEStream {
  private reply: FastifyReply;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isClosed = false;

  constructor(request: FastifyRequest, reply: FastifyReply) {
    this.reply = reply;

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
    reply.raw.flushHeaders?.();

    // Start 15s ping heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.writeComment("ping");
    }, 15000);

    request.raw.on("close", () => {
      this.close();
    });
  }

  writeEvent(event: string, data: any): void {
    if (this.isClosed) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    this.reply.raw.write(payload);
  }

  writeComment(comment: string): void {
    if (this.isClosed) return;
    this.reply.raw.write(`: ${comment}\n\n`);
  }

  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    try {
      this.reply.raw.end();
    } catch {
      // Ignore socket end errors
    }
  }

  get closed(): boolean {
    return this.isClosed;
  }
}

