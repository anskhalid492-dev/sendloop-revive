export const SPINTAX_PRESETS = {
  Greeting: ["Hi {there|friend}", "Hello"],
  Opener: ["Hope you're doing well", "Hope your week is going well"],
  CTA: ["Would you be open to a quick chat?", "Is this worth exploring?"],
  "Sign-off": ["Best", "Thanks", "Cheers"],
} as const;

/** Validate balanced nested groups while treating personalization tokens as opaque. */
export function buildSpintax(options: string[]): { syntax: string; error: string | null } {
  const syntax = `{${options.join("|")}}`;
  if (options.length < 2 || options.some((option) => !option.trim())) {
    return { syntax, error: "Enter at least two non-empty options." };
  }
  for (const option of options) {
    const withoutVariables = option.replace(/\{\{[^{}]*\}\}/g, "variable");
    const groups: { hasPipe: boolean; hasValue: boolean }[] = [];
    for (const char of withoutVariables) {
      if (char === "{") groups.push({ hasPipe: false, hasValue: false });
      else if (char === "}") {
        const group = groups.pop();
        if (!group || !group.hasPipe || !group.hasValue) return { syntax, error: "Check the braces and options in your nested spintax." };
        const parent = groups.at(-1);
        if (parent) parent.hasValue = true;
      } else if (char === "|") {
        const group = groups.at(-1);
        if (!group || !group.hasValue) return { syntax, error: "Keep variations in separate options or inside nested braces." };
        group.hasPipe = true;
        group.hasValue = false;
      } else if (char.trim()) {
        const group = groups.at(-1);
        if (group) group.hasValue = true;
      }
    }
    if (groups.length) return { syntax, error: "Close every nested spintax brace." };
  }
  return { syntax, error: null };
}