# Research: IAM Management & Secrets Management — Product Ideas

**Date:** 2026-04-12

---

## Part 1: IAM Management

### 1.1 Interface to List, Search, and Manage IAM Entities

#### What AWS Gives Us (APIs)

**Single-call full snapshot:** `GetAccountAuthorizationDetails` returns the entire IAM graph in one paginated call — every user, group, role, and customer-managed policy, including their relationships (which user is in which group, which policies are attached where, inline policy documents, etc.). This is the backbone API for building the interface.

```python
paginator = iam.get_paginator('get_account_authorization_details')
for page in paginator.paginate(Filter=['User', 'Group', 'Role', 'LocalManagedPolicy']):
    users = page['UserDetailList']     # includes GroupList, AttachedManagedPolicies, UserPolicyList (inline)
    groups = page['GroupDetailList']    # includes GroupPolicyList, AttachedManagedPolicies
    roles = page['RoleDetailList']     # includes RolePolicyList, AttachedManagedPolicies, AssumeRolePolicyDocument
    policies = page['Policies']        # includes PolicyVersionList (the actual JSON), AttachmentCount
```

**Per-entity listing APIs** (for lighter queries):

| Entity | API | Filterable By | Notes |
|--------|-----|---------------|-------|
| Users | `list_users()` | `PathPrefix` only | Returns name, ARN, create date, password last used, tags, permission boundary |
| Groups | `list_groups()` | `PathPrefix` only | Name, ARN, create date |
| Roles | `list_roles()` | `PathPrefix` only | Name, ARN, create date, description, max session duration, `RoleLastUsed` (date + region) |
| Policies | `list_policies()` | `Scope` (AWS/Local/All), `OnlyAttached`, `PathPrefix`, `PolicyUsageFilter` | Name, ARN, attachment count, description, create/update date |

**Relationship APIs** (for drill-down):

| Question | API |
|----------|-----|
| Which groups is user X in? | `list_groups_for_user(UserName)` |
| Which policies are attached to user X? | `list_attached_user_policies(UserName)` |
| Which policies are attached to group X? | `list_attached_group_policies(GroupName)` |
| Which policies are attached to role X? | `list_attached_role_policies(RoleName)` |
| Which users/groups/roles use policy X? | `list_entities_for_policy(PolicyArn, EntityFilter)` |
| What inline policies does user X have? | `list_user_policies(UserName)` + `get_user_policy(UserName, PolicyName)` |
| What are user X's tags? | `list_user_tags(UserName)` |
| What are role X's tags? | `list_role_tags(RoleName)` |
| Get full policy JSON | `get_policy_version(PolicyArn, VersionId)` — document is URL-encoded |

#### Search Gap

AWS IAM APIs have **no server-side free-text search**. Filtering is limited to `PathPrefix` (a path like `/devops/`). To provide real search:

- **Strategy:** Pull full snapshot via `GetAccountAuthorizationDetails`, index locally (in-memory or SQLite), and provide client-side search across names, descriptions, tags, policy content, group memberships, etc.
- **Refresh:** Snapshot can be cached and refreshed on-demand or on a schedule. The full call is fast (single-digit seconds for accounts with < 1,000 entities).
- **Search dimensions:** User name, group name, role name, policy name, policy JSON content (actions, resources, conditions), tags, attached-to relationships, last used date, creation date.

#### Management APIs (for the agentic layer to call)

| Action | API | Notes |
|--------|-----|-------|
| Create user | `create_user(UserName, Tags, Path, PermissionsBoundary)` | |
| Delete user | `delete_user(UserName)` | Must detach policies, remove from groups, delete keys, delete login profile first |
| Add user to group | `add_user_to_group(GroupName, UserName)` | |
| Remove user from group | `remove_user_from_group(GroupName, UserName)` | |
| Attach policy to user/group/role | `attach_user_policy()` / `attach_group_policy()` / `attach_role_policy()` | |
| Detach policy | `detach_user_policy()` / `detach_group_policy()` / `detach_role_policy()` | |
| Create policy | `create_policy(PolicyName, PolicyDocument, Description, Tags)` | |
| Create policy version | `create_policy_version(PolicyArn, PolicyDocument, SetAsDefault)` | Max 5 versions per policy |
| Delete policy version | `delete_policy_version(PolicyArn, VersionId)` | Can't delete the default version |
| Create group | `create_group(GroupName, Path)` | |
| Create role | `create_role(RoleName, AssumeRolePolicyDocument, Description, Tags, PermissionsBoundary)` | |
| Tag/untag user | `tag_user()` / `untag_user()` | |
| Tag/untag role | `tag_role()` / `untag_role()` | |
| Put inline policy | `put_user_policy()` / `put_group_policy()` / `put_role_policy()` | |
| Delete inline policy | `delete_user_policy()` / `delete_group_policy()` / `delete_role_policy()` | |
| Set permission boundary | `put_user_permissions_boundary()` / `put_role_permissions_boundary()` | |

---

### 1.2 Agentic Layer — Comprehension + Action Skills

The agentic layer sits between the user's natural language intent and the IAM APIs. It needs two capabilities:

#### A. Comprehension Skills (read-only, always safe)

| Skill | What It Does | Data Source |
|-------|-------------|-------------|
| **Explain user access** | "What can user X do?" → resolves effective permissions by combining group policies, direct policies, inline policies, and permission boundaries | Snapshot + policy document parsing |
| **Explain policy** | "What does this policy allow?" → human-readable summary of a policy JSON | Policy document |
| **Compare users** | "How do user A and user B's permissions differ?" | Snapshot diff |
| **Find over-privileged** | "Who has AdministratorAccess?" or "Who has `s3:*` on `*`?" | Snapshot scan + policy content search |
| **Find unused** | "Which users haven't logged in for 90 days?" | `PasswordLastUsed` field + Access Analyzer |
| **Relationship map** | "Show me the full permission chain for user X" (user → groups → policies → actions) | Snapshot graph traversal |
| **Quota check** | "How close are we to IAM limits?" | `get_account_summary()` returns counts for all IAM objects |

#### B. Action Skills (writes — require confirmation)

| Skill | Input | Output Options |
|-------|-------|----------------|
| **Grant access** | "Give user X read access to S3 bucket Y" | 1. Generate policy JSON for user to review and apply manually, OR 2. Apply directly via API (with confirmation) |
| **Revoke access** | "Remove user X's ability to delete EC2 instances" | Identify which policy grants it → suggest detach or policy edit → output JSON or apply |
| **Create role** | "Create a role for Lambda that can read from DynamoDB table Z" | Generate trust policy + permissions policy JSON, or apply |
| **Onboard user** | "Add a new developer named Sarah to the backend team" | Create user + add to groups + tag + output summary, or output CLI commands |
| **Offboard user** | "Remove user X from everything" | Sequence: deactivate keys → remove from groups → detach policies → delete inline policies → deactivate MFA → delete user |
| **Tighten permissions** | "Make this policy least-privilege" | Analyze Access Analyzer findings for the entity → suggest refined policy |
| **Modify group membership** | "Move user X from Developers to DevOps group" | Remove from old group + add to new group |

#### Output Modes

The agentic layer should always support two output modes:
1. **JSON/CLI output** — gives the user the exact policy document or AWS CLI commands to apply themselves
2. **Direct apply** — executes the changes via API (with explicit user confirmation and a dry-run preview)

This is critical for teams where the agent user may not have write permissions, or where changes need a review/approval workflow.

---

### 1.3 Access Analyzer Integration

#### What Access Analyzer Can Tell Us

IAM Access Analyzer offers three analysis types via different analyzer types:

| Analyzer Type | API Type Value | What It Finds |
|---------------|---------------|--------------|
| **External access** | `ACCOUNT` or `ORGANIZATION` | Resources (S3, SQS, KMS, Lambda, Secrets Manager, etc.) that are accessible from outside the account/org — i.e., public or cross-account access |
| **Unused access** | `ACCOUNT_UNUSED_ACCESS` or `ORGANIZATION_UNUSED_ACCESS` | IAM roles not used, access keys not used, console passwords not used, permissions (services/actions) granted but never exercised |
| **Internal access** | `ACCOUNT_INTERNAL_ACCESS` or `ORGANIZATION_INTERNAL_ACCESS` | Which principals within the org have access to selected resources |

#### Unused Access — Most Relevant for "Which Entity Is Used Where"

The unused access analyzer directly answers: "who has permissions they don't actually use?"

**Setup:**
```python
client = boto3.client('accessanalyzer')

# Create an unused access analyzer (once)
response = client.create_analyzer(
    analyzerName='unused-access-analyzer',
    type='ACCOUNT_UNUSED_ACCESS',
    configuration={
        'unusedAccess': {
            'unusedAccessAge': 90  # days without usage = "unused", configurable 1-365
        }
    }
)
analyzer_arn = response['arn']
```

**Query findings:**
```python
# List all unused permission findings
findings = client.list_findings_v2(
    analyzerArn=analyzer_arn,
    filter={
        'findingType': {'eq': ['UnusedPermission']},
        'status': {'eq': ['ACTIVE']}
    }
)

# Finding types available:
# - UnusedPermission     → services/actions granted but never used
# - UnusedIAMRole        → entire role never assumed
# - UnusedIAMUserAccessKey → access key never used
# - UnusedIAMUserPassword  → console password never used
```

**What each finding contains:**
- `resource` — the IAM entity ARN (user or role)
- `resourceType` — `AWS::IAM::Role` or `AWS::IAM::User`
- `findingType` — one of the four types above
- `findingDetails.unusedPermissionDetails`:
  - `serviceNamespace` — e.g., `s3`, `ec2`, `lambda`
  - `actions` — specific unused actions within that service
  - `lastAccessed` — when the permission was last used (if ever)

**Generate recommendations:**
```python
# Get AI-generated recommendations for what to remove
client.generate_finding_recommendation(
    analyzerArn=analyzer_arn,
    id=finding_id
)

# Then retrieve the recommendation
rec = client.get_finding_recommendation(
    analyzerArn=analyzer_arn,
    id=finding_id
)
# Returns recommended steps: DETACH_POLICY, REPLACE_POLICY, CREATE_POLICY, etc.
```

#### External Access — "Is Anything Public?"

The external access analyzer finds resources that are accessible from outside the account. Useful for security audit:
- S3 buckets with public policies
- SQS queues with cross-account access
- KMS keys shared externally
- Lambda functions with public resource policies
- Secrets Manager secrets with cross-account resource policies

#### Pricing Note

Access Analyzer charges for unused access analysis based on the number of IAM roles and users analyzed per month. External access analysis is free. This is worth surfacing in the product.

#### Integration Ideas

| Feature | How |
|---------|-----|
| Dashboard showing unused permissions by user/role | Poll `ListFindingsV2` with `UnusedPermission` filter, aggregate by resource |
| "Clean up user X" action | Fetch findings for that user's ARN → generate recommendation → present as policy change |
| "Who actually uses S3?" | Invert the unused findings — if a user has S3 permissions but no unused finding for S3, they're actively using it |
| Security score | Count of active findings across all types → normalize to 0-100 |
| Auto-remediation suggestions | Use `GenerateFindingRecommendation` → present step-by-step fix |

---

## Part 2: Secrets Management

### 2.1 Interface to List and Manage Secrets

#### Listing API

`ListSecrets` returns all secrets with metadata (not values):

```python
client = boto3.client('secretsmanager')
paginator = client.get_paginator('list_secrets')

for page in paginator.paginate(
    SortBy='name',       # or 'created-date', 'last-accessed-date', 'last-changed-date'
    SortOrder='asc'      # or 'desc'
):
    for secret in page['SecretList']:
        # Available fields:
        # - Name, ARN, Description
        # - CreatedDate, LastChangedDate, LastAccessedDate
        # - Tags (list of key-value pairs)
        # - RotationEnabled, RotationLambdaARN, RotationRules
        # - LastRotatedDate
        # - PrimaryRegion
        # - SecretVersionsToStages (version IDs → staging labels)
        # - OwningService (if managed by another AWS service)
        pass
```

#### Built-in Server-Side Filtering

`ListSecrets` supports a `Filters` parameter with these keys:

| Filter Key | Match Type | What It Searches |
|-----------|------------|-----------------|
| `name` | Prefix match, case-sensitive | Secret name |
| `description` | Prefix match, not case-sensitive | Secret description |
| `tag-key` | Prefix match, case-sensitive | Tag keys |
| `tag-value` | Prefix match, case-sensitive | Tag values |
| `primary-region` | Prefix match, case-sensitive | Primary region |
| `owning-service` | Prefix match, case-sensitive | Managing service ID |
| `all` | Word-break match, not case-sensitive | Searches across name, description, and all tags |

```python
# Example: search across all metadata fields
response = client.list_secrets(
    Filters=[{'Key': 'all', 'Values': ['database']}]
)
```

**The `all` filter** is the closest thing to free-text search. It breaks the search term into words at boundaries (letter/number, case change, punctuation) and matches across name, description, tag keys, and tag values. **But it does NOT search secret values.**

### 2.2 Global Free-Text Search on Secret Values

#### The Problem

AWS provides **no API to search secret values**. `ListSecrets` only searches metadata. `GetSecretValue` requires you to know the exact secret name/ARN.

#### Solution: Client-Side Value Search

To provide free-text search across all secret values:

1. **List all secrets** via `ListSecrets` (paginated)
2. **Fetch each secret's value** via `GetSecretValue(SecretId=arn)`
3. **Index locally** — parse JSON values (most secrets are JSON like `{"username": "admin", "password": "..."}`) and build a searchable index
4. **Search** across both metadata and values

```python
# Pseudocode for full-text secret search
secrets_index = []
for secret_meta in list_all_secrets():
    value = client.get_secret_value(SecretId=secret_meta['ARN'])
    secrets_index.append({
        'name': secret_meta['Name'],
        'tags': secret_meta.get('Tags', []),
        'description': secret_meta.get('Description', ''),
        'value': value['SecretString'],  # or value['SecretBinary']
        'last_changed': secret_meta.get('LastChangedDate'),
        'last_accessed': secret_meta.get('LastAccessedDate'),
        'rotation_enabled': secret_meta.get('RotationEnabled', False),
    })

# Now search across the index
results = [s for s in secrets_index if query in s['value'] or query in s['name']]
```

#### Rate Limits to Consider

| API | TPS Limit |
|-----|-----------|
| `GetSecretValue` | 10,000/sec per region |
| `ListSecrets` | 100/sec per region |
| `DescribeSecret` | 40,000/sec per region |

With 10,000 TPS on `GetSecretValue`, fetching all values is fast even for large accounts. For 500 secrets, the batch completes in under a second. For 10,000 secrets, about 1 second. Main constraint is the 100/sec on `ListSecrets` (100 results per page = 1 page per second).

#### Security Considerations for Value Search

- **Secret values in memory:** The index holds plaintext secret values. Must be kept in-memory only, never written to disk, and cleared when the session ends.
- **IAM permissions:** The user running the tool needs `secretsmanager:ListSecrets` + `secretsmanager:GetSecretValue` on all secrets they want to search. Scoping via resource ARN patterns is recommended.
- **Audit trail:** Every `GetSecretValue` call is logged in CloudTrail. Bulk-fetching all secrets will generate many log entries — this is expected but worth noting in docs.

### 2.3 Select Search Results and Modify

The modification APIs:

| Action | API | Notes |
|--------|-----|-------|
| Update secret value | `put_secret_value(SecretId, SecretString)` | Creates a new version |
| Update metadata | `update_secret(SecretId, Description, KmsKeyId, SecretString)` | Can update description, KMS key, and value in one call |
| Tag secret | `tag_resource(SecretId, Tags)` | Add/overwrite tags |
| Untag secret | `untag_resource(SecretId, TagKeys)` | Remove tags by key |
| Delete secret | `delete_secret(SecretId, RecoveryWindowInDays, ForceDeleteWithoutRecovery)` | Default 30-day recovery window |
| Restore deleted secret | `restore_secret(SecretId)` | Only during recovery window |
| Replicate to another region | `replicate_secret_to_regions(SecretId, AddReplicaRegions)` | |
| Configure rotation | `rotate_secret(SecretId, RotationLambdaARN, RotationRules)` | |

**Batch modification** is not natively supported — `BatchGetSecretValue` exists for reads but there's no `BatchPutSecretValue`. The tool would need to loop through selected secrets and call `put_secret_value` or `update_secret` on each.

#### Workflow for "Search → Select → Modify"

1. User searches for a term (e.g., `old-database-host`)
2. Results show matching secrets with the matched context highlighted
3. User selects one or more results
4. User specifies the modification (e.g., "replace `old-database-host` with `new-database-host`")
5. Tool previews the changes (old value vs new value for each selected secret)
6. User confirms → tool applies changes via `put_secret_value` for each

This is a powerful but dangerous workflow (bulk-modifying secrets). Safety measures:
- Always show a diff preview before applying
- Require explicit confirmation
- Create a "before" snapshot that can be used to rollback (secret versioning helps here — previous version is kept with `AWSPREVIOUS` staging label)

---

### 2.4 Secret Access History — Who Pulled What and When

#### Yes, This Is Possible via CloudTrail

Every `GetSecretValue` API call is logged in CloudTrail. The log entry includes:

| Field | Value | Description |
|-------|-------|-------------|
| `eventName` | `GetSecretValue` | The API action |
| `eventTime` | `2026-04-12T10:30:00Z` | When |
| `userIdentity.arn` | `arn:aws:iam::123456789012:user/dev-sarah` | Who (IAM user, role, or federated identity) |
| `userIdentity.type` | `IAMUser` / `AssumedRole` / `FederatedUser` | Identity type |
| `requestParameters.secretId` | `prod/app-api/database/primary` | Which secret |
| `sourceIPAddress` | `1.2.3.4` | From where |
| `userAgent` | `aws-cli/2.x` or `Boto3/1.x` | How |
| `resources[].ARN` | `arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/app-api/database/primary-AbCdEf` | Full secret ARN |

#### How to Query It

**Option 1: CloudTrail Event History (last 90 days, free)**

```python
cloudtrail = boto3.client('cloudtrail')
events = cloudtrail.lookup_events(
    LookupAttributes=[
        {'AttributeKey': 'EventSource', 'AttributeValue': 'secretsmanager.amazonaws.com'}
    ],
    StartTime=datetime(2026, 1, 1),
    EndTime=datetime(2026, 4, 12),
    MaxResults=50
)

for event in events['Events']:
    detail = json.loads(event['CloudTrailEvent'])
    if detail['eventName'] == 'GetSecretValue':
        print(f"Who: {detail['userIdentity']['arn']}")
        print(f"When: {detail['eventTime']}")
        print(f"Secret: {detail['requestParameters']['secretId']}")
        print(f"IP: {detail['sourceIPAddress']}")
```

**Option 2: CloudTrail Lake (SQL queries, longer retention, paid)**

```sql
SELECT
    eventTime,
    userIdentity.arn AS who,
    element_at(requestParameters, 'secretId') AS secret,
    sourceIPAddress
FROM
    event_data_store_id
WHERE
    eventSource = 'secretsmanager.amazonaws.com'
    AND eventName = 'GetSecretValue'
    AND eventTime > '2026-01-01'
ORDER BY eventTime DESC
```

**Option 3: CloudTrail → S3 → Athena (long-term, queryable, cheapest at scale)**

If a trail is configured to deliver logs to S3, you can query with Athena for unlimited history.

#### Limitations

| Constraint | Detail |
|-----------|--------|
| Event History retention | 90 days (free, no setup needed) |
| Trail to S3 | Unlimited retention but requires a trail configured + S3 bucket |
| CloudTrail Lake | Unlimited retention, SQL queryable, but paid per query + storage |
| `LookupEvents` API | Max 50 results per call; only supports filtering by one attribute at a time; max rate 2 TPS |
| Data events for `GetSecretValue` | CloudTrail logs `GetSecretValue` as a **management event** by default, so it's captured automatically. No need to enable data events. |
| Cross-region | CloudTrail is regional. Must query each region separately, or use an organization trail / CloudTrail Lake for multi-region |

#### What We Can Build

| Feature | Feasibility | Data Source |
|---------|------------|-------------|
| "Who accessed secret X in the last 90 days?" | Easy | CloudTrail Event History |
| "Show all secret access by user Y" | Easy | CloudTrail filtered by userIdentity |
| "When was secret X last pulled?" | Easy | CloudTrail OR `LastAccessedDate` field in `ListSecrets` (coarser — date only, no time or who) |
| "Alert when production secrets are accessed from unusual IPs" | Medium | CloudTrail + EventBridge rule |
| "Full access audit for the last year" | Requires trail → S3 setup | CloudTrail Lake or Athena |
| "Which secrets has nobody accessed in 6 months?" | Easy | `LastAccessedDate` from `ListSecrets` metadata |

---

## Part 3: Open Technical Questions

1. **Local index storage for search:** Should we use in-memory only (security-first, no persistence of secret values) or a local encrypted SQLite DB (faster subsequent searches)?

2. **Snapshot refresh strategy:** How often should the IAM snapshot and secrets index be refreshed? Options: on-demand only, on-launch, periodic background refresh.

3. **Access Analyzer cost:** Unused access analysis charges per IAM user/role per month. Should the tool create/manage the analyzer itself, or expect the user to have one already?

4. **CloudTrail dependency:** For secret access history, the 90-day event history is free and requires no setup. For longer history, we'd need to guide the user through trail setup. Should this be part of the tool?

5. **Multi-region:** Secrets Manager and CloudTrail are regional. Should the tool operate on a single region at a time, or aggregate across all regions?

6. **Output format for agentic layer:** When generating policy JSONs, should we also generate equivalent Terraform/CDK/CloudFormation templates?

---

## API Reference Summary

### IAM — Key APIs

| API | Purpose | Rate Limit |
|-----|---------|------------|
| `GetAccountAuthorizationDetails` | Full IAM snapshot (users, groups, roles, policies + relationships) | Standard |
| `ListUsers` / `ListGroups` / `ListRoles` / `ListPolicies` | Individual entity listing | Standard |
| `ListEntitiesForPolicy` | Which users/groups/roles use a policy | Standard |
| `GetPolicyVersion` | Full policy JSON document | Standard |
| `GetAccountSummary` | Account-level IAM counts (for quota tracking) | Standard |
| `CreateUser` / `DeleteUser` / `AddUserToGroup` etc. | Write operations | Standard |
| `SimulatePrincipalPolicy` | Test "would user X be allowed to do action Y on resource Z?" | Standard |

### Access Analyzer — Key APIs

| API | Purpose |
|-----|---------|
| `CreateAnalyzer` | Set up an analyzer (unused/external/internal) |
| `ListAnalyzers` | Check which analyzers exist |
| `ListFindingsV2` | Get findings with filters |
| `GetFindingV2` | Full finding details |
| `GenerateFindingRecommendation` | AI recommendation for fixing a finding |
| `GetFindingRecommendation` | Retrieve the generated recommendation |

### Secrets Manager — Key APIs

| API | Purpose | TPS |
|-----|---------|-----|
| `ListSecrets` | List all secrets with metadata filters | 100/sec |
| `GetSecretValue` | Retrieve a secret's value | 10,000/sec |
| `BatchGetSecretValue` | Retrieve up to 20 secret values in one call | 10,000/sec |
| `PutSecretValue` | Create a new version of a secret | 50/sec |
| `UpdateSecret` | Update metadata + value | 50/sec |
| `TagResource` / `UntagResource` | Manage tags | 50/sec |
| `DescribeSecret` | Full metadata for one secret | 40,000/sec |

### CloudTrail — Key APIs

| API | Purpose | Notes |
|-----|---------|-------|
| `LookupEvents` | Search last 90 days of management events | 2 TPS, max 50 results/call, single attribute filter |
| CloudTrail Lake (SQL) | Query across longer timeframes | Paid, requires event data store |
