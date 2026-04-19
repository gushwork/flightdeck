# AWS IAM & Secrets Manager — Research Corpus (RAG)

**Purpose:** Factual background, patterns, limits, and references for retrieval-augmented systems covering IAM (users, groups, roles, policies) and Secrets Manager.

**Last updated:** 2026-04-12

---

## 1. Context: Why IAM Is Hard at Scale

### 1.1 Common Operational Pain Points

| # | Topic | Notes |
|---|--------|--------|
| 1 | **Permission surface area** | Many services and actions; maintaining per-service, per-environment policies manually does not scale. |
| 2 | **Shared-account multi-environment** | Dev, staging, and production in one account weakens isolation unless boundaries are explicit in IAM and tagging. |
| 3 | **Managed policies per group** | AWS limits managed policies attached to a group to **10 (hard cap, not adjustable)**. Differentiated access across many services and environments exhausts this quickly without consolidation strategies. |
| 4 | **Other IAM quotas** | Managed policies per user: 10 (max 20). Per role: 10 (max 25). Inline policy size caps: 2,048 (user), 5,120 (group), 10,240 (role) chars. Managed policy document: 6,144 chars max. Customer managed policies per account: 1,500 (max 5,000). Groups per account: 300 (max 500). |
| 5 | **Secrets sprawl** | Credentials in env vars, files, and code without consistent rotation, audit, or centralized access control. |
| 6 | **No built-in “opinionated” composition** | IAM supplies primitives; teams must design RBAC/ABAC, boundaries, and tagging themselves. |

### 1.2 Root Cause (Conceptual)

IAM prioritizes **flexibility** over a single prescribed model. Without a deliberate composition strategy, common outcomes include over-broad admin grants, weak environment separation, policy proliferation, and manual secret handling.

---

## 2. IAM Patterns: Hybrid RBAC + ABAC

AWS documents **attribute-based access control (ABAC)** alongside traditional **role-based** groupings. A common pattern is **hybrid RBAC + ABAC**: groups (or roles) express *job function*; **tags** on principals and resources express *environment* and *project* so one policy shape can scope many resources.

| Approach | Strengths | Weaknesses |
|----------|-----------|------------|
| **Pure RBAC** | Simple; maps to org roles | Many variants → many policies; quota pressure |
| **Pure ABAC** | Scales with tagging discipline | Not all actions/resources support tag conditions equally |
| **Hybrid RBAC + ABAC** | Groups define *what*; tags define *where* | Requires consistent tagging |

### 2.1 Reference Model (Conceptual)

```
┌─────────────────────────────────────────────────────────┐
│                    PERMISSION BOUNDARY                   │
│         (caps maximum possible permissions)              │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │  IAM Group:  │   │  IAM Group:  │   │  IAM Group:  │ │
│  │  Developers  │   │   DevOps     │   │   ReadOnly   │ │
│  │              │   │              │   │              │ │
│  │ ABAC Policy: │   │ ABAC Policy: │   │ ABAC Policy: │ │
│  │ Match env +  │   │ Match env +  │   │ Match env    │ │
│  │ project tags │   │ project tags │   │ tag only     │ │
│  └──────────────┘   └──────────────┘   └──────────────┘ │
│                                                         │
│  Tags on principals:     Tags on resources:             │
│  ├─ Environment=dev      ├─ Environment=dev             │
│  ├─ Project=app-api      ├─ Project=app-api             │
│  └─ Team=backend         └─ Team=backend                │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Example Tag Taxonomy

| Tag Key | Example values | Applied to | Role in ABAC |
|---------|----------------|------------|--------------|
| `Environment` | `dev`, `staging`, `production` | Principals + resources | Scope by environment |
| `Project` | `app-api`, `app-web`, `data-pipeline` | Principals + resources | Scope by application |
| `Team` | `backend`, `frontend`, `devops` | Principals | Org mapping (optional for conditions) |
| `CostCenter` | `engineering`, `platform` | Resources | Cost allocation (often not for auth) |
| `ManagedBy` | `terraform`, `console`, `automation` | Resources | Provenance |

### 2.3 Grouping by Job Function (Illustrative)

Defining groups by **function** and scoping with **tags** avoids multiplying groups per environment (which also interacts with the **300 / 500 group per account** quota).

| Example group | Typical intent | Policy style |
|---------------|----------------|--------------|
| Developers | App build/deploy | ABAC by `Environment` + `Project` |
| DevOps | Infra, CI/CD | ABAC by `Environment` (often broader) |
| Data engineers | Pipelines, analytics | ABAC by `Environment` + `Project` |
| Read-only | Broad read | Often `ReadOnlyAccess` + optional env scope |
| Security auditors | Cross-env read for audit | May need cross-environment visibility |
| Admins | Elevated access | Often combined with **permission boundaries** |

**Note:** Fewer, tag-scoped policies can stay under the **10 managed policies per group** limit compared to one policy per environment × service matrix.

### 2.4 Example ABAC Policy (Illustrative)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSameEnvironmentAccess",
      "Effect": "Allow",
      "Action": [
        "ec2:StartInstances",
        "ec2:StopInstances",
        "ec2:DescribeInstances",
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket",
        "lambda:InvokeFunction",
        "lambda:UpdateFunctionCode"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:ResourceTag/Environment": "${aws:PrincipalTag/Environment}",
          "aws:ResourceTag/Project": "${aws:PrincipalTag/Project}"
        }
      }
    },
    {
      "Sid": "AllowDescribeActions",
      "Effect": "Allow",
      "Action": [
        "ec2:Describe*",
        "s3:ListAllMyBuckets",
        "lambda:ListFunctions",
        "rds:DescribeDBInstances",
        "dynamodb:ListTables"
      ],
      "Resource": "*"
    }
  ]
}
```

Principal tags (`Environment`, `Project`) must be present where policies reference `aws:PrincipalTag/...`. Resource tags must exist on resources for `aws:ResourceTag/...` conditions to match.

### 2.5 Permission Boundaries (Delegation)

Boundaries cap the **maximum** permissions an identity can have. **Effective permissions = identity policies ∩ boundary** (intersection). Example boundary sketch (allow infra services; deny dangerous IAM/org/account APIs):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:*",
        "ec2:*",
        "lambda:*",
        "dynamodb:*",
        "rds:*",
        "sqs:*",
        "sns:*",
        "logs:*",
        "cloudwatch:*",
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Deny",
      "Action": [
        "iam:CreateUser",
        "iam:DeleteUser",
        "iam:CreateGroup",
        "iam:DeleteGroup",
        "iam:AttachUserPolicy",
        "iam:DetachUserPolicy",
        "iam:PutUserPolicy",
        "organizations:*",
        "account:*"
      ],
      "Resource": "*"
    }
  ]
}
```

### 2.6 Quota Pressure and Mitigations (Technical)

| Constraint | Typical mitigation |
|------------|-------------------|
| 10 managed policies per group (hard) | Consolidate with ABAC; fewer environment-specific clones |
| 6,144 char managed policy limit | Split by domain (e.g., compute vs data), not by every micro-variant |
| Customer managed policy count | ABAC reduces total policy count vs O(groups × environments × services) |
| Large human user counts | Federation (e.g., IAM Identity Center) rather than long-lived IAM users |
| Inline size limits | Prefer customer-managed policies for complex rules |

---

## 3. Secrets Manager — Limits and Patterns

### 3.1 Service Limits (Reference)

| Resource | Limit | Adjustable? |
|----------|-------|-------------|
| Secrets per region | 500,000 | Yes |
| Secret value size | 65,536 bytes | No |
| Versions per secret | 100 | No |
| Staging labels per secret | 20 | No |
| Resource policy size | 20,480 chars | No |
| GetSecretValue TPS | 10,000/sec | No |
| CreateSecret TPS | 50/sec | No |

(Additional quotas appear in the consolidated table in §4.)

### 3.2 Hierarchical Naming (Path-Style)

A common convention for path-based IAM `Resource` scoping:

```
<environment>/<project>/<secret-type>/<name>
```

Examples:

- `dev/app-api/database/primary-credentials`
- `staging/app-web/database/read-replica-credentials`
- `shared/infra/certificate/wildcard-tls`

Example IAM allow by prefix:

```json
{
  "Effect": "Allow",
  "Action": "secretsmanager:GetSecretValue",
  "Resource": "arn:aws:secretsmanager:*:*:secret:dev/app-api/*"
}
```

ABAC-style ARN pattern (where principal tags are set):

```json
{
  "Effect": "Allow",
  "Action": "secretsmanager:GetSecretValue",
  "Resource": "arn:aws:secretsmanager:*:*:secret:${aws:PrincipalTag/Environment}/${aws:PrincipalTag/Project}/*"
}
```

### 3.3 Secret Metadata Tags (Common Scheme)

| Tag Key | Example | Use |
|---------|---------|-----|
| `Environment` | `dev` / `staging` / `production` / `shared` | ABAC / reporting |
| `Project` | `app-api` | Scope |
| `SecretType` | `database`, `api-key`, `certificate` | Classification |
| `RotationEnabled` | `true` / `false` | Operations |
| `Owner` | `team-backend` | Ownership |

---

## 4. AWS Service Quotas Reference

### 4.1 IAM

| Resource | Default | Maximum (adjustable) | Notes |
|----------|---------|---------------------|--------|
| Users per account | 5,000 | 5,000 | Hard cap |
| Groups per account | 300 | 500 | |
| Roles per account | 1,000 | 5,000 | |
| Customer managed policies per account | 1,500 | 5,000 | |
| Managed policies per user | 10 | 20 | |
| Managed policies per group | 10 | **10 (not adjustable)** | Often binding |
| Managed policies per role | 10 | 25 | |
| Inline policy size — user | 2,048 chars | — | Whitespace excluded from count |
| Inline policy size — group | 5,120 chars | — | |
| Inline policy size — role | 10,240 chars | — | |
| Managed policy size | 6,144 chars | — | |
| Policy versions per managed policy | 5 | — | |
| Instance profiles per account | 1,000 | 5,000 | |
| Server certificates per account | 20 | 20 | Hard cap |
| Role session duration | 1 hour default | 12 hours max | |
| STS requests per second | 600 | — | Per account, per region |

### 4.2 Secrets Manager

| Resource | Default | Adjustable? | Notes |
|----------|---------|-------------|--------|
| Secrets per region | 500,000 | Yes | |
| Secret value size | 65,536 bytes | No | |
| Versions per secret | 100 | No | |
| Staging labels per secret | 20 | No | |
| Resource policy size | 20,480 chars | No | |
| GetSecretValue TPS | 10,000/sec | No | |
| DescribeSecret TPS | 40,000/sec | No | |
| ListSecrets TPS | 100/sec | No | |
| CreateSecret / DeleteSecret TPS | 50/sec | No | |
| RotateSecret TPS | 50/sec | No | |

---

## 5. RAG Usage Notes

- **Chunking:** Split long JSON policy examples at `Statement` boundaries where possible so each chunk stays self-contained.
- **Metadata:** Tag chunks with `topic:iam|secrets`, `type:quota|pattern|policy-example`, and `aws:service` for filtering.
- **Freshness:** Quotas and TPS limits change; prefer linking to official quota pages in answers and re-index periodically.

---

## 6. References

- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [IAM and AWS STS Quotas](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html)
- [ABAC Authorization in AWS](https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction_attribute-based-access-control.html)
- [Controlling Access Using Tags](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_tags.html)
- [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)
- [Secrets Manager Quotas](https://docs.aws.amazon.com/secretsmanager/latest/userguide/reference_limits.html)
- [IAM Patterns That Scale](https://tolubanji.com/posts/aws-iam-advanced-patterns/) (community)
- [Working Backward: IAM Policies and Principal Tags](https://aws.amazon.com/blogs/security/working-backward-from-iam-policies-and-principal-tags-to-standardized-names-and-tags-for-your-aws-resources/) (AWS Security Blog)
