import chalk from "chalk";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";

marked.use(markedTerminal({
  list(body: string, ordered: boolean, indent: number) {
    return body.replace(/^\* /gm, "• ").replace(/^( +)\* /gm, "$1• ");
  },
}));

export function renderMarkdown(text: string): string {
  const rendered = (marked.parse(text) as string).trimEnd();
  return rendered.replace(/`([^`]+)`/g, (_, code) => chalk.bold.cyan(code));
}
