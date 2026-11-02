import type { Request } from 'express';

/** The authenticated caller. workspaceId ALWAYS comes from here, never from client input. */
export interface Principal {
  userId: string;
  workspaceId: string;
  sessionId: string;
  email: string;
  name: string;
  mfaEnabled: boolean;
  roles: string[];
  permissions: string[];
}

export type AuthedRequest = Request & {
  id: string;
  principal?: Principal;
  cookies?: Record<string, string | undefined>;
};

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export function getRequestMeta(req: Request): RequestMeta {
  return { ip: req.ip, userAgent: req.get('user-agent') ?? undefined };
}
