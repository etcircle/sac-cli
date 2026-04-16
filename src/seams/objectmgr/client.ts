import type { BrowserPage } from '../../session/browser-session.js';
import { pageFetchJson } from '../../session/page-fetch.js';
import type { FormulaValidationIssue, FormulaValidationResult, FormulaValidationSeverity } from '../../formula/types.js';

export type ObjectMgrTransportRequest = {
  method: 'POST';
  path: string;
  headers: Record<string, string>;
  body: unknown;
};

export type ObjectMgrTransport = <Response>(request: ObjectMgrTransportRequest) => Promise<Response>;

export type ReadPlanningSequenceInput = {
  objectName: string;
  package: string;
};

export type ReadPlanningSequenceRequest = {
  action: 'readObject';
  data: {
    p1: {
      type: 'PLANNINGSEQUENCE';
      name: string;
      package: string;
    };
    p2: false;
    p3: {
      bIncludeAdditionalData: true;
      resourceOptions: {
        metadata: {
          favResId: true;
          ancestorPath: {
            name: true;
            description: true;
            access: true;
            spaceId: true;
            parentResId: true;
          };
          access: true;
        };
      };
    };
  };
};

export type PlanningSequenceResourceAncestor = {
  resourceId: string;
  parentResourceId: string | null;
  name: string;
  description: string | null;
  spaceId: string | null;
};

export type PlanningSequenceSummary = {
  id: {
    type: 'PLANNINGSEQUENCE';
    name: string;
    package: string;
  };
  description: string;
  version: number;
  active: boolean;
  createdAt: string;
  modifiedAt: string;
  owner: {
    id: string;
    displayName: string;
  };
  changedBy: {
    id: string;
    displayName: string;
  };
  resource: {
    sharedToAny: boolean;
    canShare: boolean;
    auth: {
      read: boolean;
      update: boolean;
      delete: boolean;
    };
    ancestorPath: PlanningSequenceResourceAncestor[];
  };
};

export type ValidatePlanningSequenceStepInput = {
  sequenceVersion: string;
  defaultModelId: string;
  step: {
    id: string;
    name: string;
    description: string;
    scriptContent: string;
  };
};

export type ValidatePlanningSequenceStepRequest = {
  action: 'callFunction';
  data: [
    'PLANNINGSEQUENCE',
    'validate',
    [
      {
        scope: 'DESIGNER';
        sequenceMetadata: {
          version: string;
          defaultCubeId: string;
          encounteredVersionLimit: false;
          planningSteps: [
            {
              id: string;
              name: string;
              description: string;
              stepType: 'SCRIPT';
              panelType: 'TEXTUAL';
              scriptContent: string;
            }
          ];
        };
      }
    ]
  ];
};

type CreateObjectMgrClientInput = {
  tenantId: string;
  transport?: ObjectMgrTransport;
  page?: BrowserPage;
  tenantUrl?: string;
};

type ObjectMgrReadObjectResponse = {
  metadata?: {
    id?: {
      type?: string;
      name?: string;
      package?: string;
    };
    description?: string;
    owner?: string;
    changedBy?: string;
    version?: number;
    active?: boolean;
    tmCreated?: string;
    tmModified?: string;
    ownerDisplayName?: string;
    changedByDisplayName?: string;
    resource?: {
      sharedToAny?: boolean;
      canShare?: boolean;
      auth?: {
        read?: boolean;
        update?: boolean;
        delete?: boolean;
      };
      ancestorPath?: Array<{
        resourceId?: string;
        parentResId?: string | null;
        name?: string;
        description?: string | null;
        spaceId?: string | null;
      }>;
    };
  };
};

type ObjectMgrValidateIssueResponse = {
  line?: number;
  severity?: string;
  start?: number;
  message?: {
    code?: string;
    args?: unknown[];
  };
};

type ObjectMgrValidateMessageTree = {
  [key: string]: ObjectMgrValidateIssueResponse[] | ObjectMgrValidateMessageTree;
};

type ObjectMgrValidateMessageCollection = ObjectMgrValidateIssueResponse[] | ObjectMgrValidateMessageTree;

type ObjectMgrValidateResponse = {
  sequenceMessages?: ObjectMgrValidateMessageCollection;
  stepMessagesByStepId?: Record<string, ObjectMgrValidateMessageCollection>;
  parameterMessagesByScope?: ObjectMgrValidateMessageCollection;
  executionConfigurationMessages?: ObjectMgrValidateMessageCollection;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`objectmgr response missing ${path}`);
  }

  return value;
}

function assertBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`objectmgr response missing ${path}`);
  }

  return value;
}

function assertNumber(value: unknown, path: string): number {
  if (typeof value !== 'number') {
    throw new Error(`objectmgr response missing ${path}`);
  }

  return value;
}

function assertObject(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`objectmgr response missing ${path}`);
  }

  return value;
}

function assertArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`objectmgr response missing ${path}`);
  }

  return value;
}

function assertLiteralString(value: unknown, expected: string, path: string): string {
  if (value !== expected) {
    throw new Error(`objectmgr response missing ${path}`);
  }

  return expected;
}

function buildTransport(input: CreateObjectMgrClientInput): ObjectMgrTransport {
  if (input.transport) {
    return input.transport;
  }

  const page = input.page;
  const tenantUrl = input.tenantUrl;

  if (!page || !tenantUrl) {
    throw new Error('objectmgr client requires either a transport or both page and tenantUrl');
  }

  return (request) => pageFetchJson({
    page,
    tenantUrl,
    method: request.method,
    path: request.path,
    headers: request.headers,
    body: request.body
  });
}

function buildObjectMgrPath(tenantId: string): string {
  return `/sap/fpa/services/rest/epm/objectmgr?tenant=${encodeURIComponent(tenantId)}`;
}

function buildObjectMgrHeaders(): Record<string, string> {
  return {
    accept: 'application/json, text/javascript, */*; q=0.01',
    'content-type': 'application/json;charset=UTF-8',
    'x-requested-with': 'XMLHttpRequest'
  };
}

function mapValidationSeverity(severity: string | undefined): FormulaValidationSeverity {
  if (severity === 'W') {
    return 'warning';
  }

  if (severity === 'I') {
    return 'info';
  }

  return 'error';
}

function formatValidationMessage(code: string, args: unknown[] | undefined): string {
  const normalizedArgs = Array.isArray(args)
    ? args
        .filter((value) => value !== null && value !== undefined)
        .map((value) => String(value))
    : [];

  return normalizedArgs.length === 0 ? code : `${code}: ${normalizedArgs.join(', ')}`;
}

function normalizeValidationIssue(issue: ObjectMgrValidateIssueResponse, issuePath: string): FormulaValidationIssue {
  const code = assertString(issue.message?.code, `${issuePath}.message.code`);
  return {
    code,
    message: formatValidationMessage(code, issue.message?.args),
    severity: mapValidationSeverity(issue.severity),
    line: typeof issue.line === 'number' ? issue.line : null,
    column: typeof issue.start === 'number' ? issue.start : null
  };
}

function collectValidationIssues(
  value: ObjectMgrValidateMessageCollection | undefined,
  path: string
): FormulaValidationIssue[] {
  if (value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((issue, index) => normalizeValidationIssue(issue, `${path}[${index}]`));
  }

  if (!isRecord(value)) {
    throw new Error(`objectmgr response missing ${path}`);
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => collectValidationIssues(nestedValue, `${path}.${key}`));
}

function normalizeReadPlanningSequenceResponse(response: ObjectMgrReadObjectResponse): PlanningSequenceSummary {
  const metadata = assertObject(response.metadata, 'metadata');
  const id = assertObject(metadata.id, 'metadata.id');
  const resource = assertObject(metadata.resource, 'metadata.resource');
  const auth = assertObject(resource.auth, 'metadata.resource.auth');
  const ancestorPath = assertArray(resource.ancestorPath, 'metadata.resource.ancestorPath');

  return {
    id: {
      type: assertLiteralString(id.type, 'PLANNINGSEQUENCE', 'metadata.id.type') as 'PLANNINGSEQUENCE',
      name: assertString(id.name, 'metadata.id.name'),
      package: assertString(id.package, 'metadata.id.package')
    },
    description: assertString(metadata.description, 'metadata.description'),
    version: assertNumber(metadata.version, 'metadata.version'),
    active: assertBoolean(metadata.active, 'metadata.active'),
    createdAt: assertString(metadata.tmCreated, 'metadata.tmCreated'),
    modifiedAt: assertString(metadata.tmModified, 'metadata.tmModified'),
    owner: {
      id: assertString(metadata.owner, 'metadata.owner'),
      displayName: assertString(metadata.ownerDisplayName, 'metadata.ownerDisplayName')
    },
    changedBy: {
      id: assertString(metadata.changedBy, 'metadata.changedBy'),
      displayName: assertString(metadata.changedByDisplayName, 'metadata.changedByDisplayName')
    },
    resource: {
      sharedToAny: assertBoolean(resource.sharedToAny, 'metadata.resource.sharedToAny'),
      canShare: assertBoolean(resource.canShare, 'metadata.resource.canShare'),
      auth: {
        read: assertBoolean(auth.read, 'metadata.resource.auth.read'),
        update: assertBoolean(auth.update, 'metadata.resource.auth.update'),
        delete: assertBoolean(auth.delete, 'metadata.resource.auth.delete')
      },
      ancestorPath: ancestorPath.map((entry, index) => {
        const normalized = assertObject(entry, `metadata.resource.ancestorPath[${index}]`);
        return {
          resourceId: assertString(normalized.resourceId, `metadata.resource.ancestorPath[${index}].resourceId`),
          parentResourceId: normalized.parentResId === undefined ? null : (normalized.parentResId as string | null),
          name: assertString(normalized.name, `metadata.resource.ancestorPath[${index}].name`),
          description: normalized.description === undefined ? null : (normalized.description as string | null),
          spaceId: normalized.spaceId === undefined ? null : (normalized.spaceId as string | null)
        };
      })
    }
  };
}

function normalizeValidatePlanningSequenceResponse(
  response: ObjectMgrValidateResponse,
  stepId: string
): FormulaValidationResult {
  if (!isRecord(response.stepMessagesByStepId)) {
    throw new Error('objectmgr response missing stepMessagesByStepId');
  }

  const rawStepMessages = response.stepMessagesByStepId[stepId];
  if (rawStepMessages !== undefined && !isRecord(rawStepMessages) && !Array.isArray(rawStepMessages)) {
    throw new Error(`objectmgr response missing stepMessagesByStepId.${stepId}`);
  }

  const issues = [
    ...collectValidationIssues(rawStepMessages, `stepMessagesByStepId.${stepId}`),
    ...collectValidationIssues(response.sequenceMessages, 'sequenceMessages'),
    ...collectValidationIssues(response.parameterMessagesByScope, 'parameterMessagesByScope'),
    ...collectValidationIssues(response.executionConfigurationMessages, 'executionConfigurationMessages')
  ];

  return {
    status: issues.length === 0 ? 'valid' : 'invalid',
    issues
  };
}

export function createReadPlanningSequenceRequest(input: ReadPlanningSequenceInput): ReadPlanningSequenceRequest {
  return {
    action: 'readObject',
    data: {
      p1: {
        type: 'PLANNINGSEQUENCE',
        name: input.objectName,
        package: input.package
      },
      p2: false,
      p3: {
        bIncludeAdditionalData: true,
        resourceOptions: {
          metadata: {
            favResId: true,
            ancestorPath: {
              name: true,
              description: true,
              access: true,
              spaceId: true,
              parentResId: true
            },
            access: true
          }
        }
      }
    }
  };
}

export function createValidatePlanningSequenceStepRequest(
  input: ValidatePlanningSequenceStepInput
): ValidatePlanningSequenceStepRequest {
  return {
    action: 'callFunction',
    data: [
      'PLANNINGSEQUENCE',
      'validate',
      [
        {
          scope: 'DESIGNER',
          sequenceMetadata: {
            version: input.sequenceVersion,
            defaultCubeId: input.defaultModelId,
            encounteredVersionLimit: false,
            planningSteps: [
              {
                id: input.step.id,
                name: input.step.name,
                description: input.step.description,
                stepType: 'SCRIPT',
                panelType: 'TEXTUAL',
                scriptContent: input.step.scriptContent
              }
            ]
          }
        }
      ]
    ]
  };
}

export function createObjectMgrClient(input: CreateObjectMgrClientInput) {
  const transport = buildTransport(input);
  const path = buildObjectMgrPath(input.tenantId);
  const headers = buildObjectMgrHeaders();

  return {
    async readPlanningSequence(request: ReadPlanningSequenceInput): Promise<PlanningSequenceSummary> {
      const response = await transport<ObjectMgrReadObjectResponse>({
        method: 'POST',
        path,
        headers,
        body: createReadPlanningSequenceRequest(request)
      });

      return normalizeReadPlanningSequenceResponse(response);
    },

    async validatePlanningSequenceStep(request: ValidatePlanningSequenceStepInput): Promise<FormulaValidationResult> {
      const response = await transport<ObjectMgrValidateResponse>({
        method: 'POST',
        path,
        headers,
        body: createValidatePlanningSequenceStepRequest(request)
      });

      return normalizeValidatePlanningSequenceResponse(response, request.step.id);
    }
  };
}
