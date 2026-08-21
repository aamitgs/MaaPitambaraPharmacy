import { auth } from "@/auth";
import { canEditItemMaster, canManageCompliance } from "@/lib/rbac";
import { getBackupStatus } from "@/lib/actions/backup";
import { getLicenseExpiryWindow } from "@/lib/actions/branch-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackupPanel } from "@/components/settings/backup-panel";
import { ImportPanel } from "@/components/settings/import-panel";
import { PartyImportPanel } from "@/components/settings/party-import-panel";
import { ExportPanel } from "@/components/settings/export-panel";
import { CompliancePanel } from "@/components/settings/compliance-panel";
import { SellingPanel } from "@/components/settings/selling-panel";
import { RetentionPanel } from "@/components/settings/retention-panel";
import { IntegrationsPanel } from "@/components/settings/integrations-panel";
import { getSellingSettings } from "@/lib/actions/tenant-settings";
import { Separator } from "@/components/ui/separator";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const canImport = canEditItemMaster(session.user.role);
  const canCompliance = canManageCompliance(session.user.role);
  // Stock warnings only — owner only. The authority controls live under
  // Staff & roles, and everything printed on a bill under /branding.
  const isOwner = session.user.role === "owner";

  const [backupStatus, licenseWindow, selling] = await Promise.all([
    getBackupStatus(),
    canCompliance ? getLicenseExpiryWindow() : Promise.resolve(null),
    isOwner ? getSellingSettings() : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      <Tabs defaultValue="backup">
        <TabsList>
          <TabsTrigger value="backup">Backup</TabsTrigger>
          <TabsTrigger value="data">Import / Export</TabsTrigger>
          {isOwner && <TabsTrigger value="selling">Stock warnings</TabsTrigger>}
          {isOwner && <TabsTrigger value="integrations">Integrations</TabsTrigger>}
          {isOwner && <TabsTrigger value="retention">Retention</TabsTrigger>}
          {canCompliance && <TabsTrigger value="compliance">Compliance</TabsTrigger>}
        </TabsList>
        <TabsContent value="backup" className="pt-4">
          <BackupPanel
            lastBackupAt={backupStatus.lastBackupAt}
            lastBackupStatus={backupStatus.lastBackupStatus}
            isStale={backupStatus.isStale}
            canRestore={isOwner}
          />
        </TabsContent>
        <TabsContent value="data" className="space-y-6 pt-4">
          {canImport && (
            <>
              <ImportPanel />
              <Separator className="max-w-3xl" />
              <PartyImportPanel kind="supplier" />
              <Separator className="max-w-3xl" />
              <PartyImportPanel kind="customer" />
              <Separator className="max-w-3xl" />
            </>
          )}
          <ExportPanel />
        </TabsContent>
        {isOwner && selling && (
          <TabsContent value="selling" className="pt-4">
            <SellingPanel initial={selling} />
          </TabsContent>
        )}
        {isOwner && (
          <TabsContent value="integrations" className="pt-4">
            <IntegrationsPanel />
          </TabsContent>
        )}
        {isOwner && (
          <TabsContent value="retention" className="pt-4">
            <RetentionPanel />
          </TabsContent>
        )}
        {canCompliance && licenseWindow && (
          <TabsContent value="compliance" className="pt-4">
            <CompliancePanel initial={licenseWindow} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
