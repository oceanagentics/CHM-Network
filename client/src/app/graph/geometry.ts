/**
 * Geometry defines intrinsic node labels, box sizes, and stable layout hints.
 */
import type { GraphNode } from "../../../../shared/domain";

export interface NodeGeometry {
  width: number;
  height: number;
  textMaxWidth: number;
}

const bandByKind = {
  country: 0,
  organization: 1,
  system: 2,
} satisfies Record<GraphNode["kind"], number>;

function stylizeCharacters(
  value: string,
  offsets: { upper: number; lower: number; digit?: number },
): string {
  return Array.from(value)
    .map((character) => {
      const codePoint = character.codePointAt(0);
      if (codePoint == null) {
        return character;
      }

      if (codePoint >= 65 && codePoint <= 90) {
        return String.fromCodePoint(offsets.upper + (codePoint - 65));
      }

      if (codePoint >= 97 && codePoint <= 122) {
        return String.fromCodePoint(offsets.lower + (codePoint - 97));
      }

      if (offsets.digit != null && codePoint >= 48 && codePoint <= 57) {
        return String.fromCodePoint(offsets.digit + (codePoint - 48));
      }

      return character;
    })
    .join("");
}

function boldSansDisplayText(value: string): string {
  return stylizeCharacters(value, {
    upper: 0x1d5d4,
    lower: 0x1d5ee,
    digit: 0x1d7ec,
  });
}

function italicSansDisplayText(value: string): string {
  return stylizeCharacters(value, {
    upper: 0x1d608,
    lower: 0x1d622,
  });
}

export function buildLabel(node: GraphNode): string {
  const typeLabel = node.subtype ?? node.kind;
  return `${boldSansDisplayText(node.name)}\n${italicSansDisplayText(typeLabel)}`;
}

export function getNodeDimensions(kind: GraphNode["kind"], label: string): NodeGeometry {
  const baseDimensions =
    kind === "country"
      ? { width: 156, height: 96 }
      : kind === "organization" || kind === "system"
        ? { width: 148, height: 92 }
        : { width: 128, height: 84 };
  const widestLineLength = Math.max(...label.split("\n").map((line) => line.length), 0);
  const width = Math.max(baseDimensions.width, Math.min(236, 36 + widestLineLength * 9));
  const textMaxWidth = Math.max(width - 32, 1);
  const wrappedLineCount = label
    .split("\n")
    .reduce(
      (count, line) => count + Math.max(1, Math.ceil((line.length * 9) / textMaxWidth)),
      0,
    );
  const height = Math.max(baseDimensions.height, 28 + wrappedLineCount * 22);

  return { width, height, textMaxWidth };
}

export function getLayoutBand(kind: GraphNode["kind"]): number {
  return bandByKind[kind];
}
