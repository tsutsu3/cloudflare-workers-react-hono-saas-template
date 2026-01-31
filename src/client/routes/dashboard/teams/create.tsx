import { createFileRoute } from '@tanstack/react-router';
import { CreateTeamForm } from "@/client/components/teams/create-team-form";
import { PageHeader } from "@/client/components/page-header";

export const Route = createFileRoute('/dashboard/teams/create')({
  component: CreateTeamPage,
});

function CreateTeamPage() {
  return (
    <>
      <PageHeader
        items={[
          {
            href: "/dashboard/teams",
            label: "Teams"
          },
          {
            href: "/dashboard/teams/create",
            label: "Create Team"
          }
        ]}
      />
      <div className="container mx-auto px-5 pb-12">
        <div className="max-w-xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mt-4">Create a new team</h1>
            <p className="text-muted-foreground mt-2">
              Create a team to collaborate with others on projects and share resources.
            </p>
          </div>

          <div className="border rounded-lg p-6 bg-card">
            <CreateTeamForm />
          </div>
        </div>
      </div>
    </>
  );
}

export default CreateTeamPage;
