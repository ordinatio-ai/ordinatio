// Hypothetical existing module in the package

// A complex function that we are going to refactor
export function complexFunction(a: number, b: number): number {
    let result = 0;
    if (a > 10) {
        if (b > 5) {
            result = a + b;
        } else {
            result = a - b;
        }
    } else if (b <= 5) {
        result = a * b;
    }
    // Additional complex logic...
    return result;
}

// Refactored version
function add(a: number, b: number): number {
    return a + b;
}

function subtract(a: number, b: number): number {
    return a - b;
}

function multiply(a: number, b: number): number {
    return a * b;
}

export function refactoredFunction(a: number, b: number): number {
    if (a > 10) {
        return b > 5 ? add(a, b) : subtract(a, b);
    } else if (b <= 5) {
        return multiply(a, b);
    }
    // Additional logic handling
    return 0; // Default case or further logic
}