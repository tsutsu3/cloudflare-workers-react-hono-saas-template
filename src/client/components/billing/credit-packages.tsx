import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Button } from "@/client/components/ui/button";
import { CREDIT_PACKAGES, FREE_MONTHLY_CREDITS } from "@/shared/constants";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/client/components/ui/dialog";
import { StripePaymentForm } from "./stripe-payment-form";
import { apiClient } from "@/client/lib/api-client";
import { Coins, Sparkles, Zap } from "lucide-react";
import { useSessionStore } from "@/client/state/session";
import { useTransactionStore } from "@/client/state/transaction";
import { Separator } from "@/client/components/ui/separator";
import { Badge } from "@/client/components/ui/badge";
import { Skeleton } from "@/client/components/ui/skeleton";
import { toast } from "sonner";
import { useConfigStore } from "@/client/state/config";

type CreditPackage = typeof CREDIT_PACKAGES[number];

export const getPackageIcon = (index: number) => {
  if (index === 2) return <Zap className="h-6 w-6 text-yellow-500" />;
  if (index === 1) return <Sparkles className="h-6 w-6 text-blue-500" />;
  return <Coins className="h-6 w-6 text-green-500" />;
};

// Calculate savings percentage compared to the first package
const calculateSavings = (pkg: CreditPackage) => {
  const basePackage = CREDIT_PACKAGES[0];
  const basePrice = basePackage.price / basePackage.credits;
  const currentPrice = pkg.price / pkg.credits;
  const savings = ((basePrice - currentPrice) / basePrice) * 100;
  return Math.round(savings);
};

export function CreditPackages() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const session = useSessionStore((state) => state);
  const fetchSession = useSessionStore((state) => state.fetchSession);
  const transactionsRefresh = useTransactionStore((state) => state.triggerRefresh);
  const config = useConfigStore((state) => state.config);
  const sessionIsLoading = session?.isLoading;

  const handlePurchase = async (pkg: CreditPackage) => {
    try {
      const response = await apiClient.post('/credits/payment-intent', {
        packageId: pkg.id,
      });
      setClientSecret(response.data.clientSecret);
      setSelectedPackage(pkg);
      setIsDialogOpen(true);
    } catch (error) {
      console.error("Error creating payment intent:", error);
      toast.error("Failed to start payment process");
    }
  };

  const handleSuccess = async () => {
    setIsDialogOpen(false);
    setSelectedPackage(null);
    setClientSecret(null);
    // Refresh session to get updated credits
    await fetchSession?.();
    transactionsRefresh();
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Credits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              {sessionIsLoading ? (
                <>
                  <Skeleton className="h-9 w-16" />
                  <Skeleton className="h-9 w-24" />
                </>
              ) : (
                <div className="text-3xl font-bold">
                  {session?.session?.user?.currentCredits?.toLocaleString() ?? 0} credits
                </div>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              You get {FREE_MONTHLY_CREDITS} free credits every month.
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-semibold">Top up your credits</h2>
              <p className="text-sm text-muted-foreground mt-2 sm:mt-3">
                Purchase additional credits to use our services. The more credits you buy, the better the value.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              {CREDIT_PACKAGES.map((pkg, index) => (
                <Card key={pkg.id} className="relative overflow-hidden transition-all hover:shadow-lg bg-muted dark:bg-background">
                  <CardContent className="flex flex-col h-full pt-4 gap-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {getPackageIcon(index)}
                        <div>
                          <div className="text-xl sm:text-2xl font-bold">
                            {pkg.credits.toLocaleString()}
                          </div>
                          <div className="text-xs sm:text-sm text-muted-foreground">
                            credits
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <div className="text-xl sm:text-2xl font-bold text-primary">
                          ${pkg.price}
                        </div>
                        <div className="text-xs sm:text-sm text-muted-foreground">
                          one-time payment
                        </div>
                        {index > 0 ? (
                          <Badge variant="secondary" className="mt-1 text-xs sm:text-sm bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                            Save {calculateSavings(pkg)}%
                          </Badge>
                        ) : (
                          <div className="h-[22px] sm:h-[26px]" /> /* Placeholder for badge height */
                        )}
                      </div>
                    </div>
                    <div className="flex-grow" />
                    <Button
                      onClick={() => {
                        if (config?.STRIPE_PUBLISHABLE_KEY) {
                          handlePurchase(pkg)
                        } else {
                          toast.error("Something went wrong with our payment provider. Please try again later.")
                        }
                      }}
                      className="w-full text-sm sm:text-base"
                    >
                      Purchase Now
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purchase Credits</DialogTitle>
          </DialogHeader>
          {(clientSecret && selectedPackage) && (
            <StripePaymentForm
              packageId={selectedPackage.id}
              clientSecret={clientSecret}
              onSuccess={handleSuccess}
              onCancel={() => setIsDialogOpen(false)}
              credits={selectedPackage.credits}
              price={selectedPackage.price}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
