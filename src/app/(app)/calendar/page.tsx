import { redirect } from "next/navigation";
import { getActiveProfile } from "@/lib/repo";
import { getCalendarData } from "@/lib/calendar/service";
import { dayKeyOf, safeTimezone } from "@/lib/calendar/time";
import { viewRange } from "@/lib/calendar/view";
import { CalendarBoard } from "@/components/calendar/calendar-board";

export const dynamic = "force-dynamic";

export const metadata = { title: "Calendar · SocialBoost" };

export default function CalendarPage() {
  const profile = getActiveProfile();
  if (!profile) redirect("/welcome");
  const now = new Date();
  const today = dayKeyOf(now, safeTimezone(profile.timezone));
  const initial = getCalendarData(profile, viewRange("month", today), now);
  return <CalendarBoard initial={initial} initialView="month" profile={{ name: profile.name, headline: profile.headline }} />;
}
