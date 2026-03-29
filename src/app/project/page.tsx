import { Suspense } from "react";

import { ProjectDetailEntry } from "@/components/project-detail-entry";

export default function ProjectPage() {
  return (
    <Suspense fallback={null}>
      <ProjectDetailEntry />
    </Suspense>
  );
}
