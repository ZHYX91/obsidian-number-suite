export type SettingsTaskScheduler = <T>(task: () => Promise<T>) => Promise<T>;

interface SettingsStoreQueue { tail: Promise<unknown> }
const key = Symbol.for("number-suite.settings-store-queue");

/** Reserve accepted storage work immediately, including across plugin module reloads. */
export function settingsStoreScheduler(host: object): SettingsTaskScheduler {
  const owner = host as Record<symbol, SettingsStoreQueue | undefined>;
  const queue = owner[key] ??= { tail: Promise.resolve() };
  return <T>(task: () => Promise<T>): Promise<T> => {
    const operation = queue.tail.then(task);
    queue.tail = operation.catch(() => undefined);
    return operation;
  };
}
