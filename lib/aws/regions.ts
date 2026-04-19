export const AWS_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-central-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-south-1',
  'ca-central-1',
  'sa-east-1',
] as const;

export type AwsRegionId = (typeof AWS_REGIONS)[number];

/** City / metro — matches common AWS console naming. */
export const AWS_REGION_LOCATIONS: Record<string, string> = {
  'us-east-1': 'N. Virginia',
  'us-east-2': 'Ohio',
  'us-west-1': 'N. California',
  'us-west-2': 'Oregon',
  'eu-west-1': 'Ireland',
  'eu-west-2': 'London',
  'eu-central-1': 'Frankfurt',
  'ap-southeast-1': 'Singapore',
  'ap-southeast-2': 'Sydney',
  'ap-northeast-1': 'Tokyo',
  'ap-south-1': 'Mumbai',
  'ca-central-1': 'Canada (Central)',
  'sa-east-1': 'São Paulo',
};

/** Label for dropdowns: location first, then API id in parentheses. */
export function formatRegionMenuLabel(regionId: string): string {
  const place = AWS_REGION_LOCATIONS[regionId];
  if (place) return `${place} (${regionId})`;
  return regionId;
}
