import { getPosData } from "@/lib/actions/pos";
import { PosScreen } from "@/components/pos/pos-screen";

export default async function PosPage() {
  const data = await getPosData();

  return (
    <PosScreen
      items={data.items}
      customers={data.customers}
      doctors={data.doctors}
      branchId={data.branchId}
      staffDiscountCapPercent={data.staffDiscountCapPercent}
      role={data.role}
      schemes={data.schemes}
      tenantId={data.tenantId}
      receiptHeader={data.receiptHeader}
    />
  );
}
