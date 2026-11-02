/** Permission catalog from SRS section 3.1 (families expanded into concrete codes). */
const PERMISSION_LIST = [
  ['contacts.read', 'View contacts'],
  ['contacts.write', 'Create and edit contacts'],
  ['contacts.import', 'Import contacts'],
  ['contacts.export', 'Export contacts'],
  ['campaigns.read', 'View campaigns'],
  ['campaigns.create', 'Create campaigns'],
  ['campaigns.edit', 'Edit campaigns'],
  ['campaigns.send', 'Schedule and send campaigns'],
  ['campaigns.pause', 'Pause and resume campaigns'],
  ['campaigns.cancel', 'Cancel campaigns'],
  ['templates.read', 'View templates'],
  ['templates.write', 'Create and edit templates'],
  ['templates.publish', 'Publish templates'],
  ['segments.read', 'View segments'],
  ['segments.write', 'Create and edit segments'],
  ['analytics.read', 'View analytics'],
  ['analytics.export', 'Export analytics and reports'],
  ['deliverability.read', 'View deliverability and domain health'],
  ['deliverability.manage', 'Manage domains and deliverability settings'],
  ['providers.read', 'View sending accounts'],
  ['providers.manage', 'Configure sending accounts'],
  ['users.read', 'View users and roles'],
  ['users.manage', 'Manage users and roles'],
  ['audit.read', 'View audit logs'],
  ['settings.manage', 'Change platform policies and workspace settings'],
] as const;

export type PermissionCode = (typeof PERMISSION_LIST)[number][0];

export const PERMISSION_CATALOG = PERMISSION_LIST.map(([code, description]) => ({ code, description }));
export const ALL_PERMISSION_CODES: PermissionCode[] = PERMISSION_LIST.map(([code]) => code);
