import { redirect } from "next/navigation";

/** /memories/<id> is a shareable link to one story: open it on top of the Memory Bank. */
export default async function MemoryLink({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/memories?open=${encodeURIComponent(id)}`);
}
