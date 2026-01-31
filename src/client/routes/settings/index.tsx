import { createFileRoute } from '@tanstack/react-router';
import { SettingsForm } from "@/client/components/settings/settings-form";

export const Route = createFileRoute('/settings/')({
  component: ProfileSettingsPage,
});

function ProfileSettingsPage() {
  return (
    <div className="container max-w-4xl space-y-8">
      <SettingsForm />
    </div>
  );
}

export default ProfileSettingsPage;
