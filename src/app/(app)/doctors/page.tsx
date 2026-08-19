import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/rbac";
import { DoctorForm } from "@/components/customers/doctor-form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function DoctorsPage() {
  const session = await requireSession();
  const doctors = await prisma.doctor.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Doctors</h1>
          <p className="text-sm text-muted-foreground">
            {doctors.length} doctor{doctors.length === 1 ? "" : "s"} on file for prescriptions
          </p>
        </div>
        <DoctorForm />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Registration no.</TableHead>
              <TableHead>Clinic</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {doctors.length ? (
              doctors.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>{d.registrationNo || "—"}</TableCell>
                  <TableCell>{d.clinicName || "—"}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                  No doctors yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
