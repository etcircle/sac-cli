import { z } from 'zod';

const keySchema = z.string().trim().min(1);
const relativePathSchema = z.string().trim().min(1).refine(
  (value) => !value.startsWith('/') && !value.includes('..'),
  'Expected a bundle-relative path.'
);

export const proofInputsSchema = z.object({
  tenant: z.object({
    baseUrl: z.string().trim().url(),
    tenantId: keySchema,
    profile: keySchema.optional()
  }),
  sources: z.object({
    handoff: keySchema,
    reconFolder: keySchema,
    storyCapture: keySchema,
    dataActionCapture: keySchema
  }),
  story: z.object({
    key: keySchema,
    name: keySchema,
    resourceId: keySchema,
    route: keySchema,
    folderPath: keySchema
  }),
  dataAction: z.object({
    key: keySchema,
    displayName: keySchema,
    objectType: z.literal('PLANNINGSEQUENCE'),
    package: keySchema,
    objectName: keySchema,
    route: keySchema,
    stepId: keySchema,
    stepName: keySchema,
    defaultModelId: keySchema
  })
});

export const dataActionStepSchema = z.object({
  key: keySchema,
  name: keySchema,
  description: keySchema,
  type: z.literal('advanced-formula'),
  sourceStatus: z.enum(['ui-preview-excerpt', 'readback-pulled', 'planned-seed']),
  file: relativePathSchema
});

export const dataActionManifestSchema = z.object({
  key: keySchema,
  displayName: keySchema,
  description: keySchema,
  defaultModel: z.object({
    id: keySchema,
    name: keySchema
  }),
  steps: z.array(dataActionStepSchema).min(1)
});

export const storyPageSchema = z.object({
  key: keySchema,
  name: keySchema,
  widgets: z.array(keySchema).min(1)
});

export const storyManifestSchema = z.object({
  key: keySchema,
  name: keySchema,
  folderPath: keySchema,
  pages: z.array(storyPageSchema).min(1)
});

export const widgetManifestSchema = z.object({
  key: keySchema,
  type: z.literal('planning-table'),
  story: keySchema,
  page: keySchema,
  model: z.object({
    name: keySchema,
    id: keySchema.optional()
  }),
  rows: z.array(keySchema).min(1),
  columns: z.array(keySchema).min(1),
  filters: z.array(z.object({
    dimension: keySchema,
    value: keySchema
  })).default([])
});

export const deploymentStateSchema = z.object({
  tenantBaseUrl: z.string().trim().url(),
  dataAction: z.object({
    key: keySchema,
    objectType: z.literal('PLANNINGSEQUENCE'),
    package: keySchema,
    objectName: keySchema,
    stepIds: z.record(keySchema)
  }),
  story: z.object({
    key: keySchema,
    resourceId: keySchema
  }),
  widgets: z.record(z.object({
    story: keySchema,
    page: keySchema
  }))
});

export const evidenceManifestSchema = z.object({
  requiredArtifacts: z.array(relativePathSchema).min(1),
  acceptanceChecks: z.array(keySchema).min(1)
});

export type ProofInputs = z.infer<typeof proofInputsSchema>;
export type DataActionStep = z.infer<typeof dataActionStepSchema>;
export type DataActionManifest = z.infer<typeof dataActionManifestSchema>;
export type StoryManifest = z.infer<typeof storyManifestSchema>;
export type WidgetManifest = z.infer<typeof widgetManifestSchema>;
export type DeploymentState = z.infer<typeof deploymentStateSchema>;
export type EvidenceManifest = z.infer<typeof evidenceManifestSchema>;
