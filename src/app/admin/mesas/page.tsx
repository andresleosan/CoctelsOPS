import { AdminGuard } from "@/components/admin/AdminGuard";
import { BarTabsBoard } from "@/components/admin/BarTabsBoard";

export const dynamic = "force-dynamic";

export default function AdminMesasPage() {
  return (
    <AdminGuard permission="pedidos.read">
      <BarTabsBoard />
    </AdminGuard>
  );
}
