/**
 * WCAG 2.x contrast check for the dashboard tokens (`docs/ui-design.md` §2.4). It reads the colors from
 * the served `src/ui/browser/app.css`, light `:root` then the dark block, so the check cannot drift from
 * the stylesheet. Run: `node tools/contrast.mjs`. It prints a Markdown table and exits 1 on any failure.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const APP_CSS = fileURLToPath(
  new URL("../src/ui/browser/app.css", import.meta.url),
);
// Prettier formats app.css, so the patterns can rely on its spacing.
const ROOT = /:root \{([^}]*)\}/u;
const DARK = "@media (prefers-color-scheme: dark)";
const COLOR = /^ +--([a-z-]+): (#[\da-f]{6});/gimu;
const VERDICTS = ["positive", "negative", "neutral", "unranked"];

/**
 * Foreground token, background token, minimum ratio, and what the pair is used for.
 * @type {[string, string, number, string][]}
 */
const PAIRS = [
  ["text", "bg", 4.5, "body text"],
  ["text", "surface", 4.5, "text in cards/table"],
  ["muted", "bg", 4.5, "secondary text on page"],
  ["muted", "surface", 4.5, "secondary text in cards"],
  ["accent", "bg", 4.5, "links on page"],
  ["accent", "surface", 4.5, "links in cards/table"],
  ["on-accent", "accent", 4.5, "primary button / selected segment text"],
  ["accent", "bg", 3, "focus ring vs page (1.4.11)"],
  ["accent", "surface", 3, "focus ring vs card (1.4.11)"],
  ["accent", "accent-soft", 4.5, "selected segment / selected All pill text"],
  ["accent", "bg", 3, "selected segment inner border vs track (1.4.11)"],
  ["text", "surface-hover", 4.5, "row hover: text"],
  ["muted", "surface-hover", 4.5, "row hover: muted text"],
  ["accent", "surface-hover", 4.5, "row hover: link"],
  ["text", "badge-bg", 4.5, "Review count pill"],
  ["muted", "bg", 4.5, "pre (model reply) uses bg inside card"],
  [
    "border",
    "surface",
    1,
    "card/divider edge (decorative, no minimum; info only)",
  ],
  ["border-strong", "surface", 3, "input/radio/button outline (1.4.11)"],
  ["border-strong", "bg", 3, "control outline on page (1.4.11)"],
  ...VERDICTS.flatMap(
    (verdict) =>
      /** @type {[string, string, number, string][]} */ ([
        [
          `${verdict}-text`,
          `${verdict}-bg`,
          7,
          `${verdict} chip word (AAA target)`,
        ],
        [
          `${verdict}-text`,
          "surface",
          4.5,
          `${verdict} text off-chip (error text, counts)`,
        ],
        [
          `${verdict}-dot`,
          "surface",
          3,
          `${verdict} dot / section border (decorative, aim 3:1)`,
        ],
      ]),
  ),
  ["negative-dot", "surface", 3, "invalid field border (1.4.11)"],
  ["text", "positive-bg", 4.5, "success banner body"],
  ["text", "neutral-bg", 4.5, "info panel / already-subscribed banner"],
  ["text", "negative-bg", 4.5, "error summary box body"],
  ["accent", "negative-bg", 4.5, "link inside error summary"],
];

/**
 * @param {string} hex A `#rrggbb` color.
 * @returns {number} WCAG relative luminance.
 */
function luminance(hex) {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/**
 * @param {string} foreground A `#rrggbb` color.
 * @param {string} background A `#rrggbb` color.
 * @returns {number} The WCAG contrast ratio, at least 1.
 */
export function ratio(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/**
 * @param {string} css Stylesheet text.
 * @returns {{ light: Map<string, string>, dark: Map<string, string> }} Hex color tokens by name, without
 *   the leading `--`. Dark starts from light, so a token the dark block leaves alone keeps its light value.
 */
export function readTokens(css) {
  const light = ROOT.exec(css)?.[1];
  if (light === undefined) {
    throw new Error("app.css has no :root token block");
  }
  const darkStart = css.indexOf(DARK);
  const dark = darkStart === -1 ? undefined : ROOT.exec(css.slice(darkStart));
  if (dark?.[1] === undefined) {
    throw new Error(`app.css has no ${DARK} :root block`);
  }
  const lightTokens = colors(light);
  return {
    light: lightTokens,
    dark: new Map([...lightTokens, ...colors(dark[1])]),
  };
}

/**
 * @param {string} block The declarations inside one `:root` rule.
 * @returns {Map<string, string>} Its `#rrggbb` tokens, lowercased, by name without `--`.
 */
function colors(block) {
  return new Map(
    Array.from(block.matchAll(COLOR), ([, name = "", hex = ""]) => [
      name,
      hex.toLowerCase(),
    ]),
  );
}

/**
 * @param {Map<string, string>} tokens One theme's colors.
 * @param {string} name Token name.
 * @returns {string} Its hex value.
 */
function token(tokens, name) {
  const value = tokens.get(name);
  if (value === undefined) {
    throw new Error(`app.css has no color token --${name}`);
  }
  return value;
}

/**
 * @param {string} css Stylesheet text.
 * @returns {{ failures: number, report: string }} How many pairs miss their minimum, and the Markdown table.
 */
export function checkContrast(css) {
  const lines = [
    "| Theme | Foreground | Background | Ratio | Min | Result | Used for |",
    "|---|---|---|---|---|---|---|",
  ];
  let failures = 0;
  const themes = Object.entries(readTokens(css));
  for (const [theme, tokens] of themes) {
    for (const [foreground, background, minimum, use] of PAIRS) {
      const fg = token(tokens, foreground);
      const bg = token(tokens, background);
      const value = ratio(fg, bg);
      const isPassing = value >= minimum;
      failures += isPassing ? 0 : 1;
      lines.push(
        `| ${theme} | ${foreground} \`${fg}\` | ${background} \`${bg}\` | ${value.toFixed(2)}:1 | ${String(minimum)}:1 | ${isPassing ? "pass" : "**FAIL**"} | ${use} |`,
      );
    }
  }
  lines.push("", `${String(failures)} failing pair(s).`);
  return { failures, report: lines.join("\n") };
}

/* v8 ignore start -- the command line run; the tests call checkContrast. */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- A repository constant.
  const { failures, report } = checkContrast(readFileSync(APP_CSS, "utf8"));
  process.stdout.write(`${report}\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}
/* v8 ignore stop */
