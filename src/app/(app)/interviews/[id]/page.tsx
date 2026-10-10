import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InterviewChat } from "@/components/interview/interview-chat";
import { HttpError } from "@/lib/http";
import { loadInterviewView } from "@/lib/interview/service";
import { getActiveProfile, getInterview, requireProfile } from "@/lib/repo";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const profile = getActiveProfile();
  const interview = getInterview(id);
  const title = interview && profile && interview.profileId === profile.id ? interview.title || "Interview" : "Interview";
  return { title: `${title} — SocialBoost` };
}

export default async function InterviewPage({ params }: { params: Params }) {
  const { id } = await params;
  const profile = requireProfile();
  let view;
  try {
    view = loadInterviewView(profile, id);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) notFound();
    throw err;
  }
  return <InterviewChat key={view.interview.id} initial={view} timeZone={profile.timezone} />;
}
