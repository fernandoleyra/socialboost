/**
 * Question banks for the interviewer, stored as data.
 *
 * Sources (see research 02, §3): The Mom Test (specific past instances), Matthew Dicks
 * (five-second moments, first/last/best/worst, Homework for Life), The Moth (stakes),
 * Nieman Storyboard scene reconstruction (senses, dialogue, artefacts → photos),
 * JTBD switch interviews (forces), 5 Whys. IDs S## / P## / F## / PH## match the report.
 */

export type StoryPrompt = { id: string; text: string };
export type StoryTheme = { id: string; label: string; blurb: string; prompts: StoryPrompt[] };

/** Story-mining seeds, grouped by theme. "Surprise me" picks one at random. */
export const STORY_THEMES: StoryTheme[] = [
  {
    id: "failures",
    label: "Failures",
    blurb: "Mistakes, losses and what they cost",
    prompts: [
      { id: "S07", text: "What's the most expensive mistake you've made at work? What did it cost you: money, time, or a relationship?" },
      { id: "S08", text: "Think of a deal or project that fell through. When did you first sense it was going wrong?" },
      { id: "S09", text: "Tell me about a hiring mistake. What did you notice in the interview and decide to ignore?" },
      { id: "S10", text: "When did you let someone down at work? What did you say to them afterwards?" },
      { id: "S03", text: "Tell me about a time you were sure you were right and turned out to be wrong." },
      { id: "S26", text: "What's the worst advice you ever followed? When did you realise it was wrong?" },
    ],
  },
  {
    id: "firsts",
    label: "Firsts",
    blurb: "First client, first hire, first big loss",
    prompts: [
      { id: "S06", text: "Pick a career first: first client, first hire, first person you let go, first big loss. What do you remember most vividly?" },
      { id: "S02", text: "When did you first feel completely out of your depth at work? What happened that first week?" },
      { id: "X01", text: "Think back to your first day in your current role. What happened that you still remember?" },
      { id: "X02", text: "When did someone first pay you for something you made or did? What was it, and how much?" },
      { id: "X03", text: "When did you first say no to a client or a boss? How did that conversation go?" },
    ],
  },
  {
    id: "clients",
    label: "Client moments",
    blurb: "Things clients said, wins, walk-outs",
    prompts: [
      { id: "S11", text: "When did a client last say something that stopped you in your tracks? What exactly did they say?" },
      { id: "S12", text: "Which client result are you proudest of? Where were they before you started, and where were they after?" },
      { id: "S13", text: "Think of a customer who left or complained. What did they say, and what did you change afterwards?" },
      { id: "S14", text: "Tell me about a time you changed your price. What happened, and how did people react?" },
      { id: "X04", text: "Tell me about a client meeting that went completely off-script. Where was it, and what happened?" },
      { id: "X05", text: "When did a client ask you something you couldn't answer on the spot? What did you do next?" },
    ],
  },
  {
    id: "turning-points",
    label: "Turning points",
    blurb: "Decisions and moments that changed direction",
    prompts: [
      { id: "S01", text: "Take me to the day you decided to start or leave something big: a job, a company, a city. Where were you when you made the call?" },
      { id: "S04", text: "When did you almost quit? What stopped you?" },
      { id: "S05", text: "What's the best decision you made that looked stupid at the time?" },
      { id: "S31", text: "When did something recently change your mind about how you work? What exactly happened?" },
      { id: "X06", text: "Think of a conversation that changed the direction of your career. Who was it with, and where were you?" },
    ],
  },
  {
    id: "contrarian",
    label: "Contrarian beliefs",
    blurb: "Rules you broke, advice you ignore",
    prompts: [
      { id: "S43", text: "When did you break an industry rule and it worked?" },
      { id: "S44", text: "When did the boring, obvious solution beat the clever one?" },
      { id: "S34", text: "When did following the popular advice cost you or a client?" },
      { id: "S15", text: "When did you last disagree with everyone else in the room? What happened?" },
      { id: "S33", text: "Pick something you believe that most people in your field would dispute. When did you first realise it? Take me to that moment." },
    ],
  },
  {
    id: "behind-the-scenes",
    label: "Behind the scenes",
    blurb: "How the work really happens",
    prompts: [
      { id: "S45", text: "Walk me through yesterday from the moment you started work. Where was the friction?" },
      { id: "S46", text: "What's on your desk or your screen right now, and why is it there?" },
      { id: "S19", text: "What ritual does your team have that outsiders find odd? When did it start?" },
      { id: "X07", text: "What part of your job does nobody see, even though it takes most of your time? Tell me about the last time you did it." },
      { id: "S40", text: "What did you recently try with a new tool, AI or otherwise, that failed or surprised you? What happened?" },
    ],
  },
  {
    id: "people",
    label: "Lessons from people",
    blurb: "Mentors, strangers, people you met",
    prompts: [
      { id: "P24", text: "Who shaped how you work: a boss, a parent, a mentor? What did they say that stuck with you, word for word?" },
      { id: "S41", text: "Who gave you a break? What happened in that exact moment?" },
      { id: "S18", text: "When did someone junior teach you something? What did they do?" },
      { id: "S42", text: "Think of a stranger or a customer who changed your day. What happened?" },
      { id: "S23", text: "A book, a person or a conversation that changed how you operate. What was the exact moment?" },
      { id: "X08", text: "Who did you meet recently who impressed you? What did you ask them, and what did they say?" },
    ],
  },
  {
    id: "numbers",
    label: "Numbers & results",
    blurb: "Wins, milestones, metrics that lied",
    prompts: [
      { id: "S36", text: "Which number are you proud of? Where were you when you first saw it?" },
      { id: "S37", text: "Tell me about a metric that fooled you. What did it hide?" },
      { id: "S38", text: "Which milestone felt different from what you expected? What happened that day?" },
      { id: "X09", text: "What did you or your team win this year: a prize, a deal, a launch? Take me to the moment you found out." },
      { id: "X10", text: "What took far longer, or far less time, than everyone expected? What were the numbers?" },
    ],
  },
  {
    id: "origin",
    label: "Origin story",
    blurb: "Where you come from, why you do this",
    prompts: [
      { id: "P23", text: "How did you end up doing this work? Was there a moment you decided?" },
      { id: "S20", text: "What did your parents do for work, and what did that teach you about work?" },
      { id: "S21", text: "Which moment from when you were young explains how you work today?" },
      { id: "S22", text: "Think of a place that matters to your story: a city, an office, a kitchen table. What happened there?" },
      { id: "S24", text: "Was there a personal change, like a move or a family event, that changed your priorities at work? Only if you're comfortable sharing." },
    ],
  },
  {
    id: "rituals",
    label: "Daily rituals",
    blurb: "Habits, routines, how you think",
    prompts: [
      { id: "X11", text: "What's one habit you have at work that other people find strange? When did you start doing it?" },
      { id: "X12", text: "What do you do in the first hour of your workday? Tell me about this morning." },
      { id: "X13", text: "Think of a tool or routine you dropped. What made you stop?" },
      { id: "X14", text: "Where do you do your best thinking? Tell me about the last good idea you had there." },
      { id: "X15", text: "How did you prepare for the last important meeting you had? What happened in the room?" },
    ],
  },
  {
    id: "this-week",
    label: "This week",
    blurb: "Fresh moments from the last few days",
    prompts: [
      { id: "S28", text: "What happened this week that made it different from every other week?" },
      { id: "S29", text: "What annoyed you about your industry this week? What exactly happened?" },
      { id: "S30", text: "What did you explain to someone this week that 10,000 people could use? Who were you talking to?" },
      { id: "S32", text: "What photo did you take this week, and what's the story behind it?" },
      { id: "S25", text: "Think of your best day at work recently, or your worst. Pick one and take me there." },
      { id: "S27", text: "When did you last feel proud at work, or like a fraud? What happened?" },
    ],
  },
];

export function allStoryPrompts(): (StoryPrompt & { themeId: string })[] {
  return STORY_THEMES.flatMap((t) => t.prompts.map((p) => ({ ...p, themeId: t.id })));
}

export function themeById(id: string | null | undefined): StoryTheme | undefined {
  return id ? STORY_THEMES.find((t) => t.id === id) : undefined;
}

/** Theme a prompt text belongs to (for showing the theme name next to a stored seed). */
export function themeOfPrompt(text: string): StoryTheme | undefined {
  const norm = text.trim().toLowerCase();
  return STORY_THEMES.find((t) => t.prompts.some((p) => p.text.toLowerCase() === norm));
}

/* ------------------------------------------------------------------ */
/* Story depth: the elements of a postable story and how to probe them */
/* ------------------------------------------------------------------ */

export type Probe = { id: string; text: string };
export type StoryElement = { key: string; label: string; hint: string; goal: string; probes: Probe[] };

/** Order matters: the interviewer works through missing elements top to bottom. */
export const STORY_ELEMENTS: StoryElement[] = [
  {
    key: "scene",
    label: "Scene",
    hint: "When and where it happened",
    goal: "when it happened and where exactly they were",
    probes: [
      { id: "F02", text: "When was this, roughly? And where exactly were you?" },
      { id: "F04", text: "If we were filming that moment, what would the camera see?" },
    ],
  },
  {
    key: "people",
    label: "People",
    hint: "Who was there, what they said",
    goal: "who else was there and what was actually said",
    probes: [
      { id: "F03", text: "Who else was there?" },
      { id: "F05", text: "What exactly did they say? And what did you say back?" },
    ],
  },
  {
    key: "stakes",
    label: "Stakes",
    hint: "What you wanted, what could go wrong",
    goal: "what they wanted most and what they could lose",
    probes: [
      { id: "F08", text: "What did you want most in that moment, and what could you have lost?" },
      { id: "F09", text: "What was your plan going in, and what went wrong with it?" },
      { id: "F15", text: "What would have happened if you hadn't done it?" },
    ],
  },
  {
    key: "turning",
    label: "Turning point",
    hint: "The moment it changed",
    goal: "the exact moment things changed or clicked",
    probes: [
      { id: "F10", text: "When exactly did it click or change? Describe those few seconds." },
      { id: "F11", text: "Before this, what did you believe or do that's the opposite of now?" },
    ],
  },
  {
    key: "details",
    label: "Details",
    hint: "Numbers, objects, sounds",
    goal: "a concrete detail: a number, an object, a sound, or what was on a screen",
    probes: [
      { id: "F12", text: "How much, how many, how long? What were the numbers before and after?" },
      { id: "F04", text: "What could you see or hear around you right then?" },
    ],
  },
  {
    key: "feelings",
    label: "Feelings",
    hint: "What went through your head",
    goal: "what they felt or thought in that moment",
    probes: [{ id: "F06", text: "What was going through your head right then?" }],
  },
  {
    key: "lesson",
    label: "Lesson",
    hint: "What you'd tell someone now",
    goal: "what they learned, in their own words",
    probes: [
      { id: "F17", text: "If you had to teach a new hire the lesson in one sentence, what would it be?" },
      { id: "F13", text: "Why did that matter so much to you?" },
      { id: "F18", text: "Who out there is in that situation right now, and what should they do on Monday?" },
    ],
  },
];

export const PHOTO_ELEMENT = { key: "photo", label: "Photo", hint: "A real picture from it" } as const;

/** F01: pull a generality back to one real instance. */
export const SPECIFIC_PROBE: Probe = { id: "F01", text: "Tell me about the last specific time that happened." };
/** F20: risk gate when other people, clients or numbers appear in a story. */
export const PRIVACY_PROBE: Probe = { id: "F20", text: "Is any of this confidential? Should anyone in the story stay anonymous?" };
/** F19 / PH01: the mandatory artefact request. */
export const PHOTO_PROBE: Probe = {
  id: "F19",
  text: "Do you have a photo from that moment, or something close to it: the place, the people, an object, a screenshot?",
};
/** PH08: the caption you'd tell a friend → raw material for the hook. */
export const CAPTION_PROBE: Probe = { id: "PH08", text: "What's the one line you'd tell a friend about this photo?" };

/** Shown next to the inline photo request. PH02–PH07. */
export const PHOTO_TIPS = [
  "Real and unpolished beats a studio shot. A phone photo is perfect.",
  "No photo from that day? Take one this week of the place, an object or the people involved.",
  "Hold the phone upright (portrait). Face visible if the story is about you.",
  "Screens and whiteboards are fine. Check nothing confidential is visible.",
  "Make sure everyone in the photo is happy to be on LinkedIn.",
];

/* ------------------------------------------------------------------ */
/* Positioning interview (Bank A)                                      */
/* ------------------------------------------------------------------ */

export type PositioningArea = { key: string; label: string; hint: string; goal: string; question: Probe };

export const POSITIONING_AREAS: PositioningArea[] = [
  {
    key: "goals",
    label: "Goals",
    hint: "What LinkedIn should do for you",
    goal: "what they want LinkedIn to do for them in the next 12 months",
    question: { id: "P01", text: "What do you want LinkedIn to do for you in the next 12 months: clients, hiring, investors, speaking, a new job? Which matters most?" },
  },
  {
    key: "audience",
    label: "Audience",
    hint: "The one reader you want",
    goal: "the one real person they most want reading their posts",
    question: { id: "P05", text: "Picture one real person you'd love to have reading your posts. What's their role, and what's on their plate this week?" },
  },
  {
    key: "problems",
    label: "Their problems",
    hint: "What they struggle with",
    goal: "what that reader struggles with and asks them about",
    question: { id: "P07", text: "What questions do clients or people you mentor ask you again and again? Give me a few, in their words." },
  },
  {
    key: "offer",
    label: "Offer & proof",
    hint: "What you sell, results you can share",
    goal: "what they sell or want to be known for, and results they can talk about publicly",
    question: { id: "P10", text: "What do you sell, or want to be known for, in one sentence a 12-year-old would get? And which results can you talk about publicly?" },
  },
  {
    key: "expertise",
    label: "Expertise",
    hint: "Topics you could talk about for an hour",
    goal: "three topics they could talk about for an hour with no notes",
    question: { id: "P14", text: "Which three topics could you talk about for an hour with no notes?" },
  },
  {
    key: "beliefs",
    label: "Beliefs",
    hint: "What you believe that peers dispute",
    goal: "what they believe about their field that most peers would dispute",
    question: { id: "P17", text: "What do you believe about your field that most of your peers would disagree with?" },
  },
  {
    key: "origin",
    label: "Origin",
    hint: "How you got here",
    goal: "how they ended up doing this work",
    question: { id: "P23", text: "How did you end up doing this work? Was there a moment you decided?" },
  },
  {
    key: "boundaries",
    label: "Boundaries",
    hint: "Off-limits topics, tone",
    goal: "topics that are off-limits and how personal or playful they want to sound",
    question: { id: "P16", text: "What's off-limits for your posts: clients, your employer, family, politics, money? And how personal are you willing to get?" },
  },
  {
    key: "rhythm",
    label: "Rhythm",
    hint: "How often you can post",
    goal: "how many posts a week they can realistically review",
    question: { id: "P31", text: "How many posts a week could you realistically review, and how much time a week can you give to a short story interview?" },
  },
];

export const POSITIONING_EXAMPLE_PROBE: Probe = { id: "F07", text: "Can you give me one concrete example?" };
