import { Suspense } from "react";
import { VpcDetailView } from "@/components/vpc/vpc-detail";

export default async function VpcDetailPage({ params }: { params: Promise<{ vpcId: string }> }) {
  const { vpcId } = await params;
  return (
    <Suspense fallback={<p className="text-sm text-(--text-muted)">Loading…</p>}>
      <VpcDetailView vpcId={decodeURIComponent(vpcId)} />
    </Suspense>
  );
}
