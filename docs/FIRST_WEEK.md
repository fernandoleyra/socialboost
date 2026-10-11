# Your first week with SocialBoost

A practical path from install to your first approved posts, plus the things worth checking on your own
data and hardware (some LinkedIn exports and screens couldn't be verified without a real account).

## Day 1 — set up (30 minutes)

1. Install the [Ollama](https://ollama.com) app and pull the models for your machine (see the table in the README).
   On a Mac with 32 GB or more (Pro preset, ~19 GB download):
   ```bash
   ollama pull muse-glimmer:30b
   ollama pull qwen3-embedding:0.6b
   ```
   16 GB: `gemma4:12b` + `embeddinggemma`. 8 GB: `qwen3.5:4b` + `embeddinggemma`.
   The welcome screen detects your memory and offers the matching preset in one click.
2. `npm install && npm run build && npm start`, open http://localhost:3000.
3. Welcome screen: your name, headline, LinkedIn URL, the language you post in, your timezone.
4. **Model check** on the same screen: everything should be green. If not, it shows the exact `ollama pull` to run.
5. Run the **positioning interview** (10–15 minutes). Answer like you'd talk to a smart friend; short is fine.
   Finish → check **Strategy**: positioning line, audience, 3–4 pillars, cadence. Edit anything that isn't you.

## Day 2 — teach it how you write (15 minutes)

In **Voice**, import your past posts — 10 or more works best:

- **Paste** a few posts (separate them with a line containing `---`), or
- **LinkedIn export**: Settings & Privacy → Data privacy → Download your data → request the archive →
  upload `Shares.csv` when the email arrives (up to 48 h), or
- **EU / Switzerland**: the *From LinkedIn* tab imports your posts with LinkedIn's official data-portability API
  (one-time token, not stored).

Then **Analyze my voice**. Read the style guide and fix anything wrong; add "Things I'd never say".

## Days 2–5 — collect stories (10 minutes a day)

- **Story interviews** (Interviews → Start a story interview). The app picks the pillar that needs stories most.
  Expect follow-ups about the moment: where, who, what was said, numbers, what changed.
- At the end it **asks for a photo** — the place, the people, a whiteboard, a screenshot. A quick phone photo beats
  anything posed. No photo yet? Tap "Remind me later"; the story stays flagged in the Memory Bank.
- On busy days use **Today → "What made today different?"** for a one-line capture.

Aim for 6 ready stories (two weeks of posts at 3 a week).

## Day 5 — plan and draft

1. **Calendar → Auto-plan** (preview first) fills your open slots with stories by pillar mix.
2. **Draft all** writes first drafts for the planned posts (on a laptop this takes a few minutes per post).
3. **Studio**: open each draft. Fix what the checks flag, use the quick revisions, pick or change the photo,
   **Approve**, and confirm the date.

## Publishing

Copy-and-share always works; the LinkedIn API is optional on top of it.

- **Copy and share** (default, no setup): on the day, the post shows as *Due*. *Open LinkedIn* opens the composer with
  the text filled in (and copied, in case LinkedIn ignores it); *Photo* downloads the picture to attach. Post it, then
  paste the post link back so Insights can track it. Studio has the same *Copy & open LinkedIn* in its menu.
- **LinkedIn API** (Settings → LinkedIn, optional): approved, scheduled posts go out at their time. If a publish fails,
  the laptop was asleep, or the 60-day token expired, the post falls back to *Due* with copy-and-share, so nothing is
  lost. If LinkedIn didn't confirm a publish (it may already be live), the post shows *Check LinkedIn* first so you
  never post twice. The app warns you before the token expires.

## After two weeks

Add each post's numbers in **Insights** (or import a CSV). Once 5+ posts have numbers, apply the suggested pillar
weights so the next plan leans into what works.

---

## Please check these on your real setup (and tell us what you see)

These depend on your account, files or hardware, so they were built to the documentation but not yet confirmed:

| # | Check | What to report |
|---|---|---|
| 1 | Upload your real `Shares.csv` | Did all your posts import? Any rows skipped that shouldn't be? |
| 2 | EU/CH: *From LinkedIn* import with a data-portability token | Did it find your posts? Any error message? |
| 3 | Connect LinkedIn and publish one approved post with a photo | Did it appear on your profile, with the photo? |
| 4 | Upload an iPhone photo (HEIC) from Safari and from Chrome | Did both upload? |
| 5 | Voice answers with the mic button | Did transcription work, and in which language? |
| 6 | Your model and machine | Which preset did you use, and how long did a draft take? |
| 7 | Draft quality | Pick 3 drafts: what did you have to change most? (tone, facts, length, opening) |
| 8 | Insights CSV import | If you export analytics from LinkedIn, did the columns match? |
