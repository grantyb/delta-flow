import { ChangeEntry } from './changeModel';
import { openDiff } from './diffCommand';

/**
 * Throttles diff loading with a leading edge: a request loads immediately when
 * nothing has loaded recently, otherwise the latest request loads when the
 * window elapses. Skips reloading whatever diff is already shown.
 */
export class DiffLoader {
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: ChangeEntry;
  private shown?: ChangeEntry;
  private lastRun = 0;

  constructor(private readonly windowMs: number) {}

  request(entry: ChangeEntry): void {
    if (entry === this.shown || this.timer) {
      this.pending = entry === this.shown ? undefined : entry;
      return;
    }
    this.pending = entry;
    const elapsed = Date.now() - this.lastRun;
    if (elapsed >= this.windowMs) {
      this.run();
    } else {
      this.timer = setTimeout(() => this.run(), this.windowMs - elapsed);
    }
  }

  cancel(): void {
    this.clearTimer();
    this.pending = undefined;
  }

  dispose(): void {
    this.cancel();
  }

  private run(): void {
    this.clearTimer();
    const entry = this.pending;
    this.pending = undefined;
    if (!entry) {
      return;
    }
    this.shown = entry;
    this.lastRun = Date.now();
    void openDiff(entry);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
