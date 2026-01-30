import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppSidebar } from "@/client/components/app-sidebar";
import { Separator } from "@/client/components/ui/separator";
import { SettingsNav } from "@/client/components/settings/settings-nav";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/client/components/ui/sidebar";
import { SettingsBreadcrumbs } from "@/client/components/settings/settings-breadcrumbs";
import { apiClient } from "@/client/lib/api-client";

export const Route = createFileRoute('/settings')({
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
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="w-full flex flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <SettingsBreadcrumbs />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="flex flex-col space-y-6 px-4 md:px-6 lg:px-8">
            <SettingsNav />
            <div className="w-full">
              <Outlet />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default SettingsLayout;
