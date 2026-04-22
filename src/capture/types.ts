import { z } from 'zod';

const keySchema = z.string().trim().min(1);
const httpMethodPattern = /^[A-Z]+$/;

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(),
  z.boolean(),
  z.number(),
  z.string(),
  z.array(jsonValueSchema),
  z.record(jsonValueSchema)
]));

export const capabilityNameSchema = z.string().trim().regex(
  /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/,
  'Expected a semantic capability name like "dataaction.validate".'
);

export const relativePathSchema = z.string().trim().min(1).refine(
  (value) => !value.startsWith('/') && !value.includes('..'),
  'Expected a repo-relative path.'
);

export const httpMethodSchema = z.string().trim().regex(
  httpMethodPattern,
  'Expected an uppercase HTTP method.'
);

export const payloadBaselineSchema = z.enum([
  'exact-capture',
  'exact-capture-plus-patch',
  'synthetic'
]);

export const requestRecordSchema = z.object({
  method: httpMethodSchema,
  url: keySchema,
  headers: z.record(z.string()).default({}),
  body: jsonValueSchema.optional()
});

export const responseRecordSchema = z.object({
  status: z.number().int().min(100).max(599),
  headers: z.record(z.string()).default({}),
  body: jsonValueSchema.optional()
});

export const routeRuntimeContextSchema = z.object({
  tenantUrl: z.string().trim().url(),
  tenantId: keySchema,
  route: keySchema,
  csrfTokenPresent: z.boolean(),
  context: z.record(jsonValueSchema).default({})
});

export const volatilityClassificationSchema = z.object({
  baseline: payloadBaselineSchema,
  patchStrategy: keySchema,
  patchPaths: z.array(keySchema).default([]),
  volatilePaths: z.array(keySchema).default([]),
  stablePaths: z.array(keySchema).default([]),
  notes: z.array(keySchema).default([])
}).superRefine((value, ctx) => {
  if (value.baseline === 'exact-capture-plus-patch' && value.patchPaths.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'exact-capture-plus-patch baselines must declare at least one patch path.',
      path: ['patchPaths']
    });
  }
});

export const workflowCaptureSchema = z.object({
  schemaVersion: z.literal(1),
  capability: capabilityNameSchema,
  capturedAt: keySchema,
  workflow: z.object({
    actor: keySchema,
    label: keySchema,
    intent: keySchema.optional()
  }),
  route: z.object({
    before: keySchema,
    after: keySchema.optional()
  }),
  runtimeContext: routeRuntimeContextSchema,
  request: requestRecordSchema,
  response: responseRecordSchema,
  volatility: volatilityClassificationSchema,
  evidence: z.object({
    source: z.enum(['browser-capture', 'manual-redaction']),
    redactions: z.array(keySchema).default([]),
    notes: z.array(keySchema).default([])
  })
});

export type RequestRecord = z.infer<typeof requestRecordSchema>;
export type ResponseRecord = z.infer<typeof responseRecordSchema>;
export type RouteRuntimeContext = z.infer<typeof routeRuntimeContextSchema>;
export type VolatilityClassification = z.infer<typeof volatilityClassificationSchema>;
export type WorkflowCapture = z.infer<typeof workflowCaptureSchema>;
