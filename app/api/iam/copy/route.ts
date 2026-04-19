import type { NextRequest } from 'next/server';
import { getRegion, parseProfileParam } from '@/lib/aws/client';
import {
  copyIamPolicy,
  copyIamRole,
  copyIamUser,
  copyInlinePolicyAsManaged,
  type IamEntityType,
  type IamInlinePolicySource,
} from '@/lib/aws/iam';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const region = getRegion(body.region);
    const sourceProfile = parseProfileParam(body.sourceProfile as string | undefined);
    const rawTarget = body.targetProfile as string | undefined;
    if (!rawTarget?.trim()) {
      return Response.json(
        { error: 'Target profile is required' },
        { status: 400 },
      );
    }
    const targetProfile = parseProfileParam(rawTarget);
    const entityType = body.entityType as IamEntityType | undefined;
    const overwrite = Boolean(body.overwrite);
    const deepCopy = Boolean(body.deepCopy);

    if (targetProfile === sourceProfile) {
      return Response.json(
        { error: 'Choose a different target profile than the source.' },
        { status: 400 },
      );
    }

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
        const out = await copyInlinePolicyAsManaged(
          region,
          sourceProfile,
          targetProfile,
          rawInline,
          overwrite,
          deepCopy,
        );
        return Response.json({ ok: true, ...out });
      }
      const sourcePolicyArn =
        typeof body.sourcePolicyArn === 'string' ? body.sourcePolicyArn : '';
      if (!sourcePolicyArn) {
        return Response.json(
          { error: 'sourcePolicyArn or inlineSource is required' },
          { status: 400 },
        );
      }
      const out = await copyIamPolicy(
        region,
        sourceProfile,
        targetProfile,
        sourcePolicyArn,
        overwrite,
        deepCopy,
      );
      return Response.json({ ok: true, ...out });
    }

    if (entityType === 'role') {
      const roleName =
        typeof body.roleName === 'string' ? body.roleName : '';
      if (!roleName) {
        return Response.json({ error: 'roleName is required' }, { status: 400 });
      }
      const out = await copyIamRole(
        region,
        sourceProfile,
        targetProfile,
        roleName,
        overwrite,
        deepCopy,
      );
      return Response.json({ ok: true, ...out });
    }

    const userName =
      typeof body.userName === 'string' ? body.userName : '';
    if (!userName) {
      return Response.json({ error: 'userName is required' }, { status: 400 });
    }
    const out = await copyIamUser(
      region,
      sourceProfile,
      targetProfile,
      userName,
      overwrite,
      deepCopy,
    );
    return Response.json({ ok: true, ...out });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
