/**
 * Section labels used inside the writer prompts. Pure.
 *
 * Small models sometimes echo the prompt back ("Details:", "What I learned: …"). Keeping the
 * labels in one place lets the cleaner recognise and remove an echo without guessing.
 */

export const L = {
  notesOpen: "<notes>",
  notesClose: "</notes>",
  postOpen: "<post>",
  postClose: "</post>",
  title: "Title:",
  when: "When:",
  where: "Where:",
  people: "People:",
  happened: "What happened (my words from the interview):",
  details: "Details:",
  quotes: "Things said, word for word (only these may be quoted):",
  felt: "How I felt:",
  learned: "What I learned:",
  photo: "Photo for the post:",
  about: "About me:",
  name: "Name:",
  headline: "Headline:",
  purpose: "What my LinkedIn is for:",
  audience: "Who I write for:",
  pains: "What they struggle with:",
  desires: "What they want:",
  background: "My background:",
  topic: "Topic of this post:",
  avoid: "Never write about:",
  firstLine: "Start the post with this exact first line:",
  point: "Point for the reader:",
  structure: "Follow this structure",
  voice: "How I write:",
  rules: "Rules:",
  aiSounding: "These sound like AI. Never write like this:",
  changes: "Rewrite it with these changes:",
} as const;

/** Labels whose echo is followed by a list that should go too. */
export const LIST_LABELS: string[] = [L.details, L.quotes, L.rules, L.aiSounding, L.structure, L.changes];

export const ALL_LABELS: string[] = Object.values(L);
