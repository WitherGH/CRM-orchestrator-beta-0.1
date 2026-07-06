/**
 * Agents that need human input append a "## Question for …" section to the
 * task body before the orchestrator moves the task to blocked-question
 * (see the launch flow in orchestrator/src/tick.ts). This extracts the latest
 * question so the Build tab can show it instead of the raw body.
 */
const questionHeadingPattern = /^##\s+Question for .*$/gim;

export function extractAgentQuestion(body: string): string | null {
  const headings = [...body.matchAll(questionHeadingPattern)];
  const lastHeading = headings.at(-1);
  if (lastHeading?.index === undefined) {
    return null;
  }

  const afterHeading = body.slice(lastHeading.index + lastHeading[0].length);
  const nextSectionIndex = afterHeading.search(/^##\s+/m);
  const text = (nextSectionIndex === -1 ? afterHeading : afterHeading.slice(0, nextSectionIndex))
    .trim();

  return text === '' ? null : text;
}
