/**
 * Prompt builders for the interviewer and the extractors. Written for 7-14B local models:
 * short, numbered rules, one tiny example, and the engine's decision spelled out as the
 * very last instruction ("director's note") so the model only has to phrase one question.
 */
import { POSITIONING_AREAS, STORY_ELEMENTS } from "./bank";
import type { Decision } from "./engine";
import { firstName, truncate } from "./text";
import type { ActiveInterviewKind, TranscriptMessage } from "./types";

const LANGUAGES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  de: "German",
  fr: "French",
  pt: "Portuguese",
  it: "Italian",
  nl: "Dutch",
  ru: "Russian",
  uk: "Ukrainian",
  pl: "Polish",
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian",
  fi: "Finnish",
  cs: "Czech",
  tr: "Turkish",
  ro: "Romanian",
  el: "Greek",
  ca: "Catalan",
  ja: "Japanese",
  zh: "Chinese",
  ko: "Korean",
  hi: "Hindi",
  ar: "Arabic",
  he: "Hebrew",
};

export function languageName(code: string | null | undefined): string {
  const c = (code || "en").toLowerCase().split(/[-_]/)[0];
  return LANGUAGES[c] ?? code ?? "English";
}

export type InterviewContext = {
  kind: ActiveInterviewKind;
  name: string;
  headline: string;
  language: string;
  positioning: string;
  audience: string;
  goals: string[];
  pillar: { name: string; description: string } | null;
  /** Titles of memories already in the bank for this pillar (avoid re-mining them). */
  savedTitles: string[];
  avoidTopics: string[];
  /** Opening question (story seed or first positioning question). */
  seed: string | null;
  /** One-line excerpts of earlier story threads in this same session. */
  earlierThreads: string[];
};

const FINISH_STORY = "Finish & save";
const FINISH_POSITIONING = "Finish & build strategy";

/* ------------------------------------------------------------------ */
/* Interviewer                                                         */
/* ------------------------------------------------------------------ */

function aboutBlock(ctx: InterviewContext): string {
  const first = firstName(ctx.name);
  const lines: string[] = [];
  const who = [ctx.headline, ctx.positioning].filter(Boolean).join(". ");
  if (who) lines.push(`About ${first}: ${truncate(who, 300)}`);
  if (ctx.audience) lines.push(`Their readers: ${truncate(ctx.audience, 200)}`);
  if (ctx.kind === "story" && ctx.pillar) lines.push(`Today's theme: ${ctx.pillar.name}${ctx.pillar.description ? ` (${truncate(ctx.pillar.description, 160)})` : ""}`);
  if (ctx.savedTitles.length) lines.push(`Stories already saved (find a different moment): ${ctx.savedTitles.slice(0, 10).map((t) => truncate(t, 60)).join("; ")}`);
  if (ctx.earlierThreads.length) lines.push(`Earlier today they told you about: ${ctx.earlierThreads.map((t) => truncate(t, 90)).join("; ")}`);
  if (ctx.avoidTopics.length) lines.push(`Never steer toward: ${ctx.avoidTopics.slice(0, 8).join(", ")}`);
  return lines.join("\n");
}

export function interviewerSystemPrompt(ctx: InterviewContext): string {
  const first = firstName(ctx.name);
  const lang = languageName(ctx.language);
  if (ctx.kind === "positioning") {
    return `You are a warm, sharp strategist interviewing ${first} to set up their LinkedIn. The goal: learn what LinkedIn should do for them, who they want to reach, what they know and what they believe, so a ghostwriter can plan their content. You only ask questions. You never write posts or give advice.

${aboutBlock(ctx)}

How to talk:
1. One question per message. At most 2 short sentences.
2. Start with a few words that show you listened, reusing their words. Then ask.
3. When an answer is vague, ask for a real example or a number.
4. No praise like "Great answer!", no summaries, no lists, no emojis.
5. Write in ${lang}. Sound like a curious person, not a form.

Example:
${first}: "Mostly I want more clients."
You: "More clients, got it. Picture one client you'd love ten more of. Who are they?"`.trim();
  }
  return `You are a warm, curious interviewer working with ${first}'s LinkedIn ghostwriter. Your job: help ${first} remember ONE real moment from their work in vivid detail, so the ghostwriter can later write a true post from it. You only ask questions. You never write the post.

${aboutBlock(ctx)}

How to talk:
1. One question per message. At most 2 short sentences.
2. Start with a few words that show you listened, reusing their own words. Then ask.
3. Ask about one specific past moment, not habits or opinions.
4. Never add details they didn't give. Ask "What was the room like?", not "Was it a glass room?".
5. No praise like "Great story!", no summaries, no advice, no lists, no emojis.
6. Write in ${lang}. Sound like a curious friend, not a form.

Example:
${first}: "We lost our biggest client last spring."
You: "Your biggest client, gone. Where were you when you found out?"`.trim();
}

const quote = (s: string) => `"${s.replace(/"/g, "'")}"`;

/** The engine's decision as a final instruction for the model. */
export function directorNote(ctx: InterviewContext, d: Decision): string {
  const first = firstName(ctx.name);
  const hello = d.firstMessage ? `This is your first message: greet ${first} in a few words first. ` : "";
  const covered = d.covered.length ? `\nAlready covered: ${d.covered.join(", ")}. Don't ask about those again.` : "";
  const like = d.probe ? `\nAsk something like: ${quote(d.probe.text)}` : "";
  switch (d.stage) {
    case "opening":
      if (ctx.kind === "positioning") {
        return `${hello}Say we'll spend 10 to 15 minutes on what their LinkedIn is for, one question at a time, and short answers are fine. Then ask your first question.${like}`;
      }
      return `${hello}Say we'll capture one real moment from their work, about 10 minutes, and they can type or talk. Then ask this question in your own words: ${quote(ctx.seed ?? "What happened at work this week that you keep thinking about?")}`;
    case "probe": {
      if (d.target === "privacy") return `${hello}Next, check privacy. Ask if any of this is confidential or if anyone should stay anonymous.${like}`;
      const el = STORY_ELEMENTS.find((e) => e.key === d.target);
      if (d.generic) {
        return `${hello}Their last answer was general. Ask for the last specific time it actually happened.${like}${covered}`;
      }
      const after = d.missing.filter((m) => m !== el?.label.toLowerCase()).slice(0, 2);
      return `${hello}Next, find out ${el?.goal ?? "more about the moment"}.${like}${covered}${after.length ? `\nIf they already told you that, ask about ${after[0]} instead.` : ""}`;
    }
    case "photo":
      return `${hello}The story has enough detail now. Ask for ONE real photo connected to it: the place, the people, an object, or a screenshot. Say a quick phone photo is perfect. Ask nothing else.${like}`;
    case "photo-caption":
      return `They shared a photo for this story. Thank them in a few words. Then ask what one line they'd tell a friend about this photo.${like}`;
    case "wrap":
      return `This story is complete. In 2 or 3 short sentences: thank ${first} for the story${
        d.photoDeferred ? ", say it's fine to add the photo later and you'll remind them" : ""
      }, and say they can tap "${FINISH_STORY}" to save it, or tell you about another moment. Don't ask anything else.`;
    case "closing":
      return `${first} is done. In one short sentence, tell them to tap "${ctx.kind === "positioning" ? FINISH_POSITIONING : FINISH_STORY}" and you'll write it all up. No question.`;
    case "pos-question": {
      const area = POSITIONING_AREAS.find((a) => a.key === d.target);
      return `${hello}Next, find out ${area?.goal ?? "more"}.${like}${covered}`;
    }
    case "pos-example":
      return `Their answer was short. Ask for one concrete example or a number.${like}`;
    case "pos-wrap":
      return `You now have what you need. In 2 short sentences: thank ${first}, and say they can tap "${FINISH_POSITIONING}", or add anything else first. Don't ask another question.`;
    case "pos-followup":
      return `Acknowledge what they added in a few words. Then ask if there's anything else, or tell them to tap "${FINISH_POSITIONING}".`;
  }
}

const OPENING_TURN = "Hi, I'm ready.";

function renderUserMessage(m: TranscriptMessage): string {
  const photos = m.photoIds.length ? `[shared ${m.photoIds.length === 1 ? "a photo" : `${m.photoIds.length} photos`}]` : "";
  return [truncate(m.content, 1500), photos].filter(Boolean).join("\n") || "[no answer]";
}

/**
 * Chat messages for the interviewer: a synthetic "ready" turn (so the conversation always
 * starts with the user), the current thread (last 16 messages), then the director's note.
 */
export function interviewerMessages(ctx: InterviewContext, thread: TranscriptMessage[], decision: Decision) {
  const recent = thread.slice(-16);
  const msgs: { role: "user" | "assistant" | "system"; content: string }[] = [];
  if (recent[0]?.role !== "user") msgs.push({ role: "user", content: OPENING_TURN });
  for (const m of recent) {
    const content = m.role === "user" ? renderUserMessage(m) : truncate(m.content, 800);
    const prev = msgs[msgs.length - 1];
    // Merge consecutive same-role turns (e.g. a retried reply) — some templates reject them.
    if (prev && prev.role === m.role) prev.content += "\n\n" + content;
    else msgs.push({ role: m.role, content });
  }
  if (msgs[msgs.length - 1]?.role !== "user") msgs.push({ role: "user", content: "(continue)" });
  msgs.push({ role: "system", content: `Director's note for your next message:\n${directorNote(ctx, decision)}` });
  return msgs;
}

/** Appended when a photo request didn't mention a photo (the inline card also asks). */
export function photoAskFallback(language: string): string {
  const c = (language || "en").toLowerCase().split(/[-_]/)[0];
  const t: Record<string, string> = {
    en: "Do you have a photo from that moment, or something close to it? The place, the people, an object or a screenshot all work.",
    es: "¿Tienes una foto de ese momento, o algo parecido? El lugar, las personas, un objeto o una captura de pantalla sirven.",
    de: "Hast du ein Foto von diesem Moment oder etwas Ähnliches? Der Ort, die Leute, ein Gegenstand oder ein Screenshot passen alle.",
    fr: "As-tu une photo de ce moment, ou quelque chose d'approchant ? Le lieu, les personnes, un objet ou une capture d'écran conviennent.",
    pt: "Tens uma foto desse momento, ou algo parecido? O lugar, as pessoas, um objeto ou uma captura de ecrã servem.",
    it: "Hai una foto di quel momento, o qualcosa di simile? Il posto, le persone, un oggetto o uno screenshot vanno benissimo.",
  };
  return t[c] ?? t.en;
}

const PHOTO_WORDS = /photo|picture|pic\b|image|screenshot|snapshot|selfie|foto|bild|imagen|immagine|captura|aufnahme|cliché/i;
export function mentionsPhoto(text: string): boolean {
  return PHOTO_WORDS.test(text);
}

/* ------------------------------------------------------------------ */
/* Transcripts for extraction                                          */
/* ------------------------------------------------------------------ */

export function formatTranscript(messages: TranscriptMessage[], name: string, maxChars = 24000): string {
  const first = firstName(name);
  const lines = messages.map((m) => (m.role === "assistant" ? `Interviewer: ${m.content.trim()}` : `${first}: ${renderUserMessage(m)}`));
  // Keep the end of very long sessions (where the story usually gets concrete) and the start.
  let text = lines.join("\n\n");
  if (text.length > maxChars) {
    const head = text.slice(0, Math.floor(maxChars * 0.3));
    const tail = text.slice(text.length - Math.floor(maxChars * 0.7));
    text = `${head}\n\n[…]\n\n${tail}`;
  }
  return text;
}

/* ------------------------------------------------------------------ */
/* Story card extraction (finish)                                      */
/* ------------------------------------------------------------------ */

export function storyCardPrompt(input: { name: string; headline: string; language: string; pillars: { name: string; description: string }[]; transcript: string }) {
  const first = firstName(input.name);
  const pillarList = input.pillars.length
    ? `Content pillars:\n${input.pillars.map((p, i) => `${i + 1}. ${p.name}${p.description ? `: ${truncate(p.description, 140)}` : ""}`).join("\n")}\n\n`
    : "";
  const system = `You turn interview transcripts into story cards for a LinkedIn ghostwriter. You are precise and you never invent anything.`;
  const user = `${pillarList}TRANSCRIPT (interview with ${first}${input.headline ? `, ${truncate(input.headline, 120)}` : ""}):
${input.transcript}

Write ONE story card from what ${first} said.
Rules:
1. Use ONLY facts ${first} said. If something wasn't said, leave the field empty ("" or []). Never guess.
2. title: 3 to 8 words, specific (who, what, where). No clickbait.
3. summary: 1 or 2 plain sentences.
4. story: retell it in first person as ${first}, in time order, 100 to 300 words. Keep their own words and phrases. Don't add a moral they didn't say.
5. when and place: exactly as they said them.
6. people: names or roles of the people in it. If they asked to keep someone anonymous, use a role instead of the name.
7. emotions: feelings they mentioned, one or two words each.
8. details: concrete details (numbers, objects, sounds, what was on a screen), short phrases.
9. quotes: up to 4 vivid sentences copied word for word from ${first}'s messages.
10. lesson: the lesson in their words, one sentence. "" if there was none.
11. pillar: the name of the best matching pillar${input.pillars.length ? "" : ' (use "")'}.
12. tags: 3 to 6 lowercase topic words.
13. angles: 2 or 3 possible post angles, one short line each.
14. strength: 1 to 5. 5 means a vivid scene, clear stakes, a turning point, specific details and a lesson. 1 means vague.
Write the text fields in ${languageName(input.language)}.`;
  return { system, user };
}

/* ------------------------------------------------------------------ */
/* Strategy extraction (finish positioning)                            */
/* ------------------------------------------------------------------ */

export function positioningPrompt(input: { name: string; headline: string; language: string; transcript: string }) {
  const first = firstName(input.name);
  const system = `You are a LinkedIn content strategist. You turn an interview into a clear content strategy. You only use what the person said.`;
  const user = `TRANSCRIPT (positioning interview with ${first}${input.headline ? `, ${truncate(input.headline, 120)}` : ""}):
${input.transcript}

Fill in ${first}'s LinkedIn strategy from this interview.
Rules:
1. Use only what ${first} said. Leave a field empty if it wasn't covered.
2. positioning: one sentence like "I help [who] [do what] by [how]", in their words where possible.
3. goals: what LinkedIn should do for them, short phrases, most important first.
4. audienceWho: one sentence about the one reader they want most.
5. audiencePains and audienceDesires: short phrases.
6. expertise: topics they can talk about for an hour.
7. offers: what they sell or want to be known for.
8. beliefs: things they believe about their field, in their words.
9. contrarianTakes: opinions most peers would dispute.
10. pillars: 3 or 4 content pillars. Each has a name (2 to 4 words), a description (one sentence: what these posts are about and why the readers care), and storyPrompts: 3 questions to ask ${first} later to get REAL stories for this pillar, like "When did a client last surprise you?".
11. avoidTopics: topics they don't want to post about.
12. cta: what a reader should do after reading, or "".
13. postsPerWeek: the number they mentioned, or 0.
14. notes: tone, humour, words they never use, anything else useful for a ghostwriter. 1 to 3 sentences.
Write the text in ${languageName(input.language)}.`;
  return { system, user };
}

/** Second, focused attempt when the strategy came back without pillars. */
export function pillarsPrompt(input: { name: string; language: string; summary: string }) {
  const first = firstName(input.name);
  return {
    system: "You are a LinkedIn content strategist.",
    user: `Here is what we know about ${first}:
${input.summary}

Propose 3 or 4 content pillars for ${first}'s LinkedIn. Each pillar has:
- name: 2 to 4 words
- description: one sentence (what the posts are about, why readers care)
- storyPrompts: 3 questions to ask ${first} to get real stories for this pillar
Write in ${languageName(input.language)}.`,
  };
}

/* ------------------------------------------------------------------ */
/* Coverage check (extractor, every few turns)                         */
/* ------------------------------------------------------------------ */

export function coverageCheckPrompt(kind: ActiveInterviewKind, name: string, transcript: string) {
  const first = firstName(name);
  const items =
    kind === "story"
      ? [
          "scene: when AND where it happened",
          "people: who else was involved",
          "stakes: what they wanted, or what could go wrong",
          "turning: the moment things changed",
          "details: a concrete detail like a number, an object, a sound, or exact words",
          "feelings: what they felt or thought in the moment",
          "lesson: what they learned or would tell others",
        ]
      : [
          "goals: what they want LinkedIn to do for them",
          "audience: who they want to reach",
          "problems: what their audience struggles with",
          "offer: what they sell or want to be known for",
          "expertise: topics they know deeply",
          "beliefs: opinions about their field",
          "origin: how they got into this work",
          "boundaries: topics they won't post about, or tone limits",
          "rhythm: how often they can post",
        ];
  return {
    system: "You check interview transcripts. You answer only with true or false values.",
    user: `TRANSCRIPT:
${transcript}

For each item, answer true only if ${first} (not the interviewer) clearly told us this:
${items.map((i) => `- ${i}`).join("\n")}`,
  };
}
