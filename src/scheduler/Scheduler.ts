import {EventQueue, EventRef} from './EventQueue';

export class Scheduler {

  public static readonly MIN_INTERVAL: number = 0;
  public static readonly DEFAULT_LOOKAHEAD: number = 0.050;

  public onEnded: Function;

  public keepAlive: boolean;

  private _now: number = 0;

  private _running: boolean = false;

  private _timeout: NodeJS.Timeout = null;

  private _startTime: number = 0;

  constructor(
      private _interval: number = 0,
      private _lookAhead: number = Scheduler.DEFAULT_LOOKAHEAD,
      private _eventQueue: EventQueue<Function> = new EventQueue(),
      private _clockFunction: () => number = null,
  ) {
    // Constrain values by using public setters
    this.interval = _interval;
    this.lookAhead = _lookAhead;

    // Using default time provider if none is specified
    this._clockFunction = _clockFunction || systemNowInSeconds;
  }

  public set clockFunction(clockFunction: () => number) {
    this._clockFunction = clockFunction;
  }

  public get running(): boolean {
    return this._running;
  }

  public get interval(): number {
    return this._interval;
  }

  public set interval(v: number) {
    this._interval = Math.max(Scheduler.MIN_INTERVAL, v);
  }

  public get lookAhead(): number {
    return this._lookAhead;
  }

  public set lookAhead(v: number) {
    this._lookAhead = Math.max(0, v);
  }

  public get eventQueue(): EventQueue<Function> {
    return this._eventQueue;
  }

  public now(): number {
    return this._now;
  }

  public start(position: number = 0): void {
    this.prepareToRun(position);
    this.run();
  }

  public stop(): void {
    if (this._running) {
      clearTimeout(this._timeout);
      this._running = false;
    }
  }

  public runSync(start: number, end: number): void {
    this.prepareToRun(start);

    let next = this._eventQueue.next(end);

    while (next != null) {
      next.event();
      next = this._eventQueue.next(end);
    }

    this._running = false;
  }

  public clearQueue(): void {
    this._eventQueue.clear();
  }

  public schedule(time: number, event: Function): EventRef {
    return this._eventQueue.add(time, event);
  }

  public cancel(eventRef: EventRef): void {
    this._eventQueue.remove(eventRef);
  }

  private prepareToRun(startPosition: number): void {
    if (this._running) {
      this.stop();
    }

    this._running = true;
    this._startTime = this._clockFunction();
    this._now = startPosition;
  }

  /**
   * Process the next scheduled events until the next event's time position is superior to the current time position plus
   * the specified {@link lookAhead}.
   */
  private run(): void {
    if (! this._running) {
      return;
    }

    this._now = this._clockFunction() - this._startTime;
    const t1 = this._now;
    const when = this._now + this.lookAhead;

    let next = this._eventQueue.next(when);

    while (next != null) {
      next.event();
      next = this._eventQueue.next(when);
    }

    const elapsed = (this._clockFunction() - this._startTime) - t1;

    if (this._eventQueue.events.length > 0 || this.keepAlive) {
      const waitTime = Math.max(0, this.interval - elapsed);
      this._timeout = setTimeout(() => this.run(), waitTime);
    } else {
      this._running = false;

      if (this.onEnded != null) {
        this.onEnded();
      }
    }
  }
}

const { performance } = require('perf_hooks');

export function systemNowInSeconds(): number {
  return performance.now() / 1000;
}
