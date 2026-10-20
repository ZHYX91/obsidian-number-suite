import {
  findCaptionObjectForTableRange,
  findCaptionInsertionTargetForTableRange,
  type CaptionInsertionTarget,
} from "../core/caption-insertion";
import type { CaptionObject } from "../core/caption-objects";

/** Public Structural Tables source snapshot v1; offsets address UTF-16 source. */
export interface StructuralTableSourceSnapshot {
  readonly version: "1";
  readonly from: number;
  readonly to: number;
  readonly path: string;
  readonly source: string;
}

export function readStructuralTableSourceSnapshot(
  data: Readonly<Record<string, string | undefined>>,
): StructuralTableSourceSnapshot | null {
  if (data.structuralSourceVersion !== "1"
    || !/^(?:0|[1-9]\d*)$/u.test(data.structuralSourceFrom ?? "")
    || !/^(?:0|[1-9]\d*)$/u.test(data.structuralSourceTo ?? "")
    || !data.structuralSourcePath
    || !data.structuralSource) return null;
  const from = Number(data.structuralSourceFrom);
  const to = Number(data.structuralSourceTo);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to <= from) return null;
  return Object.freeze({
    version: "1",
    from,
    to,
    path: data.structuralSourcePath,
    source: data.structuralSource,
  });
}

export function resolveStructuralTableSource(
  source: string,
  path: string | null,
  snapshot: StructuralTableSourceSnapshot,
): CaptionObject | null {
  if (snapshot.version !== "1" || snapshot.path !== path
    || snapshot.from < 0 || snapshot.to > source.length
    || source.slice(snapshot.from, snapshot.to) !== snapshot.source) return null;
  return findCaptionObjectForTableRange(source, snapshot.from, snapshot.to);
}

export function resolveStructuralTableCaptionTarget(
  source: string,
  path: string | null,
  snapshot: StructuralTableSourceSnapshot,
): CaptionInsertionTarget | null {
  return resolveStructuralTableSource(source, path, snapshot) == null
    ? null
    : findCaptionInsertionTargetForTableRange(source, snapshot.from, snapshot.to);
}
