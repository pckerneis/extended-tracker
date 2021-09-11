
/**
 * A unique identifier for scheduled events.
 */
export type EventRef = any;

/**
 * Holds together an event, the time location at which it is scheduled and the scheduler's reference for this scheduled
 * event.
 */
export interface ScheduledEvent<EventType> {
  readonly ref: EventRef,
  readonly time: number,
  readonly event: EventType
}

export class EventQueue<EventType> {
    private latestRefIdx: number = 0;

    private _events: ScheduledEvent<EventType>[] = [];

    public get events(): readonly ScheduledEvent<EventType>[] {
        return this._events;
    }

    public next(now: number): ScheduledEvent<EventType> | null {
        if (this._events.length === 0) {
            return null;
        }

        if (this._events[0].time <= now) {
            return this._events.splice(0, 1)[0];
        }

        return null;
    }

    public add(time: number, event: EventType): EventRef {
        if (isNaN(time)) {
            time = 0;
        }

        const idx = this.insertIndex(time, 0, this._events.length);
        const scheduledEvent: ScheduledEvent<EventType> = {
            event,
            time,
            ref: this.newRef(),
        };

        this._events.splice(idx, 0, scheduledEvent);

        return scheduledEvent.ref;
    }

    // Recursive divide and conquer to find insert index in already sorted array
    private insertIndex(time: number, min: number, max: number): number {
        const range = max - min;

        if (isNaN(range) || max < min) {
          throw Error(`Illegal arguments for insertIndex : min=${min} and max=${max}`);
        }

        if (range === 0) {
            return min;
        }

        let pivot = (Math.random() * range + min) | 0;
        let timeAtPivot = this._events[pivot].time;

        while (timeAtPivot === time) {
            pivot++;

            if (pivot >= this._events.length) {
                return pivot;
            }

            timeAtPivot = this._events[pivot].time;

            if (timeAtPivot > time) {
                return pivot;
            }
        }

        if (timeAtPivot > time) {
            return this.insertIndex(time, min, pivot);
        } else {
            return this.insertIndex(time, pivot + 1, max);
        }
    }

    private newRef(): EventRef {
        return '' + this.latestRefIdx++;
    }
}
