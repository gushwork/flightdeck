export interface Route53HostedZoneSummary {
  id: string;
  name: string;
  recordCount: number;
  privateZone: boolean;
}

export type DnsRecordAction = "CREATE" | "UPSERT";

export interface DnsRecordChange {
  name: string;
  type: string;
  ttl: number;
  values: string[];
  /** Route 53 values before apply; empty when record does not exist. */
  currentValues: string[];
  action: DnsRecordAction;
}

export interface FlyDomainApplyPreview {
  appName: string;
  hostname: string;
  hostedZoneId: string;
  hostedZoneName: string;
  changes: DnsRecordChange[];
  warnings: string[];
  changesHash: string;
}

export interface FlyDomainApplyRequest {
  appName: string;
  hostname: string;
  hostedZoneId: string;
  region?: string;
  profile?: string;
  changes: DnsRecordChange[];
  changesHash: string;
}

export interface FlyDomainApplyResult {
  changeId: string;
  status: "PENDING" | "INSYNC";
}
