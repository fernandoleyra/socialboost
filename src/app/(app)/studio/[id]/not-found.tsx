import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { EmptyState } from "@/components/ui";

export default function PostNotFound() {
  return (
    <div className="pt-6">
      <EmptyState
        icon={<FileQuestion />}
        title="This post isn't here"
        body="It may have been deleted, or it belongs to another person you ghostwrite for. Switch profiles in the sidebar, or go back to the Studio."
        action={
          <Link href="/studio" className="btn btn-primary">
            Back to the Studio
          </Link>
        }
      />
    </div>
  );
}
