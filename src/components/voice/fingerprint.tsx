"use client";

import type { ReactNode } from "react";
import { AlignLeft, Hash, ListOrdered, MessageCircle, Minus, Pilcrow, Ruler, Smile, Type, User, Zap, ScanText } from "lucide-react";
import { Chip, Meter, cx } from "@/components/ui";
import type { VoiceStats } from "@/lib/types";
import { CLOSER_LABEL, CLOSER_TYPES, OPENER_LABEL, OPENER_TYPES } from "@/lib/voice/text";
import { MIN_POSTS_FOR_ANALYSIS, type VoiceExtras } from "@/lib/voice/types";
import { fmtNum, fmtPct } from "./format";

/** LinkedIn's "…see more" cut: about 140 characters on phones, 210 on desktop. */
const FOLD_MOBILE = 140;
const FOLD_DESKTOP = 210;

function Tile({ icon, label, value, unit, note, children }: { icon: ReactNode; label: string; value: ReactNode; unit?: string; note?: ReactNode; children?: ReactNode }) {
  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2 t-footnote font-medium text-label-2">
        <span className="grid size-6 place-items-center rounded-full bg-fill-3 text-label-2 [&>svg]:size-3.5">{icon}</span>
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[26px] font-bold leading-8 tracking-tight tabular-nums">{value}</span>
        {unit && <span className="t-footnote text-label-2">{unit}</span>}
      </div>
      {children}
      {note && <div className="t-caption text-label-2">{note}</div>}
    </div>
  );
}

/** A 0..max track with a highlighted range and a tick for the median. */
function RangeBar({ from, to, mark, max }: { from: number; to: number; mark: number; max: number }) {
  const p = (n: number) => `${Math.max(0, Math.min(100, (n / max) * 100))}%`;
  return (
    <div className="relative h-1.5 rounded-full bg-fill-3" aria-hidden>
      <span className="absolute inset-y-0 rounded-full bg-accent/45" style={{ left: p(from), width: `calc(${p(to)} - ${p(from)})` }} />
      <span className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-accent" style={{ left: p(mark) }} />
    </div>
  );
}

/** Hook length against LinkedIn's phone and desktop folds. */
function FoldBar({ chars }: { chars: number }) {
  const max = 280;
  const p = (n: number) => `${Math.min(100, (n / max) * 100)}%`;
  const color = chars <= FOLD_MOBILE ? "var(--sys-green)" : chars <= FOLD_DESKTOP ? "var(--sys-orange)" : "var(--sys-red)";
  return (
    <div className="relative h-1.5 rounded-full bg-fill-3" aria-hidden>
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: p(chars), background: color }} />
      {[FOLD_MOBILE, FOLD_DESKTOP].map((f) => (
        <span key={f} className="absolute -top-1 h-3.5 w-px bg-label-3" style={{ left: p(f) }} />
      ))}
    </div>
  );
}

function Distribution<T extends string>({ title, keys, labels, values, tone }: { title: string; keys: readonly T[]; labels: Record<T, string>; values: Record<T, number>; tone: string }) {
  const rows = keys.map((k) => ({ k, v: values[k] ?? 0 })).sort((a, b) => b.v - a.v);
  return (
    <div className="card space-y-3 p-5">
      <div className="t-headline">{title}</div>
      <ul className="space-y-2.5">
        {rows.map(({ k, v }) => (
          <li key={k} className={cx("grid grid-cols-[minmax(0,1fr)_88px_40px] items-center gap-3", v === 0 && "opacity-45")}>
            <span className="t-subhead truncate">{labels[k]}</span>
            <Meter value={v} color={`var(--sys-${tone})`} />
            <span className="t-footnote text-right tabular-nums text-label-2">{fmtPct(v)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PhraseGroup({ title, items, empty, hint }: { title: string; items: string[]; empty: string; hint?: string }) {
  return (
    <div className="space-y-2">
      <div className="t-footnote font-semibold text-label-2">{title}</div>
      {items.length ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((p) => (
            <Chip key={p} tone="indigo" className="!h-auto min-h-6 whitespace-normal py-0.5">
              {p}
            </Chip>
          ))}
        </div>
      ) : (
        <p className="t-footnote text-label-3">{empty}</p>
      )}
      {hint && items.length > 0 && <p className="t-caption text-label-3">{hint}</p>}
    </div>
  );
}

export function Fingerprint({ stats, extras, ownCount }: { stats: VoiceStats | null; extras: VoiceExtras | null; ownCount: number }) {
  if (!stats || !extras) {
    const need = Math.max(0, MIN_POSTS_FOR_ANALYSIS - ownCount);
    return (
      <section className="space-y-3">
        <h2 className="t-title-3 px-1">Fingerprint</h2>
        <div className="card space-y-3 p-5">
          <p className="t-subhead">
            {need > 0 ? `Add ${need} more ${need === 1 ? "post" : "posts"} and we'll measure how you write.` : "Measuring your posts…"}
          </p>
          <Meter value={ownCount / MIN_POSTS_FOR_ANALYSIS} />
          <p className="t-footnote text-label-2">Length, rhythm, how you open and close, lists, emojis, hashtags. Ten or more posts give a reliable picture.</p>
        </div>
      </section>
    );
  }

  const hookNote = stats.avgHookChars <= FOLD_MOBILE ? "Lands before “see more” on phones." : stats.avgHookChars <= FOLD_DESKTOP ? "Cut on phones, fits on desktop." : "Usually cut before it lands.";
  const varied = stats.avgSentenceWords > 0 && extras.sentenceWordsSd / stats.avgSentenceWords >= 0.55;
  const listKind = extras.numberedListRatio >= extras.bulletListRatio ? "numbered" : "bulleted";
  const listItems = extras.listItemsMax ? `${extras.listItemsMin === extras.listItemsMax ? extras.listItemsMin : `${extras.listItemsMin}-${extras.listItemsMax}`} items` : "";

  return (
    <section className="space-y-4">
      <div className="px-1">
        <h2 className="t-title-3">Fingerprint</h2>
        <p className="t-footnote mt-0.5 text-label-2">
          Measured from {stats.sampleCount} of your posts. The writer follows these numbers and the checker flags drafts that drift from them.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Tile icon={<Ruler />} label="Length" value={Math.round(stats.medianWords)} unit="words" note={extras.wordsP75 > extras.wordsP25 ? `Most posts ${extras.wordsP25}-${extras.wordsP75}` : "Typical post"}>
          <RangeBar from={extras.wordsP25} to={extras.wordsP75} mark={stats.medianWords} max={Math.max(400, extras.wordsP75 * 1.25)} />
        </Tile>
        <Tile icon={<Type />} label="Sentences" value={fmtNum(stats.avgSentenceWords)} unit="words" note={varied ? "Varied rhythm: short and long" : "Even rhythm"} />
        <Tile icon={<Zap />} label="First line" value={stats.avgHookChars} unit="chars" note={hookNote}>
          <FoldBar chars={stats.avgHookChars} />
        </Tile>
        <Tile icon={<AlignLeft />} label="Paragraphs" value={fmtNum(extras.paragraphsPerPost)} unit="per post" note={`${fmtNum(stats.avgParagraphLines)} lines each on average`} />
        <Tile icon={<Pilcrow />} label="One-liners" value={fmtPct(stats.oneLineParagraphRatio)} note="Paragraphs that are one sentence">
          <Meter value={stats.oneLineParagraphRatio} />
        </Tile>
        <Tile icon={<ListOrdered />} label="Lists" value={fmtPct(stats.bulletRatio)} unit="of posts" note={stats.bulletRatio > 0 ? `Mostly ${listKind}${listItems ? `, ${listItems}` : ""}` : "You write in paragraphs"}>
          <Meter value={stats.bulletRatio} color="var(--sys-indigo)" />
        </Tile>
        <Tile icon={<MessageCircle />} label="Ends on a question" value={fmtPct(extras.closerTypes.question)} unit="of posts" note={`A question anywhere in ${fmtPct(stats.questionRatio)}`}>
          <Meter value={extras.closerTypes.question} color="var(--sys-teal)" />
        </Tile>
        <Tile icon={<User />} label="First person" value={fmtPct(stats.firstPersonRatio)} unit="of sentences" note="Sentences with I, me or my">
          <Meter value={stats.firstPersonRatio} color="var(--sys-purple)" />
        </Tile>
        <Tile icon={<Smile />} label="Emojis" value={fmtNum(stats.emojiPerPost)} unit="per post" note={stats.topEmojis.length ? `Mostly ${stats.topEmojis.slice(0, 4).join(" ")}` : "None. The writer won't add any."} />
        <Tile icon={<Hash />} label="Hashtags" value={fmtNum(stats.hashtagsPerPost)} unit="per post" note={stats.hashtagsPerPost < 0.15 ? "None. The writer won't add any." : "Kept at the end"} />
        <Tile icon={<Minus />} label="Em dashes" value={fmtNum(stats.emDashPerPost)} unit="per post" note={stats.emDashPerPost < 0.1 ? (extras.spacedHyphenPerPost >= 0.3 ? "None. You use a plain - instead." : "None. Good: they read as AI.") : "Drafts may use them at your rate."} />
        <Tile icon={<ScanText />} label="Exclamations" value={fmtNum(stats.exclamationPerPost)} unit="per post" note={stats.exclamationPerPost < 0.25 ? "Calm. Almost never." : "Part of your energy."} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Distribution title="How you open" keys={OPENER_TYPES} labels={OPENER_LABEL} values={extras.openerTypes} tone="blue" />
        <Distribution title="How you end" keys={CLOSER_TYPES} labels={CLOSER_LABEL} values={extras.closerTypes} tone="green" />
      </div>

      <div className="card grid gap-5 p-5 sm:grid-cols-2">
        <PhraseGroup title="Phrases that are yours" items={stats.signaturePhrases} empty="No repeated phrases yet. More posts help." hint="The writer may use one where it fits, and the checker won't flag them." />
        <PhraseGroup title="Openers you reuse" items={stats.commonOpeners} empty="You start every post differently." />
        <PhraseGroup title="Closers you reuse" items={stats.commonClosers} empty="You end every post differently." />
        <PhraseGroup title="Emojis you use" items={stats.topEmojis} empty="None." />
      </div>
    </section>
  );
}
