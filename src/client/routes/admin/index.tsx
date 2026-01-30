import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from "@/client/components/page-header";
import { UsersTable } from "@/client/components/admin/users-table";

export const Route = createFileRoute('/admin/')({
  component: AdminPage,
});

function AdminPage() {
  return (
    <>
      <PageHeader items={[{ href: "/admin", label: "Admin" }]} />
      <UsersTable />
    </>
  );
}

export default AdminPage;
