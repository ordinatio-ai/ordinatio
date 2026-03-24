// Refactored complex error handling logic

export enum ErrorType {
    CORE = 'CORE',
    ACTION = 'ACTION',
    GENERAL = 'GENERAL',
}

export class AutoError extends Error {
    constructor(public type: ErrorType, message?: string) {
        super(message);
        this.name = 'AutoError';
    }
}

export const AUTO_ERRORS = {
    CORE: {
        MISSING_DEPENDENCY: () => new AutoError(ErrorType.CORE, 'Missing dependency.'),
        INVALID_STATE: () => new AutoError(ErrorType.CORE, 'Invalid state encountered.'),
    },
    ACTION: {
        UNREGISTERED_ACTION: () => new AutoError(ErrorType.ACTION, 'Action not registered.'),
        FAILED_EXECUTION: () => new AutoError(ErrorType.ACTION, 'Execution failed.'),
    },
    GENERAL: {
        UNKNOWN_ERROR: () => new AutoError(ErrorType.GENERAL, 'An unknown error occurred.'),
    },
};

export function AutomationNotFoundError(message: string) {
    return new AutoError(ErrorType.GENERAL, `Automation Not Found: ${message}`);
}

export function ExecutionNotFoundError(message: string) {
    return new AutoError(ErrorType.GENERAL, `Execution Not Found: ${message}`);
}
