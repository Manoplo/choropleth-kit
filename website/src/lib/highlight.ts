// A tiny JSX/TS tokenizer for the snippets on the landing. Not a general highlighter: it knows
// exactly the shapes that appear in our own examples, and it runs at build time and at hydration
// with no dependency.
export type TokenKind = "comment" | "string" | "keyword" | "tag" | "prop" | "number" | "plain";
export type Token = { kind: TokenKind; text: string };

const RULES: [TokenKind, RegExp][] = [
  ["comment", /^\/\/.*/],
  ["string", /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/],
  ["keyword", /^(?:import|from|const|export|return|await|async|function|type|new)\b/],
  ["tag", /^<\/?[A-Z][\w.]*|^<\/?[a-z]+(?=[\s>/])/],
  ["prop", /^[a-zA-Z][\w-]*(?==)/],
  ["number", /^\d+(?:\.\d+)?/],
  ["plain", /^[\s\S]/],
];

export function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let rest = line;
  while (rest.length > 0) {
    for (const [kind, rule] of RULES) {
      const match = rule.exec(rest);
      if (match) {
        const text = match[0];
        const last = tokens[tokens.length - 1];
        if (kind === "plain" && last?.kind === "plain") last.text += text;
        else tokens.push({ kind, text });
        rest = rest.slice(text.length);
        break;
      }
    }
  }
  return tokens;
}
