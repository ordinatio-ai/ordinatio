import { BaseError } from './base-errors';

export class AutomationNotFoundError extends BaseError {
  constructor(message?: string) {
    super(message || 'Automation not found.');
    this.name = 'AutomationNotFoundError';
  }
}

export class ExecutionNotFoundError extends BaseError {
  constructor(message?: string) {
    super(message || 'Execution not found.');
    this.name = 'ExecutionNotFoundError';
  }
}

// Original complex logic coming here.
export function autoError(errorCode: string, message: string) {
  const coreErrors = extractCoreErrors(errorCode);
  const actionErrors = extractActionErrors(errorCode);
  return `${coreErrors} ${actionErrors} ${message}`.trim();
}

function extractCoreErrors(errorCode: string): string {
  switch (errorCode) {
    case 'core1':
      return 'Core error 1';
    case 'core2':
      return 'Core error 2';
    default:
      return 'Unknown core error';
  }
}

function extractActionErrors(errorCode: string): string {
  switch (errorCode) {
    case 'action1':
      return 'Action error 1';
    case 'action2':
      return 'Action error 2';
    default:
      return 'Unknown action error';
  }
}

export const AUTO_ERRORS = {
  core1: 'Core error 1',
  core2: 'Core error 2',
  action1: 'Action error 1',
  action2: 'Action error 2'
};

export const AUTO_ERRORS_CORE = Object.keys(AUTO_ERRORS).slice(0, 2);
export const AUTO_ERRORS_ACTIONS = Object.keys(AUTO_ERRORS).slice(2);
