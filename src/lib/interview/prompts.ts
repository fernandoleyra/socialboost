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
  if (ctx.kind === "story" && ctx.goals.length) lines.push(`What they want from LinkedIn: ${truncate(ctx.goals.slice(0, 3).join("; "), 160)}`);
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
const quoteLine = (s: string) => quote(truncate(s, 300));

/** How the turn is produced: the model writes only a reaction (+ question), or everything. */
export type NoteMode = "protocol" | "free";

/**
 * The engine's decision as the model's final instruction. In "protocol" mode the model
 * writes only a short reaction and/or one question; fixed lines (photo request, finish
 * hints) are added by the app. "free" mode (languages without fixed lines) asks the model
 * for the whole message.
 */
export function directorNote(ctx: InterviewContext, d: Decision, mode: NoteMode = "protocol"): string {
  const first = firstName(ctx.name);
  const hello = d.firstMessage ? `This is your first message: greet ${first} in a few words first. ` : "";
  const covered = d.covered.length ? `\nAlready covered: ${d.covered.join(", ")}. Don't ask about those again.` : "";
  const like = d.probe ? `\nAsk something like: ${quote(d.probe.text)}` : "";
  const react = `Write ONE short sentence reacting to what ${first} just said, reusing their own words. No question. No praise. Nothing else.`;
  const finishStory = `"${FINISH_STORY}"`;
  const finishPos = `"${FINISH_POSITIONING}"`;
  switch (d.stage) {
    case "opening":
      if (ctx.kind === "positioning") {
        return `${hello}Say we'll spend 10 to 15 minutes on what their LinkedIn is for, one question at a time, and short answers are fine. Then ask your first question.${like}`;
      }
      return `${hello}Say we'll capture one real moment from their work, about 10 minutes, and they can type or talk. Then ask this question in your own words: ${quote(ctx.seed ?? "What happened at work this week that you keep thinking about?")}`;
    case "probe": {
      if (d.target === "privacy") return `${hello}Next, check privacy: ask if any of this is confidential or if anyone should stay anonymous.${like}`;
      const el = STORY_ELEMENTS.find((e) => e.key === d.target);
      if (d.generic) return `${hello}Their last answer was general. Ask for the last specific time it actually happened.${like}${covered}`;
      const after = d.missing.filter((m) => m !== el?.label.toLowerCase()).slice(0, 2);
      return `${hello}Write a few words reacting to their answer, then ONE question to find out ${el?.goal ?? "more about the moment"}.${like}${covered}${
        after.length ? `\nIf they already told you that, ask about ${after[0]} instead.` : ""
      }`;
    }
    case "photo":
      return mode === "protocol"
        ? `Their story has enough detail now. ${react}`
        : `${hello}The story has enough detail now. Ask for ONE real photo connected to it: the place, the people, an object, or a screenshot. Say a quick phone photo is perfect. Ask nothing else.${like}`;
    case "photo-caption":
      return mode === "protocol"
        ? `${first} just shared a photo for this story. Write ONE short sentence thanking them for it. No question. Nothing else.`
        : `They shared a photo for this story. Thank them in a few words. Then ask what one line they'd tell a friend about this photo.${like}`;
    case "wrap":
      return mode === "protocol"
        ? `The story is complete. Write ONE or two short sentences that reflect back the heart of it (the moment and what changed), using ${first}'s words. Only use what ${first} told you. No question, no advice, no praise.`
        : `This story is complete. In 2 or 3 short sentences: thank ${first} for the story${
            d.photoDeferred ? ", say it's fine to add the photo later and you'll remind them" : ""
          }, and say they can tap ${finishStory} to save it, or tell you about another moment. Don't ask anything else.`;
    case "closing":
      return `${first} is done. In one short sentence, tell them to tap ${ctx.kind === "positioning" ? finishPos : finishStory} and you'll write it all up. No question.`;
    case "pos-question": {
      const area = POSITIONING_AREAS.find((a) => a.key === d.target);
      return `${hello}Write a few words reacting to their answer, then ONE question to find out ${area?.goal ?? "more"}.${like}${covered}`;
    }
    case "pos-example":
      return `Their answer was short. Ask for one concrete example or a number.${like}`;
    case "pos-wrap":
      return mode === "protocol" ? react : `You now have what you need. In 2 short sentences: thank ${first}, and say they can tap ${finishPos}, or add anything else first. Don't ask another question.`;
    case "pos-followup":
      return mode === "protocol" ? react : `Acknowledge what they added in a few words. Then ask if there's anything else, or tell them to tap ${finishPos}.`;
  }
}

/* ------------------------------------------------------------------ */
/* Fixed protocol lines                                                */
/* ------------------------------------------------------------------ */

export type ProtocolLines = {
  photoAsk: string;
  captionAsk: string;
  wrap: string;
  wrapDeferred: string;
  closingStory: string;
  closingPositioning: string;
  posWrap: string;
  posFollowup: string;
};

const PROTOCOL: Record<string, ProtocolLines> = {
  en: {
    photoAsk: "Do you have a photo from that moment, or something close to it? The place, the people, an object or a screenshot all work, and a quick phone photo is perfect.",
    captionAsk: "What's the one line you'd tell a friend about this photo?",
    wrap: `Tap "${FINISH_STORY}" to keep this story, or tell me about another moment.`,
    wrapDeferred: `No photo yet is fine: the story will be flagged so you can add one later. Tap "${FINISH_STORY}" to keep it, or tell me about another moment.`,
    closingStory: `Tap "${FINISH_STORY}" and I'll write it up for your Memory Bank.`,
    closingPositioning: `Tap "${FINISH_POSITIONING}" and I'll draft your positioning and pillars.`,
    posWrap: `That's everything I need. Tap "${FINISH_POSITIONING}", or add anything else first.`,
    posFollowup: `Anything else? If not, tap "${FINISH_POSITIONING}".`,
  },
  es: {
    photoAsk: "¿Tienes una foto de ese momento, o algo parecido? El lugar, las personas, un objeto o una captura de pantalla sirven, y una foto rápida con el móvil es perfecta.",
    captionAsk: "¿Qué frase le dirías a un amigo sobre esta foto?",
    wrap: `Toca "${FINISH_STORY}" para guardar esta historia, o cuéntame otro momento.`,
    wrapDeferred: `Sin foto por ahora está bien: marcaré la historia para que añadas una después. Toca "${FINISH_STORY}" para guardarla, o cuéntame otro momento.`,
    closingStory: `Toca "${FINISH_STORY}" y la redacto para tu Memory Bank.`,
    closingPositioning: `Toca "${FINISH_POSITIONING}" y redacto tu posicionamiento y tus pilares.`,
    posWrap: `Ya tengo lo que necesito. Toca "${FINISH_POSITIONING}", o añade algo más antes.`,
    posFollowup: `¿Algo más? Si no, toca "${FINISH_POSITIONING}".`,
  },
  de: {
    photoAsk: "Hast du ein Foto von diesem Moment oder etwas Ähnliches? Der Ort, die Leute, ein Gegenstand oder ein Screenshot passen, und ein schnelles Handyfoto ist perfekt.",
    captionAsk: "Welchen einen Satz würdest du einem Freund zu diesem Foto sagen?",
    wrap: `Tippe auf "${FINISH_STORY}", um diese Geschichte zu speichern, oder erzähl mir von einem anderen Moment.`,
    wrapDeferred: `Noch kein Foto ist okay: Ich markiere die Geschichte, damit du später eins hinzufügen kannst. Tippe auf "${FINISH_STORY}", um sie zu speichern, oder erzähl mir von einem anderen Moment.`,
    closingStory: `Tippe auf "${FINISH_STORY}", und ich schreibe sie für deine Memory Bank auf.`,
    closingPositioning: `Tippe auf "${FINISH_POSITIONING}", und ich entwerfe deine Positionierung und Themensäulen.`,
    posWrap: `Ich habe alles, was ich brauche. Tippe auf "${FINISH_POSITIONING}" oder ergänze vorher noch etwas.`,
    posFollowup: `Noch etwas? Wenn nicht, tippe auf "${FINISH_POSITIONING}".`,
  },
  fr: {
    photoAsk: "As-tu une photo de ce moment, ou quelque chose d'approchant ? Le lieu, les personnes, un objet ou une capture d'écran conviennent, et une photo rapide au téléphone est parfaite.",
    captionAsk: "Quelle phrase dirais-tu à un ami à propos de cette photo ?",
    wrap: `Appuie sur « ${FINISH_STORY} » pour garder cette histoire, ou raconte-moi un autre moment.`,
    wrapDeferred: `Pas de photo pour l'instant, ce n'est pas grave : je signale l'histoire pour que tu en ajoutes une plus tard. Appuie sur « ${FINISH_STORY} » pour la garder, ou raconte-moi un autre moment.`,
    closingStory: `Appuie sur « ${FINISH_STORY} » et je la rédige pour ta Memory Bank.`,
    closingPositioning: `Appuie sur « ${FINISH_POSITIONING} » et je rédige ton positionnement et tes piliers.`,
    posWrap: `J'ai tout ce qu'il me faut. Appuie sur « ${FINISH_POSITIONING} », ou ajoute quelque chose avant.`,
    posFollowup: `Autre chose ? Sinon, appuie sur « ${FINISH_POSITIONING} ».`,
  },
  pt: {
    photoAsk: "Você tem uma foto desse momento, ou algo parecido? O lugar, as pessoas, um objeto ou uma captura de tela servem, e uma foto rápida no celular é perfeita.",
    captionAsk: "Qual frase você diria a um amigo sobre esta foto?",
    wrap: `Toque em "${FINISH_STORY}" para guardar esta história, ou me conte outro momento.`,
    wrapDeferred: `Sem foto por enquanto, tudo bem: vou marcar a história para você adicionar uma depois. Toque em "${FINISH_STORY}" para guardá-la, ou me conte outro momento.`,
    closingStory: `Toque em "${FINISH_STORY}" e eu escrevo tudo para a sua Memory Bank.`,
    closingPositioning: `Toque em "${FINISH_POSITIONING}" e eu rascunho seu posicionamento e seus pilares.`,
    posWrap: `Já tenho o que preciso. Toque em "${FINISH_POSITIONING}", ou acrescente algo antes.`,
    posFollowup: `Mais alguma coisa? Se não, toque em "${FINISH_POSITIONING}".`,
  },
  it: {
    photoAsk: "Hai una foto di quel momento, o qualcosa di simile? Il posto, le persone, un oggetto o uno screenshot vanno benissimo, e una foto veloce col telefono è perfetta.",
    captionAsk: "Qual è la frase che diresti a un amico su questa foto?",
    wrap: `Tocca "${FINISH_STORY}" per salvare questa storia, oppure raccontami un altro momento.`,
    wrapDeferred: `Niente foto per ora va bene: segnalo la storia così potrai aggiungerne una più tardi. Tocca "${FINISH_STORY}" per salvarla, oppure raccontami un altro momento.`,
    closingStory: `Tocca "${FINISH_STORY}" e la scrivo per la tua Memory Bank.`,
    closingPositioning: `Tocca "${FINISH_POSITIONING}" e preparo il tuo posizionamento e i tuoi pilastri.`,
    posWrap: `Ho tutto quello che mi serve. Tocca "${FINISH_POSITIONING}", oppure aggiungi altro prima.`,
    posFollowup: `Altro? Se no, tocca "${FINISH_POSITIONING}".`,
  },
};

const langCode = (language: string | null | undefined) => (language || "en").toLowerCase().split(/[-_]/)[0];

/** Fixed lines in the profile's language, or null when we don't have that language. */
export function protocolLines(language: string | null | undefined): ProtocolLines | null {
  return PROTOCOL[langCode(language)] ?? null;
}

export const isEnglish = (language: string | null | undefined) => langCode(language) === "en";

/**
 * Deterministic English opening: a short frame plus the seed question verbatim. Instant on
 * any model, and the bank question survives intact. Other languages let the model translate.
 */
export function openingMessage(ctx: InterviewContext, opts: { returning: boolean; variant: number }): string | null {
  if (!isEnglish(ctx.language)) return null;
  const first = firstName(ctx.name);
  if (ctx.kind === "positioning") {
    return `Hi ${first}. Over the next 10 to 15 minutes we'll work out what your LinkedIn is for and who it should reach. One question at a time. Short answers are fine; examples help most.\n\n${POSITIONING_AREAS[0].question.text}`;
  }
  const frames = opts.returning
    ? [`Hi ${first}, new story. Same as before: one moment, the details, then a photo.`, `Good to see you, ${first}. Let's find the next story.`, `Hi ${first}. One real moment, told in detail. Take your time.`]
    : [`Hi ${first}. Let's capture one real moment from your work, in enough detail that it could become a post. About 10 minutes, one question at a time. Short answers are fine, and you can type or tap the mic.`];
  return `${frames[Math.abs(opts.variant) % frames.length]}\n\n${ctx.seed ?? "What happened at work this week that you keep thinking about?"}`;
}

/* ------------------------------------------------------------------ */
/* Is the model's question on target? (English)                        */
/* ------------------------------------------------------------------ */

const TARGET_WORDS: Record<string, RegExp> = {
  scene: /\b(when|where|what (day|time|month|year)|which (day|city|room|office)|time of day|place|room|setting|camera|look like|were you)\b/i,
  people: /\b(who|someone|anyone|say|said|tell|told|repl(y|ied)|respond|react|answer|words)\b/i,
  stakes: /\b(want|wanted|hop(e|ed|ing)|need|needed|goal|risk|lose|lost|stake|on the line|wrong|plan|afraid|fear|worr\w*|cost|happen(ed)? if|what if|pressure|matter)\b/i,
  turning: /\b(moment|click(ed)?|chang\w*|reali[sz]\w*|turn\w*|shift\w*|before|opposite|exactly when|decid\w*|notic\w*)\b/i,
  details: /\b(how (much|many|long|big)|numbers?|figures?|cost|see|saw|hear|heard|smell\w*|look like|screen|details?|exactly|objects?|room)\b/i,
  feelings: /\b(feel|felt|feeling|head|think|thought|mind|react\w*|emotion\w*|nervous|scared|stomach|heart)\b/i,
  lesson: /\b(learn\w*|lesson|teach\w*|advice|takeaway|differently|rule|new hire|monday|would you tell|tell (someone|others|a friend|people|your younger)|someone (else|in)|others|matter\w*|why did|since then|do now)\b/i,
  privacy: /\b(confidential|anonym\w*|private|names?|permission|share|mention|public)\b/i,
  specific: /\b(last time|specific|one time|example|instance|particular|recent\w*|that day|happened)\b/i,
  goals: /\b(linkedin|goals?|want|hope|achieve|clients?|hir\w*|investors?|speak\w*|job|matters?|success|outcome)\b/i,
  audience: /\b(who|readers?|person|people|audience|role|ideal|clients?|customers?|picture|reach)\b/i,
  problems: /\b(asks?|questions?|struggl\w*|problems?|pain|challeng\w*|stuck|hard|frustrat\w*|worr\w*)\b/i,
  offer: /\b(sell|offer\w*|known for|services?|results?|help|proof|products?|publicly|outcomes?)\b/i,
  expertise: /\b(topics?|talk about|expert\w*|know|hour|subjects?|deep)\b/i,
  beliefs: /\b(believe|beliefs?|disagree|wrong|overrated|myths?|opinions?|unpopular|dispute|contrar\w*|peers)\b/i,
  origin: /\b(how did you|end(ed)? up|start\w*|began|got into|get into|background|decid\w*|origin|path|journey)\b/i,
  boundaries: /\b(off-limits|off limits|avoid|private|personal|never|won'?t|don'?t want|tone|boundar\w*|comfortable|emojis?)\b/i,
  rhythm: /\b(how (many|often)|week\w*|time|posts?|review|realistic\w*|cadence|frequen\w*)\b/i,
  example: /\b(example|instance|specific|for instance|time when|numbers?|case)\b/i,
};

/** Does `question` plausibly ask about `target`? Unknown targets always pass. */
export function questionOnTarget(target: string | undefined, question: string): boolean {
  const re = target ? TARGET_WORDS[target] : undefined;
  return re ? re.test(question) : true;
}

const OPENING_TURN = "Hi, I'm ready.";

function renderUserMessage(m: TranscriptMessage): string {
  const photos = m.photoIds.length ? `[shared ${m.photoIds.length === 1 ? "a photo" : `${m.photoIds.length} photos`}]` : "";
  return [truncate(m.content, 1500), photos].filter(Boolean).join("\n") || "[no answer]";
}

/**
 * Chat messages for the interviewer: a synthetic "ready" turn (so the conversation always
 * starts with the user), the current thread (last 16 messages), then the director's note.
 *
 * The note goes in a trailing system message (Ollama and Anthropic handle that well). Some
 * OpenAI-compatible servers run chat templates that reject a system message after the first
 * turn (Mistral templates in LM Studio, llama.cpp, vLLM), so with `noteInUserTurn` it is
 * appended to the last user turn instead.
 */
export function interviewerMessages(
  ctx: InterviewContext,
  thread: TranscriptMessage[],
  decision: Decision,
  mode: NoteMode = "protocol",
  opts: { noteInUserTurn?: boolean } = {},
) {
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
  const note = directorNote(ctx, decision, mode);
  if (opts.noteInUserTurn) {
    const last = msgs[msgs.length - 1];
    last.content += `\n\n[Director's note for your next message. It comes from the ghostwriter, not from ${firstName(ctx.name)}. Don't mention it.]\n${note}`;
  } else {
    msgs.push({ role: "system", content: `Director's note for your next message:\n${note}` });
  }
  return msgs;
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

export function storyCardPrompt(input: { name: string; headline: string; language: string; pillars: { name: string; description: string }[]; transcript: string; privacy?: string | null }) {
  const first = firstName(input.name);
  const pillarList = input.pillars.length
    ? `Content pillars:\n${input.pillars.map((p, i) => `${i + 1}. ${p.name}${p.description ? `: ${truncate(p.description, 140)}` : ""}`).join("\n")}\n\n`
    : "";
  const system = `You turn interview transcripts into story cards for a LinkedIn ghostwriter. You are precise and you never invent anything.`;
  const privacy = input.privacy ? `\nPrivacy note from ${first}: ${quoteLine(input.privacy)}. Respect it (if they want someone anonymous, use a role instead of the name).\n` : "";
  const user = `${pillarList}TRANSCRIPT (interview with ${first}${input.headline ? `, ${truncate(input.headline, 120)}` : ""}):
${input.transcript}
${privacy}
Write ONE story card from what ${first} said.
Rules:
1. Use ONLY facts ${first} said. If something wasn't said, leave the field empty ("" or []). Never guess.
2. title: 3 to 8 words naming what happened, like a file label (e.g. "Payroll export failed before Christmas"). Not a headline. Don't use ${first}'s name.
3. summary: 1 or 2 plain sentences.
4. story: retell it in first person as ${first}, in time order, at most 300 words. Keep their own words and phrases. Leave out the interviewer's questions. If they said little, keep it short. Never fill gaps, and don't add a moral they didn't say.
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
10. avoidTopics: topics they said they don't want to post about. Don't invent any.
11. cta: what a reader should do after reading, or "".
12. postsPerWeek: the number they mentioned, or 0.
13. notes: tone, humour, words they never use, anything else useful for a ghostwriter. 1 to 3 sentences.
Write the text in ${languageName(input.language)}.`;
  return { system, user };
}

/** Content pillars from the strategy summary (second finish call). */
export function pillarsPrompt(input: { name: string; language: string; summary: string }) {
  const first = firstName(input.name);
  return {
    system: "You are a LinkedIn content strategist.",
    user: `Here is what we know about ${first}:
${input.summary}

Propose 3 or 4 content pillars for ${first}'s LinkedIn.
Rules:
1. Build each pillar from what ${first} actually said: their expertise, offer, beliefs and audience. No generic pillars like "Leadership" or "Motivation" unless they talked about it.
2. The pillars must be clearly different from each other. Never build one on an off-limits topic.
3. name: 2 to 4 words.
4. description: one sentence: what the posts are about and why their readers care.
5. storyPrompts: 3 questions that ask ${first} about ONE specific past moment for this pillar, like "When did a client last ...? What exactly happened?". Never ask for opinions or habits.
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
