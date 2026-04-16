export type FormulaValidationSeverity = 'error' | 'warning' | 'info';

export type FormulaValidationIssue = {
  code: string;
  message: string;
  severity: FormulaValidationSeverity;
  line: number | null;
  column: number | null;
};

export type FormulaValidationResult = {
  status: 'valid' | 'invalid' | 'unavailable';
  issues: FormulaValidationIssue[];
};
