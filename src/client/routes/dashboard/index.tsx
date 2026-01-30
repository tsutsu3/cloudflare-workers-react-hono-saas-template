import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from "@/client/components/page-header";

export const Route = createFileRoute('/dashboard/')({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <>
      <PageHeader
        items={[
          {
            href: "/dashboard",
            label: "Dashboard"
          }
        ]}
      />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="grid auto-rows-min gap-4 md:grid-cols-3">
          <div className="aspect-video rounded-xl bg-muted/50 flex items-center justify-center">
            Example
          </div>
          <div className="aspect-video rounded-xl bg-muted/50 flex items-center justify-center">
            Example
          </div>
          <div className="aspect-video rounded-xl bg-muted/50 flex items-center justify-center">
            Example
          </div>
        </div>
        <div className="min-h-[100vh] flex-1 rounded-xl bg-muted/50 md:min-h-min flex items-center justify-center">
          Example
        </div>
      </div>
    </>
  );
}

export default DashboardPage;
