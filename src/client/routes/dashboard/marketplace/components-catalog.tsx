import { Boxes } from "lucide-react"
import { TeamSwitcher } from "@/client/components/team-switcher"
import ThemeSwitch from "@/client/components/theme-switch"
import SeparatorWithText from "@/client/components/separator-with-text"
import { NavUser } from "@/client/components/nav-user"
import { Button } from "@/client/components/ui/button"
import { PageHeader } from "@/client/components/page-header"
import { type ComponentProps } from "react"

interface MarketplaceComponent {
  id: string
  name: string
  description: string
  credits: number
  containerClass?: string
  preview: () => React.ReactNode
}

type Team = ComponentProps<typeof TeamSwitcher>['teams'][number];

const demoTeams: Team[] = [
  {
    id: "acme-inc",
    name: "Acme Inc",
    logo: Boxes,
    role: "admin",
  },
  {
    id: "monsters-inc",
    name: "Monsters Inc",
    logo: Boxes,
    role: "member",
  },
]

export const COMPONENTS: MarketplaceComponent[] = [
  {
    id: "team-switcher",
    name: "Team Switcher",
    description: "A sleek dropdown menu for switching between teams with custom logos and plans",
    credits: 4,
    containerClass: "w-[300px]",
    preview: () => {
      const teams = demoTeams.map(team => ({
        ...team,
        logo: Boxes,
      }))
      return <TeamSwitcher teams={teams} />
    },
  },
  {
    id: "theme-switch",
    name: "Theme Switch",
    description: "An animated theme switcher with system, light, and dark mode options",
    credits: 4,
    preview: () => <ThemeSwitch />,
  },
  {
    id: "separator-with-text",
    name: "Separator With Text",
    description: "A clean separator component with customizable text and styling",
    credits: 3,
    containerClass: "w-full",
    preview: () => (
      <SeparatorWithText>
        <span className="text-muted-foreground">OR</span>
      </SeparatorWithText>
    ),
  },
  {
    id: "nav-user",
    name: "User Navigation Dropdown",
    description: "A professional user navigation dropdown with avatar, user info, and action items",
    credits: 10,
    containerClass: "w-[300px]",
    preview: () => <NavUser />,
  },
  {
    id: "page-header",
    name: "Page Header with Breadcrumbs",
    description: "A responsive page header with collapsible sidebar trigger and breadcrumb navigation",
    credits: 12,
    containerClass: "w-full",
    preview: () => (
      <PageHeader
        items={[
          { href: "/dashboard", label: "Dashboard" },
          { href: "/dashboard/settings", label: "Settings" },
        ]}
      />
    ),
  },
  {
    id: 'button',
    name: "Button",
    description: "A button component with customizable text and styling",
    credits: 8,
    containerClass: "w-full flex justify-center",
    preview: () => <Button>Click me</Button>,
  }
]
