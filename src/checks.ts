import type { FidelityResult } from "./types.ts";
import { uniq } from "./util.ts";

const NUMERIC = /^-?\d+(\.\d+)?$/;

function walkLeaf(v: unknown, out: string[]): void {
  if (v === null || v === undefined) {
    return;
  }
  if (typeof v === "string") {
    if (v.trim()) {
      out.push(v);
    }
    return;
  }
  if (typeof v === "number") {
    if (Number.isFinite(v)) {
      out.push(String(v));
    }
    return;
  }
  if (Array.isArray(v)) {
    for (const item of v) {
      walkLeaf(item, out);
    }
    return;
  }
  if (typeof v === "object") {
    for (const item of Object.values(v as Record<string, unknown>)) {
      walkLeaf(item, out);
    }
  }
}

export function collectLeafValues(data: unknown): string[] {
  const out: string[] = [];
  walkLeaf(data, out);
  return out;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function group(intPart: string, sep: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

function numberVariants(raw: string): string[] {
  const [intPart = "", decPart] = raw.replace("-", "").split(".");
  const suffix = decPart ? `.${decPart}` : "";
  const sign = raw.startsWith("-") ? "-" : "";
  const bases = [
    intPart,
    group(intPart, ","),
    group(intPart, "."),
    group(intPart, " "),
  ];
  return uniq(bases.map((b) => `${sign}${b}${suffix}`));
}

function valueFound(raw: string, haystack: string): boolean {
  const norm = normalize(raw);
  if (norm && haystack.includes(norm)) {
    return true;
  }
  if (NUMERIC.test(raw)) {
    for (const variant of numberVariants(raw)) {
      if (haystack.includes(normalize(variant))) {
        return true;
      }
    }
  }
  return false;
}

export function computeFidelity(
  data: unknown,
  pageText: string
): FidelityResult {
  const values = collectLeafValues(data);
  const haystack = normalize(pageText);
  const missing: string[] = [];
  let found = 0;
  for (const value of values) {
    if (valueFound(value, haystack)) {
      found += 1;
    } else {
      missing.push(value);
    }
  }
  const total = values.length;
  return { found, missing, rate: total === 0 ? 1 : found / total, total };
}
