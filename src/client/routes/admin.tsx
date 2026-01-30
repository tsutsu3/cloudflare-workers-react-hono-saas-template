import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AdminSidebar } from "@/client/components/admin/admin-sidebar";
import {
  SidebarInset,
  SidebarProvider,
} from "@/client/components/ui/sidebar";
import { apiClient } from "@/client/lib/api-client";

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    try {
      const response = await apiClient.get('/auth/session');
      const session = response.data?.session;

      if (!session) {
        throw redirect({ to: '/sign-in' });
      }

      // Check if user is admin
      if (!session.user?.isAdmin) {
        throw redirect({ to: '/' });
      }
    } catch (error: any) {
      if (error?.to) {
        throw error;
      }
      throw redirect({ to: '/' });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <SidebarProvider>
      <AdminSidebar />
      <SidebarInset className="w-full flex flex-col">
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}

export default AdminLayout;
