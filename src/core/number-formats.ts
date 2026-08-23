import type { NumberFormat } from "./types";

const LOWER_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;
const UPPER_DIGITS = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"] as const;
const CIRCLED = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩",
  "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳",
] as const;

function chineseGroup(value: number, upper: boolean): string {
  const digits = upper ? UPPER_DIGITS : LOWER_DIGITS;
  const units = upper ? ["", "拾", "佰", "仟"] : ["", "十", "百", "千"];
  let result = "";
  let zeroPending = false;
  for (let place = 3; place >= 0; place -= 1) {
    const divisor = 10 ** place;
    const digit = Math.floor(value / divisor) % 10;
    if (digit === 0) {
      if (result.length > 0 && value % divisor !== 0) zeroPending = true;
      continue;
    }
    if (zeroPending) {
      result += digits[0];
      zeroPending = false;
    }
    const omitLeadingOne = !upper && digit === 1 && place === 1 && result.length === 0;
    if (!omitLeadingOne) result += digits[digit];
    result += units[place];
  }
  return result;
}

function toChinese(value: number, upper: boolean): string {
  if (!Number.isSafeInteger(value) || value < 0) return String(value);
  if (value === 0) return "零";
  if (value > 999_999_999_999) return String(value);
  const groupUnits = ["", "万", "亿"] as const;
  const groups: number[] = [];
  let remaining = value;
  while (remaining > 0) {
    groups.push(remaining % 10_000);
    remaining = Math.floor(remaining / 10_000);
  }
  let output = "";
  let needsZero = false;
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index] ?? 0;
    if (group === 0) {
      if (output.length > 0) needsZero = true;
      continue;
    }
    if (output.length > 0 && (needsZero || group < 1000)) output += "零";
    output += chineseGroup(group, upper) + (groupUnits[index] ?? "");
    needsZero = false;
  }
  return output;
}

function toRoman(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 3999) return String(value);
  const symbols: ReadonlyArray<readonly [number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"],
    [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"],
    [5, "V"], [4, "IV"], [1, "I"],
  ];
  let remaining = value;
  let output = "";
  for (const [amount, symbol] of symbols) {
    while (remaining >= amount) {
      output += symbol;
      remaining -= amount;
    }
  }
  return output;
}

function toLetters(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1) return String(value);
  let remaining = value;
  let output = "";
  while (remaining > 0) {
    remaining -= 1;
    output = String.fromCharCode(65 + (remaining % 26)) + output;
    remaining = Math.floor(remaining / 26);
  }
  return output;
}

export function formatCounter(value: number, format: NumberFormat): string {
  switch (format) {
    case "arabic": return String(value);
    case "arabic_full":
      return String(value).replace(/\d/gu, (digit) => String.fromCharCode(0xFF10 + Number(digit)));
    case "chinese_lower": return toChinese(value, false);
    case "chinese_upper": return toChinese(value, true);
    case "circled": return CIRCLED[value - 1] ?? `(${value})`;
    case "letter_upper": return toLetters(value);
    case "letter_lower": return toLetters(value).toLowerCase();
    case "roman_upper": return toRoman(value);
    case "roman_lower": return toRoman(value).toLowerCase();
  }
}

export const NUMBER_FORMAT_PATTERNS: Readonly<Record<NumberFormat, string>> = {
  arabic: "[0-9]+",
  arabic_full: "[０-９]+",
  chinese_lower: "[零〇一二三四五六七八九十百千万亿]+",
  chinese_upper: "[零壹贰叁肆伍陆柒捌玖拾佰仟万亿]+",
  circled: "(?:[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|\\([0-9]+\\))",
  letter_upper: "[A-Z]+",
  letter_lower: "[a-z]+",
  roman_upper: "[IVXLCDM]+",
  roman_lower: "[ivxlcdm]+",
};
