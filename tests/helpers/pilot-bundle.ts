import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const PILOT_BASE_URL = 'https://tenant.example.invalid';
export const PILOT_RUNTIME_TENANT_URL = 'https://runtime.example.invalid/sap/fpa/ui/app.html';
export const PILOT_PROFILE_NAME = 'pilot-sandbox';

const proofInputsYaml = `tenant:
  baseUrl: ${PILOT_BASE_URL}
  tenantId: EXAMPLE
  profile: ${PILOT_PROFILE_NAME}
sources:
  handoff: sac-agent-handover-2026-04-15
  reconFolder: sac-api-recon-2026-04-15_143009
  storyCapture: story-edit.json
  dataActionCapture: data-action-edit.json
story:
  key: forecast-story
  name: POC - C_REPORTING forecast table
  resourceId: 6441DE864495C73F5BCA84DEF179F641
  route: '#/story2&/s2/6441DE864495C73F5BCA84DEF179F641/?type=CANVAS&mode=edit'
  folderPath: My Files / My Playground
dataAction:
  key: fx-translation
  displayName: C_REP_DA008
  objectType: PLANNINGSEQUENCE
  package: t.J
  objectName: FA9020524E79E7C812C4D1E8D41355B
  route: '#/dataaction&/da/PLANNINGSEQUENCE:t.J:FA9020524E79E7C812C4D1E8D41355B/?step=39357048-8119-4677-3365-911086985863'
  stepId: 39357048-8119-4677-3365-911086985863
  stepName: FX_TRANS
  defaultModelId: C9dksk0o57hlt1jra87he2vh67
`;

const dataActionYaml = `key: fx-translation
displayName: C_REP_DA008
description: FX Translation - DI Consol
defaultModel:
  id: C9dksk0o57hlt1jra87he2vh67
  name: C_REPORTING
steps:
  - key: fx-trans
    name: FX_TRANS
    description: FX Trans Logic
    type: advanced-formula
    sourceStatus: ui-preview-excerpt
    file: steps/fx_trans.af
`;

const storyYaml = `key: forecast-story
name: POC - C_REPORTING forecast table
folderPath: My Files / My Playground
pages:
  - key: main
    name: Page_1
    widgets:
      - forecast-table
`;

const widgetYaml = `key: forecast-table
type: planning-table
story: forecast-story
page: main
model:
  id: C9dksk0o57hlt1jra87he2vh67
  name: C_REPORTING
rows:
  - Reporting Account
  - Company Code - DI Consol
columns:
  - Audittrail - DI Consol
  - Date
  - Measures
filters:
  - dimension: Version
    value: Forecast
`;

const deploymentStateYaml = `tenantBaseUrl: ${PILOT_BASE_URL}
dataAction:
  key: fx-translation
  objectType: PLANNINGSEQUENCE
  package: t.J
  objectName: FA9020524E79E7C812C4D1E8D41355B
  stepIds:
    fx-trans: 39357048-8119-4677-3365-911086985863
story:
  key: forecast-story
  resourceId: 6441DE864495C73F5BCA84DEF179F641
widgets:
  forecast-table:
    story: forecast-story
    page: main
`;

const evidenceManifestYaml = `requiredArtifacts:
  - normalized-readback.json
  - validation-result.json
  - reopen-check.json
  - screenshots/editor.png
  - run.log
acceptanceChecks:
  - invalid_formula_regression_shape
  - two_consecutive_read_back_hash_stability
  - non_mutation_manifest_fingerprint_and_invocation_ledger
`;

export const PILOT_STEP_SOURCE = `// Captured from the live SAC editor body preview on 2026-04-15.
// This is intentionally marked as a ui-preview-excerpt until the pull/read-back lane is proven.
CONFIG.GENERATE_UNBOOKED_DATA = OFF
MEMBERSET [d/Measures] = "AMOUNT_YTD"
MEMBERSET [d/C_CURRENCY] = "LC"
MEMBERSET [d/C_COMP_CODE] = BASEMEMBER([d/C_COMP_CODE], %C_COMP_CODE%)
MEMBERSET [d/Date] = BASEMEMBER([d/Date].[h/FYP], %Date%)
MEMBERSET [d/C_AUDITTRAIL] = BASEMEMBER([d/C_AUDITTRAIL].[h/PARENTH1], "AU_CONSOL_TOT")
MEMBERSET [d/C_ACC] = BASEMEMBER([d/C_ACC].[h/parentId], %C_ACC%)
VARIABLEMEMBER #FL_MVT_AVG OF [d/C_FLOW]
VARIABLEMEMBER #FL_MVT_OPE OF [d/C_FLOW]
VARIABLEMEMBER #FL_MVT_ACQ OF [d/C_FLOW]
VARIABLEMEMBER #FL_MVT_ACQ_RCUR OF [d/C_FLOW]

// ----- Start: delete target intersections -----
IF [d/C_ACC].[p/C_RATETYPE] = ("HISFLOW", "RESFLOW", "CTAFLOW")
   AND [d/C_FLOW].[p/DIMLIST_FX] = "CONV_OPE" THEN
    // Keep opening balances sourced from COPYOPE.
ELSE
    DELETE([d/C_CURRENCY] = %TargetCurrency%)
ENDIF
`;

export type WritePilotBundleOptions = {
  includeStepFile?: boolean;
};

export async function writePilotBundle(root: string, options: WritePilotBundleOptions = {}): Promise<string> {
  const bundleRoot = path.join(root, 'pilot');
  await mkdir(path.join(bundleRoot, 'steps'), { recursive: true });
  await mkdir(path.join(bundleRoot, 'widgets'), { recursive: true });
  await mkdir(path.join(bundleRoot, 'evidence'), { recursive: true });

  await writeFile(path.join(bundleRoot, 'proof-inputs.yaml'), proofInputsYaml, 'utf8');
  await writeFile(path.join(bundleRoot, 'data-action.yaml'), dataActionYaml, 'utf8');
  await writeFile(path.join(bundleRoot, 'story.yaml'), storyYaml, 'utf8');
  await writeFile(path.join(bundleRoot, 'widgets', 'forecast-table.yaml'), widgetYaml, 'utf8');
  await writeFile(path.join(bundleRoot, 'deployment-state.yaml'), deploymentStateYaml, 'utf8');
  await writeFile(path.join(bundleRoot, 'evidence', 'manifest.yaml'), evidenceManifestYaml, 'utf8');

  if (options.includeStepFile !== false) {
    await writeFile(path.join(bundleRoot, 'steps', 'fx_trans.af'), PILOT_STEP_SOURCE, 'utf8');
  }

  return bundleRoot;
}
