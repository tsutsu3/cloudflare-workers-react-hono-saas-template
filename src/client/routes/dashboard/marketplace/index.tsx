import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from "@/client/components/page-header";
import { Alert } from "@heroui/react";
import { COMPONENTS } from "./components-catalog";
import { MarketplaceCard } from "@/client/components/marketplace-card";
import { DISABLE_CREDIT_BILLING_SYSTEM } from "@/shared/constants";
import { CreditSystemDisabled } from "@/client/components/credit-system-disabled";
import { apiClient } from "@/client/lib/api-client";
import { useSessionStore } from "@/client/state/session";
import { Skeleton } from "@/client/components/ui/skeleton";

export const Route = createFileRoute('/dashboard/marketplace/')({
  component: MarketplacePage,
});

function MarketplacePage() {
  const { session } = useSessionStore();

  const { data, isLoading } = useQuery({
    queryKey: ['marketplace', 'purchased-items'],
    queryFn: async () => {
      const response = await apiClient.get('/marketplace/purchased-items');
      return response.data as { purchasedItems: string[] };
    },
    enabled: !!session?.user,
  });

  const purchasedItems = new Set(data?.purchasedItems || []);

  return (
    <>
      <PageHeader
        items={[
          {
            href: "/dashboard",
            label: "Dashboard"
          },
          {
            href: "/dashboard/marketplace",
            label: "Marketplace"
          }
        ]}
      />
      <div className="container mx-auto px-5 pb-12">
        {DISABLE_CREDIT_BILLING_SYSTEM ? (
          <CreditSystemDisabled />
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-4xl font-bold mt-4">Component Marketplace</h1>
              <p className="text-muted-foreground mt-2">
                Purchase and use our premium components using your credits
              </p>
            </div>

            <Alert
              color="warning"
              title="Demo Template Feature"
              description="This marketplace page demonstrates how to implement a credit-based billing system in your SaaS application. Feel free to use this as a starting point and customize it for your specific needs."
              className="mb-6"
            />

            {isLoading ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-[400px] w-full" />
                ))}
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {COMPONENTS.map((component) => (
                  <MarketplaceCard
                    key={component.id}
                    id={component.id}
                    name={component.name}
                    description={component.description}
                    credits={component.credits}
                    containerClass={component.containerClass}
                    isPurchased={purchasedItems.has(`COMPONENT:${component.id}`)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default MarketplacePage;
