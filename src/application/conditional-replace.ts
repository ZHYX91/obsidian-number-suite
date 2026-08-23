export interface TextTarget {
  readonly path: string;
}

export interface TextProcessor<Target extends TextTarget> {
  process(target: Target, transform: (current: string) => string): Promise<unknown>;
}

export interface AppliedReplacement<Target extends TextTarget> {
  readonly target: Target;
  readonly before: string;
  readonly after: string;
}

export class ContentConflictError extends Error {
  constructor(path: string) {
    super(`Content changed during a guarded replacement: ${path}`);
    this.name = "ContentConflictError";
  }
}

export async function replaceExactly<Target extends TextTarget>(
  processor: TextProcessor<Target>,
  target: Target,
  expected: string,
  replacement: string,
): Promise<void> {
  await processor.process(target, (current) => {
    if (current !== expected) throw new ContentConflictError(target.path);
    return replacement;
  });
}

export async function rollbackExactly<Target extends TextTarget>(
  processor: TextProcessor<Target>,
  replacements: readonly AppliedReplacement<Target>[],
): Promise<readonly unknown[]> {
  const failures: unknown[] = [];
  for (const item of [...replacements].reverse()) {
    try {
      await replaceExactly(processor, item.target, item.after, item.before);
    } catch (error) {
      failures.push(error);
    }
  }
  return failures;
}
