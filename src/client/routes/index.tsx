import { createFileRoute } from '@tanstack/react-router';
import { Hero } from '@/client/components/landing/hero';
import { Features } from '@/client/components/landing/features';
import { FAQ } from '@/client/components/landing/faq';
import NavFooterLayout from '@/client/layouts/NavFooterLayout';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <NavFooterLayout>
      <main>
        <Hero />
        <Features />
        <FAQ />
      </main>
    </NavFooterLayout>
  );
}
