import { createHighlighter } from "shiki";
import type { CodeLanguage } from "../config/install";

const shikiLanguage = {
  bash: "bash",
  gradle: "groovy",
  groovy: "groovy",
  powershell: "powershell",
  ini: "ini",
} as const;

let highlighter: Awaited<ReturnType<typeof createHighlighter>> | undefined;

export async function highlightCode(code: string, language: CodeLanguage): Promise<string> {
  highlighter ??= await createHighlighter({
    themes: ["github-light", "github-dark"],
    langs: ["bash", "groovy", "powershell", "ini"],
  });

  return highlighter.codeToHtml(code, {
    lang: shikiLanguage[language],
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });
}
