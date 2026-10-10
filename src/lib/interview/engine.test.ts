import { describe, expect, it } from "vitest";
import { STORY_THEMES, allStoryPrompts, POSITIONING_AREAS } from "./bank";
import {
  applyUserTurn,
  decideNext,
  depthScore,
  isSingleQuestionStage,
  neediestPillar,
  planStoryInterview,
  positioningCoverage,
  splitThreads,
  storyCoverage,
  strengthFromCoverage,
  surprisePrompt,
  currentThread,
  type Decision,
} from "./engine";
import { EMPTY_STATE, type ActiveInterviewKind, type InterviewState, type TranscriptMessage } from "./types";

/** Tiny driver: plays user answers through the engine like the reply route does. */
function session(kind: ActiveInterviewKind) {
  let n = 0;
  let state: InterviewState = { ...EMPTY_STATE, meta: {} };
  const messages: TranscriptMessage[] = [];
  const assistant = (d: Decision) => {
    const id = `a${++n}`;
    messages.push({ id, role: "assistant", content: `(${d.stage})`, photoIds: [] });
    state = { ...state, meta: { ...state.meta, [id]: { stage: d.stage, target: d.target, probeId: d.probe?.id, generic: d.generic } } };
    return d;
  };
  return {
    get state() {
      return state;
    },
    messages,
    open() {
      return assistant(decideNext(kind, messages, state));
    },
    say(content: string, opts: { photos?: string[]; intent?: "photo-later" } = {}) {
      messages.push({ id: `u${++n}`, role: "user", content, photoIds: opts.photos ?? [] });
      state = applyUserTurn(kind, messages, state, opts.intent);
      return assistant(decideNext(kind, messages, state));
    },
  };
}

describe("question bank", () => {
  it("has 40+ story prompts across the required themes with unique ids per theme", () => {
    expect(allStoryPrompts().length).toBeGreaterThanOrEqual(40);
    const ids = STORY_THEMES.map((t) => t.id);
    for (const t of ["failures", "firsts", "clients", "turning-points", "contrarian", "behind-the-scenes", "people", "numbers", "origin", "rituals"]) {
      expect(ids).toContain(t);
    }
    for (const theme of STORY_THEMES) {
      expect(theme.prompts.length).toBeGreaterThanOrEqual(4);
      expect(new Set(theme.prompts.map((p) => p.id)).size).toBe(theme.prompts.length);
    }
  });
});

describe("story interview flow", () => {
  it("opens, probes missing elements one at a time, then always asks for a photo", () => {
    const s = session("story");
    expect(s.open().stage).toBe("opening");

    const d1 = s.say("We lost our biggest client. It was a bank we had worked with for three years.");
    expect(d1.stage).toBe("probe");
    expect(d1.target).toBe("scene");

    const d2 = s.say("It was a Tuesday morning last March, in the meeting room at their Zurich office.");
    expect(d2.stage).toBe("probe");
    expect(d2.target).not.toBe("scene");

    const asked = new Set<string>([d1.target!, d2.target!]);
    let d = d2;
    let guard = 0;
    while (d.stage === "probe" && guard++ < 12) {
      d = s.say("Honestly the head of procurement just said the budget was gone and nobody had told us beforehand.");
      if (d.stage === "probe") {
        expect(asked.has(d.target!)).toBe(false); // never asks the same element twice
        asked.add(d.target!);
      }
    }
    expect(d.stage).toBe("photo");
    expect(isSingleQuestionStage(d.stage)).toBe(true);
  });

  it("asks a privacy question before the photo when people are involved", () => {
    const s = session("story");
    s.open();
    let d = s.say("My client, the CFO, told me in her office last Monday that we were fired. I felt sick. We had 40 people on it. I wanted to save the deal. That's when I realised. I learned to talk to the board.");
    const stages: string[] = [d.target ?? d.stage];
    let guard = 0;
    while (d.stage === "probe" && guard++ < 12) {
      d = s.say("Yes, she said it straight to my face in front of the whole team, in a cold voice.");
      stages.push(d.target ?? d.stage);
    }
    expect(stages).toContain("privacy");
    expect(d.stage).toBe("photo");
  });

  it("jumps to the photo when the user says they're done", () => {
    const s = session("story");
    s.open();
    s.say("Our first hire quit after one week.");
    expect(s.say("that's it").stage).toBe("photo");
  });

  it("asks for a caption after a photo, then wraps and offers another story", () => {
    const s = session("story");
    s.open();
    s.say("Our first hire quit after one week.");
    s.say("that's all");
    const cap = s.say("", { photos: ["ph_1"] });
    expect(cap.stage).toBe("photo-caption");
    const wrap = s.say("That's the empty desk the morning after.");
    expect(wrap.stage).toBe("wrap");
    expect(wrap.photoDeferred).toBe(false);

    // A new story starts a new thread with fresh coverage.
    const next = s.say("Another one: the day we doubled our price and nobody left.");
    expect(next.stage).toBe("probe");
    expect(s.state.threadStarts).toHaveLength(1);
    const threads = splitThreads(s.messages, s.state.threadStarts);
    expect(threads).toHaveLength(2);
    expect(storyCoverage(currentThread(s.messages, s.state), s.state).find((i) => i.key === "photo")?.status).toBe("missing");
  });

  it("records 'remind me later' and wraps without asking again", () => {
    const s = session("story");
    s.open();
    s.say("Our first hire quit after one week.");
    const photo = s.say("done");
    expect(photo.stage).toBe("photo");
    const wrap = s.say("No photo right now. Remind me later.", { intent: "photo-later" });
    expect(wrap.stage).toBe("wrap");
    expect(wrap.photoDeferred).toBe(true);
    expect(s.state.photoLater).toHaveLength(1);
    const cov = storyCoverage(currentThread(s.messages, s.state), s.state);
    expect(cov.find((i) => i.key === "photo")?.status).toBe("skipped");
  });

  it("closes instead of starting a new thread on an acknowledgement after the wrap", () => {
    const s = session("story");
    s.open();
    s.say("Our first hire quit after one week.");
    s.say("done");
    s.say("no photo", {});
    const close = s.say("ok thanks");
    expect(close.stage).toBe("closing");
    expect(s.state.threadStarts).toHaveLength(0);
  });

  it("asks for a specific instance after a generic answer, once", () => {
    const s = session("story");
    s.open();
    const d = s.say("Usually clients don't read the contract and then they complain about the invoice.");
    expect(d.generic).toBe(true);
    const d2 = s.say("Usually they just ignore it and most clients never really care about the details.");
    expect(d2.generic).toBeFalsy();
  });

  it("starts with a probe (and a hello) when the user already wrote their story", () => {
    const s = session("story");
    const d = s.say("The day our CTO quit in the middle of a launch.");
    expect(d.firstMessage).toBe(true);
    expect(d.stage).toBe("probe");
  });

  it("marks skipped elements and moves on", () => {
    const s = session("story");
    s.open();
    const d1 = s.say("We shipped the redesign and the numbers tanked.");
    const d2 = s.say("I don't remember");
    const cov = storyCoverage(currentThread(s.messages, s.state), s.state);
    expect(cov.find((i) => i.key === d1.target)?.status).toBe("skipped");
    expect(d2.target).not.toBe(d1.target);
  });
});

describe("positioning flow", () => {
  it("walks every area once, then wraps and closes", () => {
    const s = session("positioning");
    const open = s.open();
    expect(open.stage).toBe("opening");
    expect(open.target).toBe("goals");
    const seen = new Set<string>(["goals"]);
    let d = open;
    let guard = 0;
    while (guard++ < 20) {
      d = s.say("I want inbound from CFOs at mid-size Swiss companies who are curious about AI.");
      if (d.stage !== "pos-question") break;
      expect(seen.has(d.target!)).toBe(false);
      seen.add(d.target!);
    }
    expect(d.stage).toBe("pos-wrap");
    expect(seen.size).toBe(POSITIONING_AREAS.length);
    expect(depthScore(positioningCoverage(s.messages, s.state))).toBe(1);
    expect(s.say("thanks").stage).toBe("closing");
  });

  it("asks for an example after a very short answer", () => {
    const s = session("positioning");
    s.open();
    const d = s.say("More clients");
    expect(d.stage).toBe("pos-example");
    expect(d.target).toBe("goals");
    expect(s.say("Last month two CFOs asked me for a workshop after a talk.").stage).toBe("pos-question");
  });
});

describe("coverage scores", () => {
  it("scores depth with skipped items as half", () => {
    expect(
      depthScore([
        { key: "a", label: "A", hint: "", status: "covered" },
        { key: "b", label: "B", hint: "", status: "skipped" },
        { key: "c", label: "C", hint: "", status: "missing" },
        { key: "d", label: "D", hint: "", status: "missing" },
      ]),
    ).toBe(0.375);
  });

  it("maps coverage to a 1-5 strength ignoring the photo", () => {
    const all = (status: "covered" | "missing") =>
      ["scene", "people", "stakes", "turning", "details", "feelings", "lesson", "photo"].map((key) => ({ key, label: key, hint: "", status }));
    expect(strengthFromCoverage(all("covered"))).toBe(5);
    expect(strengthFromCoverage(all("missing"))).toBe(1);
  });

  it("uses the model check only for the thread it was made for", () => {
    const msgs: TranscriptMessage[] = [{ id: "u1", role: "user", content: "It went fine.", photoIds: [] }];
    const state: InterviewState = { ...EMPTY_STATE, llm: { threadStart: "u1", covered: ["stakes"], userTurns: 1 } };
    expect(storyCoverage(msgs, state).find((i) => i.key === "stakes")?.status).toBe("covered");
    const other: InterviewState = { ...state, llm: { threadStart: "u0", covered: ["stakes"], userTurns: 1 } };
    expect(storyCoverage(msgs, other).find((i) => i.key === "stakes")?.status).toBe("missing");
  });
});

describe("targeting", () => {
  const pillars = [
    { id: "p1", name: "AI in banks", weight: 50, storyPrompts: ["When did a bank client surprise you?"] },
    { id: "p2", name: "Switzerland", weight: 30, storyPrompts: [] },
  ];

  it("picks the pillar with the fewest ready memories", () => {
    const memories = [
      { pillar: "p2", status: "ready" },
      { pillar: "p1", status: "used" },
    ];
    expect(neediestPillar(pillars, memories)).toBe("p1");
    expect(neediestPillar([], [])).toBeNull();
  });

  it("uses the pillar's own prompts first, then the bank", () => {
    const plan = planStoryInterview({ pillars, memories: [], previousSeeds: [], rng: () => 0 });
    expect(plan).toMatchObject({ pillarId: "p1", seed: "When did a bank client surprise you?", source: "pillar" });
    const again = planStoryInterview({ pillars, memories: [], previousSeeds: [plan.seed], rng: () => 0 });
    expect(again.source).toBe("theme");
    expect(allStoryPrompts().some((p) => p.text === again.seed)).toBe(true);
  });

  it("respects an explicit pillar and theme", () => {
    const plan = planStoryInterview({ pillars, memories: [], previousSeeds: [], pillarId: "p2", themeId: "failures", rng: () => 0.99 });
    expect(plan.pillarId).toBe("p2");
    expect(STORY_THEMES.find((t) => t.id === "failures")!.prompts.some((p) => p.text === plan.seed)).toBe(true);
  });

  it("surprise me avoids used prompts", () => {
    const used = allStoryPrompts()
      .slice(1)
      .map((p) => p.text);
    expect(surprisePrompt(used, () => 0.5).seed).toBe(allStoryPrompts()[0].text);
  });
});
