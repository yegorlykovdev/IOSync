import { useProject } from "@/contexts/ProjectContext";

export function PlaceholderPage({ title }: { title: string }) {
  const { selectedProject } = useProject();

  if (!selectedProject) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p className="text-lg text-muted-foreground">Select a project</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Go to Projects and select one to continue.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-muted-foreground">
        {title} for {selectedProject.name}
      </p>
    </div>
  );
}
