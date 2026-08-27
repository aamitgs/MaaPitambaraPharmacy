import { getDashboardData } from "@/lib/actions/dashboard";
import { getBranding } from "@/lib/branding";
import { CounterPanel } from "@/components/dashboard/counter-panel";
import { LiveDashboard } from "@/components/dashboard/live-dashboard";
import { TopBarPortal } from "@/components/topbar-portal";

export default async function DashboardPage() {
  const [data, branding] = await Promise.all([getDashboardData(), getBranding()]);

  return (
    <div className="space-y-4 p-6">
      {/* No page header row: the pharmacy name is already in the sidebar and
          the date is already in the top bar's clock. Only the one control
          that was unique here moves up into the shared row. */}
      <TopBarPortal>
        <CounterPanel hours={branding.hours} />
      </TopBarPortal>

      <LiveDashboard initialData={data} />
    </div>
  );
}
