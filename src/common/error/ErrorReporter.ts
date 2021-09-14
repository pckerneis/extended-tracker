export interface ErrorReporter {
  reportError(...args: any[]): void;
}

export const defaultErrorReporter: ErrorReporter = {
  reportError(...args): void {
    console.error(...args);
  }
}
