import { Button } from "@/client/components/ui/button";
import { GITHUB_REPO_URL } from "@/shared/constants";
import { Link } from "@tanstack/react-router";
import ShinyButton from "@/client/components/ui/shiny-button";
import { Skeleton } from "@/client/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/client/lib/api-client";

export function Hero() {
  return (
    <div className="relative isolate pt-14 bg-secondary">
      <div className="pt-20 pb-24 sm:pt-20 sm:pb-32 lg:pb-40">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-10 flex justify-center gap-4 flex-wrap">
              <ShinyButton className="rounded-full bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                100% Free & Open Source
              </ShinyButton>
              <TotalUsersButton />
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl bg-gradient-to-r from-primary to-chart-1 bg-clip-text text-transparent">
              Production-Ready SaaS Template
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              A modern, open-source template for building SaaS applications with React 19,
              Hono, Cloudflare Workers, and everything you need to launch quickly.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-4 md:gap-x-6">
              <Button size="lg" className="rounded-full" asChild>
                <a href={GITHUB_REPO_URL} target="_blank">
                  View on GitHub
                </a>
              </Button>
              <Link to="/sign-in">
                <Button variant="outline" size="lg" className="rounded-full">
                  Try Demo
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Client-side component that fetches total users via API
function TotalUsersButton() {
  const { data: totalUsers, isLoading } = useQuery({
    queryKey: ['stats', 'totalUsers'],
    queryFn: async () => {
      try {
        const response = await apiClient.get('/stats/total-users');
        return (response.data.totalUsers as number) ?? null;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return <TotalUsersButtonSkeleton />;
  }

  if (!totalUsers) return null;

  return (
    <ShinyButton className="rounded-full bg-chart-1/10 text-chart-1 ring-1 ring-inset ring-chart-1/20">
      {totalUsers} Users & Growing
    </ShinyButton>
  );
}

// Skeleton fallback for the TotalUsersButton
function TotalUsersButtonSkeleton() {
  return (
    <div className="rounded-full bg-chart-1/10 ring-1 ring-inset ring-chart-1/20 px-4 py-1.5 text-sm font-medium">
      <Skeleton className="w-32 h-5" />
    </div>
  );
}
