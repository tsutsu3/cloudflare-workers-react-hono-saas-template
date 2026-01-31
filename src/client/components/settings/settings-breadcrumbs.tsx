import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/client/components/ui/breadcrumb";
import { useLocation } from "@tanstack/react-router";
import { capitalize } from "@/shared/text";

export function SettingsBreadcrumbs() {
  const location = useLocation();
  const pathname = location.pathname;

  // Extract the segment after /settings/
  const segments = pathname.split('/').filter(Boolean);
  const segment = segments.length > 1 ? segments[1] : null;
  const pageTitle = segment ? capitalize(segment.replace(/-/g, ' ')) : 'Overview';

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">
          <BreadcrumbLink href="/settings">Settings</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden md:block" />
        <BreadcrumbItem>
          <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
