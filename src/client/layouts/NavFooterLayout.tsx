import { Footer } from '@/client/components/footer';
import { Navigation } from '@/client/components/navigation';

interface NavFooterLayoutProps {
  children: React.ReactNode;
  renderFooter?: boolean;
}

export default function NavFooterLayout({
  children,
  renderFooter = true,
}: NavFooterLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1">
        {children}
      </main>
      {renderFooter && <Footer />}
    </div>
  );
}
