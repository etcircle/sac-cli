import { z } from 'zod';
import {
  capabilityNameSchema,
  httpMethodSchema,
  payloadBaselineSchema,
  relativePathSchema
} from '../capture/types.js';

const keySchema = z.string().trim().min(1);

export const capabilityStatusSchema = z.enum([
  'captured',
  'replayable',
  'promoted',
  'stale'
]);

export const capabilityLaneSchema = z.enum([
  'browser-only',
  'internal-api',
  'hybrid'
]);

export const capabilityRegistryEntrySchema = z.object({
  schemaVersion: z.literal(1),
  capability: capabilityNameSchema,
  title: keySchema,
  summary: keySchema,
  status: capabilityStatusSchema,
  lane: capabilityLaneSchema,
  underlyingSeam: z.object({
    method: httpMethodSchema,
    endpoint: keySchema,
    action: keySchema
  }),
  prerequisites: z.object({
    route: keySchema,
    auth: keySchema,
    runtime: z.array(keySchema).min(1)
  }),
  artifacts: z.object({
    capture: relativePathSchema,
    contractTests: z.array(relativePathSchema).min(1),
    documentation: z.array(relativePathSchema).min(1)
  }),
  payloadStrategy: z.object({
    baseline: payloadBaselineSchema,
    patchPaths: z.array(keySchema).default([]),
    volatility: z.object({
      volatilePaths: z.array(keySchema).default([]),
      stablePaths: z.array(keySchema).default([]),
      syntheticPayloadReliability: z.enum(['unknown', 'unreliable', 'proven'])
    }),
    notes: z.array(keySchema).default([])
  }),
  proof: z.object({
    contract: z.object({
      status: z.enum(['present', 'missing']),
      tests: z.array(relativePathSchema).default([])
    }),
    live: z.object({
      status: z.enum(['verified', 'unverified']),
      summary: keySchema
    }),
    notes: z.array(keySchema).default([])
  }),
  knownFailureModes: z.array(keySchema).min(1)
}).superRefine((entry, ctx) => {
  if (entry.payloadStrategy.baseline === 'exact-capture-plus-patch' && entry.payloadStrategy.patchPaths.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'exact-capture-plus-patch entries must declare at least one patch path.',
      path: ['payloadStrategy', 'patchPaths']
    });
  }

  if (entry.proof.contract.status === 'present' && entry.proof.contract.tests.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Contract-proof entries must list at least one contract test.',
      path: ['proof', 'contract', 'tests']
    });
  }
});

export type CapabilityStatus = z.infer<typeof capabilityStatusSchema>;
export type CapabilityLane = z.infer<typeof capabilityLaneSchema>;
export type CapabilityRegistryEntry = z.infer<typeof capabilityRegistryEntrySchema>;
