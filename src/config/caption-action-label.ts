import type { CaptionInsertionTarget } from "../core/caption-insertion";
import type { Translate } from "./i18n";

export function captionActionTitle(target: CaptionInsertionTarget, t: Translate): string {
  const kind = target.kind.toLowerCase() as Lowercase<CaptionInsertionTarget["kind"]>;
  return t(`caption.menu.${kind}.${target.action}`);
}
