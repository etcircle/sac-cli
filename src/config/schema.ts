import { z } from 'zod';

export const browserChannelSchema = z.enum(['chrome', 'msedge', 'chromium']);
export const browserAttachModeSchema = z.enum(['launch', 'attach-first', 'attach-only']);

export const profileSchema = z.object({
  name: z.string().trim().min(1),
  tenantUrl: z.string().trim().url(),
  defaultAccount: z.string().trim().min(1),
  browserChannel: browserChannelSchema,
  userDataDir: z.string().trim().min(1),
  defaultEvidenceDir: z.string().trim().min(1),
  remoteDebuggingUrl: z.string().trim().url().optional(),
  browserAttachMode: browserAttachModeSchema.optional(),
  notes: z.string().trim().min(1).optional()
});

export const profileStateSchema = z.object({
  defaultProfile: z.string().trim().min(1).nullable().optional(),
  profiles: z.record(profileSchema).default({})
});

export type BrowserChannel = z.infer<typeof browserChannelSchema>;
export type BrowserAttachMode = z.infer<typeof browserAttachModeSchema>;
export type SacCliProfile = z.infer<typeof profileSchema>;
export type ProfileState = z.infer<typeof profileStateSchema>;
