import { Button } from "@/client/components/ui/button"
import { Link } from "@tanstack/react-router";
import { useConfigStore } from "@/client/state/config";
import Google from "@/client/icons/google";
import { Skeleton } from "@/client/components/ui/skeleton";

export default function SSOButtons({
  isSignIn = false
}: {
  isSignIn?: boolean
}) {
  const { isGoogleSSOEnabled } = useConfigStore()

  if (isGoogleSSOEnabled === null) {
    return (
      <Skeleton className="w-full h-[44px]" />
    )
  }

  return (
    <>
      {isGoogleSSOEnabled && (
        <>
          <Button className="w-full" asChild size='lg'>
            <Link to="/sso/google">
              <Google className="w-[22px] h-[22px] mr-1" />
              {isSignIn ? "Sign in with Google" : "Sign up with Google"}
            </Link>
          </Button>
        </>
      )}
    </>
  )
}
