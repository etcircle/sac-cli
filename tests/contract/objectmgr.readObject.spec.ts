import { describe, expect, it, vi } from 'vitest';
import { createObjectMgrClient } from '../../src/seams/objectmgr/client.js';
import {
  readObjectMgrReadObjectRequestFixture,
  readObjectMgrReadObjectResponseFixture
} from '../helpers/objectmgr-fixtures.js';

describe('objectmgr readPlanningSequence contract', () => {
  it('builds the captured readObject payload and normalizes the response', async () => {
    const expectedRequest = await readObjectMgrReadObjectRequestFixture();
    const responseFixture = await readObjectMgrReadObjectResponseFixture();
    const transport = vi.fn().mockResolvedValue(responseFixture);
    const client = createObjectMgrClient({
      tenantId: 'J',
      transport
    });

    const result = await client.readPlanningSequence({
      objectName: 'FA9020524E79E7C812C4D1E8D41355B',
      package: 't.J'
    });

    expect(transport).toHaveBeenCalledWith({
      method: 'POST',
      path: '/sap/fpa/services/rest/epm/objectmgr?tenant=J',
      headers: {
        accept: 'application/json, text/javascript, */*; q=0.01',
        'content-type': 'application/json;charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest'
      },
      body: expectedRequest
    });
    expect(result).toEqual({
      id: {
        type: 'PLANNINGSEQUENCE',
        name: 'FA9020524E79E7C812C4D1E8D41355B',
        package: 't.J'
      },
      description: 'FX Translation - Redacted',
      version: 14,
      active: true,
      createdAt: '2025-02-13T14:35:02.956Z',
      modifiedAt: '2025-05-07T08:11:22.321Z',
      owner: {
        id: 'REDACTED_OWNER',
        displayName: 'Redacted Owner'
      },
      changedBy: {
        id: 'REDACTED_OWNER',
        displayName: 'Redacted Owner'
      },
      resource: {
        sharedToAny: true,
        canShare: true,
        auth: {
          read: true,
          update: true,
          delete: true
        },
        ancestorPath: [
          {
            resourceId: 'PUBLIC',
            parentResourceId: 'ROOT',
            name: 'PUBLIC',
            description: 'Public',
            spaceId: null
          },
          {
            resourceId: 'REDACTED_FOLDER_ID',
            parentResourceId: 'PUBLIC',
            name: '01. Redacted Folder',
            description: 'Redacted Folder',
            spaceId: null
          }
        ]
      }
    });
  });

  it('fails loudly when required metadata fields are missing', async () => {
    const client = createObjectMgrClient({
      tenantId: 'J',
      transport: vi.fn().mockResolvedValue({
        metadata: {
          id: {
            type: 'PLANNINGSEQUENCE',
            package: 't.J'
          },
          resource: {
            auth: {
              read: true,
              update: true,
              delete: true
            },
            sharedToAny: true,
            canShare: true,
            ancestorPath: []
          }
        }
      })
    });

    await expect(
      client.readPlanningSequence({
        objectName: 'FA9020524E79E7C812C4D1E8D41355B',
        package: 't.J'
      })
    ).rejects.toThrow(/metadata\.id\.name/);
  });

  it('fails loudly when the live object type is not PLANNINGSEQUENCE', async () => {
    const responseFixture = await readObjectMgrReadObjectResponseFixture() as {
      metadata: {
        id: {
          type: string;
          name: string;
          package: string;
        };
      } & Record<string, unknown>;
    } & Record<string, unknown>;
    const client = createObjectMgrClient({
      tenantId: 'J',
      transport: vi.fn().mockResolvedValue({
        ...responseFixture,
        metadata: {
          ...responseFixture.metadata,
          id: {
            ...responseFixture.metadata.id,
            type: 'STORY'
          }
        }
      })
    });

    await expect(
      client.readPlanningSequence({
        objectName: 'FA9020524E79E7C812C4D1E8D41355B',
        package: 't.J'
      })
    ).rejects.toThrow(/metadata\.id\.type/);
  });
});
