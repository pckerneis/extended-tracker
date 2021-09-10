type Class<T> = new (...args: any[]) => T;

export function isDebugOn() {
  return true;
}

export class Logger {
  public static create<T>(clazz: Class<T>): Logger {
    return new Logger(clazz.name);
  }

  private constructor(public readonly className: string) {}

  public debug(...messages: any[]): void {
    console.debug(...messages.map(message => {
      if (typeof message === 'string') {
        return `${this.className}: ${message}`;
      } else {
        return message;
      }
    }));
  }
}
