import type { Translate } from "../config/i18n";

/** Keep modal direction local to Number Suite; code and user-entered Markdown can contain both scripts. */
export function applyModalDirection(modalEl: HTMLElement, translate: Translate): void {
  if (translate.direction == null) return;
  modalEl.dir = translate.direction;
  for (const element of modalEl.querySelectorAll<HTMLElement>("code, pre, input[type='text'], textarea")) {
    element.dir = "auto";
  }
}
