import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditItemMaster, canManageCompliance } from "@/lib/rbac";
import { getBackupStatus } from "@/lib/actions/backup";
import { getLicenseExpiryWindow } from "@/lib/actions/branch-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackupPanel } from "@/components/settings/backup-panel";
import { SecurityPanel } from "@/components/settings/security-panel";
import { ImportPanel } from "@/components/settings/import-panel";
import { ExportPanel } from "@/components/settings/export-panel";
import { CompliancePanel } from "@/components/settings/compliance-panel";
import { Separator } from "@/components/ui/separator";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const canImport = canEditItemMaster(session.user.role);
  const canCompliance = canManageCompliance(session.user.role);

  const [backupStatus, user, licenseWindow] = await Promise.all([
    getBackupStatus(),
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id } }),
    canCompliance ? getLicenseExpiryWindow() : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      <Tabs defaultValue="backup">
        <TabsList>
          <TabsTrigger value="backup">Backup</TabsTrigger>
          <TabsTrigger value="data">Import / Export</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          {canCompliance && <TabsTrigger value="compliance">Compliance</TabsTrigger>}
        </TabsList>
        <TabsContent value="backup" className="pt-4">
          <BackupPanel
            lastBackupAt={backupStatus.lastBackupAt}
            lastBackupStatus={backupStatus.lastBackupStatus}
            isStale={backupStatus.isStale}
          />
        </TabsContent>
        <TabsContent value="data" className="space-y-6 pt-4">
          {canImport && (
            <>
              <ImportPanel />
              <Separator className="max-w-3xl" />
            </>
          )}
          <ExportPanel />
        </TabsContent>
        <TabsContent value="security" className="pt-4">
          <SecurityPanel totpEnabled={user.totpEnabled} />
        </TabsContent>
        {canCompliance && licenseWindow && (
          <TabsContent value="compliance" className="pt-4">
            <CompliancePanel initial={licenseWindow} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
