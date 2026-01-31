import { lazy, Suspense, type ComponentProps } from 'react';
import { FormMessage } from './ui/form';
import { useConfigStore } from '@/client/state/config';

const Turnstile = lazy(() => import('@marsidev/react-turnstile').then(mod => ({ default: mod.Turnstile })));

type Props = Omit<ComponentProps<typeof Turnstile>, 'siteKey'> & {
  validationError?: string
}

export const Captcha = ({
  validationError,
  ...props
}: Props) => {
  const { isTurnstileEnabled } = useConfigStore()

  return (
    isTurnstileEnabled ? (
      <>
        <Suspense fallback={<div className="h-[65px]" />}>
          <Turnstile
            options={{
              size: 'flexible',
              language: 'auto',
            }}
            {...props}
            siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || ''}
          />
        </Suspense>

        {validationError && (
          <FormMessage className="text-red-500 mt-2">
            {validationError}
          </FormMessage>
        )}
      </>
    ) : null
  )
}
