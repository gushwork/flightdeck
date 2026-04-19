import type { NextRequest } from 'next/server';
import { getRegion, parseProfileParam } from '@/lib/aws/client';
import {
  iamEntityExists,
  buildTargetPolicyArn,
  type IamEntityType,
  type IamInlinePolicySource,
} from '@/lib/aws/iam';
import { getAccountId } from '@/lib/aws/sts';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const region = getRegion(body.region);
    const rawTarget = body.targetProfile as string | undefined;
    if (!rawTarget?.trim()) {
      return Response.json(
        { error: 'targetProfile is required' },
        { status: 400 },
      );
    }
    const targetProfile = parseProfileParam(rawTarget);
    const entityType = body.entityType as IamEntityType | undefined;
    const roleName = typeof body.roleName === 'string' ? body.roleName : undefined;
    const userName = typeof body.userName === 'string' ? body.userName : undefined;
    const sourcePolicyArn =
      typeof body.sourcePolicyArn === 'string' ? body.sourcePolicyArn : undefined;

    if (!entityType || !['role', 'user', 'policy'].includes(entityType)) {
      return Response.json(
        { error: 'entityType must be role, user, or policy' },
        { status: 400 },
      );
    }

    if (entityType === 'policy') {
      const rawInline = body.inlineSource as IamInlinePolicySource | undefined;
      if (
        rawInline &&
        typeof rawInline === 'object' &&
        (rawInline.kind === 'role' || rawInline.kind === 'user') &&
        typeof rawInline.parentName === 'string' &&
        typeof rawInline.policyName === 'string'
      ) {
        const targetAccountId = await getAccountId(region, targetProfile);
        const policyArn = `arn:aws:iam::${targetAccountId}:policy/${rawInline.policyName}`;
        const exists = await iamEntityExists(region, targetProfile, {
          entityType: 'policy',
          inlineSource: rawInline,
        });
        return Response.json({ ...exists, policyArn });
      }
      if (!sourcePolicyArn) {
        return Response.json(
          { error: 'sourcePolicyArn or inlineSource is required for policy' },
          { status: 400 },
        );
      }
      const targetAccountId = await getAccountId(region, targetProfile);
      const policyArn = buildTargetPolicyArn(sourcePolicyArn, targetAccountId);
      const exists = await iamEntityExists(region, targetProfile, {
        entityType: 'policy',
        policyArn,
      });
      return Response.json({ ...exists, policyArn });
    }

    if (entityType === 'role' && roleName) {
      const exists = await iamEntityExists(region, targetProfile, {
        entityType: 'role',
        roleName,
      });
      return Response.json(exists);
    }

    if (entityType === 'user' && userName) {
      const exists = await iamEntityExists(region, targetProfile, {
        entityType: 'user',
        userName,
      });
      return Response.json(exists);
    }

    return Response.json(
      { error: 'Missing roleName or userName for entity type' },
      { status: 400 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
