import { useState } from "react";
import { useProject } from "@/contexts/ProjectContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Plus, Check } from "lucide-react";

export function ProjectsPage() {
  const { projects, selectedProject, selectProject, createProject } = useProject();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [projectNumber, setProjectNumber] = useState("");
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");

  const handleCreate = async () => {
    if (!name.trim() || !projectNumber.trim()) return;
    await createProject({
      name: name.trim(),
      project_number: projectNumber.trim(),
      client: client.trim() || undefined,
      description: description.trim() || undefined,
    });
    setName("");
    setProjectNumber("");
    setClient("");
    setDescription("");
    setOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Project</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Project Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Project"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="number">Project Number</Label>
                <Input
                  id="number"
                  value={projectNumber}
                  onChange={(e) => setProjectNumber(e.target.value)}
                  placeholder="PRJ-001"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="client">Client</Label>
                <Input
                  id="client"
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="desc">Description</Label>
                <Input
                  id="desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                onClick={handleCreate}
                disabled={!name.trim() || !projectNumber.trim()}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-muted-foreground">No projects yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first project to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((project) => {
            const isSelected = selectedProject?.id === project.id;
            return (
              <button
                key={project.id}
                onClick={() => selectProject(project.id)}
                className={`flex items-center justify-between rounded-lg border p-4 text-left transition-colors hover:bg-accent ${
                  isSelected ? "border-primary bg-accent" : ""
                }`}
              >
                <div>
                  <div className="font-medium">{project.name}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {project.project_number}
                    {project.client && ` · ${project.client}`}
                  </div>
                  {project.description && (
                    <div className="mt-1 text-sm text-muted-foreground">
                      {project.description}
                    </div>
                  )}
                </div>
                {isSelected && <Check className="h-5 w-5 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
