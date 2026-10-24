import { VpcProvider } from "@/components/vpc/vpc-provider";

export default function VpcLayout({ children }: { children: React.ReactNode }) {
  return <VpcProvider>{children}</VpcProvider>;
}
