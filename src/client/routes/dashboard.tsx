import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppSidebar } from "@/client/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
} from "@/client/components/ui/sidebar";
import { apiClient } from "@/client/lib/api-client";

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async () => {
    try {
      const response = await apiClient.get('/auth/session');
      if (!response.data?.session) {
        throw redirect({ to: '/sign-in' });
      }
    } catch (error: any) {
      if (error?.to === '/sign-in') {
        throw error;
      }
      throw redirect({ to: '/sign-in' });
    }
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}

export default DashboardLayout;
