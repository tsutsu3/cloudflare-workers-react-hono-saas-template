import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from "@/client/components/page-header";
import { TransactionHistory } from "@/client/components/billing/transaction-history";
import { CreditPackages } from "@/client/components/billing/credit-packages";
import { DISABLE_CREDIT_BILLING_SYSTEM } from "@/shared/constants";
import { CreditSystemDisabled } from "@/client/components/billing/credit-system-disabled";

export const Route = createFileRoute('/dashboard/billing')({
  component: BillingPage,
});

function BillingPage() {
  return (
    <>
      <PageHeader
        items={[
          {
            href: "/dashboard",
            label: "Dashboard"
          },
          {
            href: "/dashboard/billing",
            label: "Billing"
          }
        ]}
      />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {DISABLE_CREDIT_BILLING_SYSTEM ? (
          <CreditSystemDisabled />
        ) : (
          <>
            <CreditPackages />
            <div className="mt-4">
              <TransactionHistory />
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default BillingPage;
