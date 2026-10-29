import { EventEmitter } from "node:events";

export interface LensPipelineEvent {
  event: "status" | "article" | "summary" | "perspective" | "done" | "error";
  data: any;
}

class LensJobRegistry {
  private emitters: Map<string, EventEmitter> = new Map();

  getEmitter(lensId: string): EventEmitter {
    let emitter = this.emitters.get(lensId);
    if (!emitter) {
      emitter = new EventEmitter();
      emitter.setMaxListeners(50);
      this.emitters.set(lensId, emitter);
    }
    return emitter;
  }

  emit(lensId: string, eventName: LensPipelineEvent["event"], data: any): void {
    const emitter = this.emitters.get(lensId);
    if (emitter) {
      emitter.emit(eventName, data);
      emitter.emit("*", { event: eventName, data });
    }
  }

  cleanup(lensId: string): void {
    const emitter = this.emitters.get(lensId);
    if (emitter) {
      emitter.removeAllListeners();
      this.emitters.delete(lensId);
    }
  }
}

export const jobRegistry = new LensJobRegistry();

