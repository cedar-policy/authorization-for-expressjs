import { describe, it, expect } from 'vitest';
import { convertOpenAPIPathToExpress, flattenQueryString, shouldBeSkipped } from '../../src/index';
import { Request } from 'express';
import fc from 'fast-check';

describe('flattenQueryString', () => {
    it('should handle empty query parameters', () => {
        const result = flattenQueryString({});
        expect(result).toEqual({});
    });

    it('should convert string values to arrays of strings', () => {
        const query = {
            name: 'john',
            age: '30'
        };
        const result = flattenQueryString(query);
        expect(result).toEqual({
            name: ['john'],
            age: ['30']
        });
    });

    it('should keep arrays of strings as is', () => {
        const query = {
            tags: ['nodejs', 'typescript', 'express']
        };
        const result = flattenQueryString(query);
        expect(result).toEqual({
            tags: ['nodejs', 'typescript', 'express']
        });
    });

    it('should stringify non-string values', () => {
        const query: Request['query'] = {
            settings: { theme: 'dark', notifications: ['x'] }
        };
        const result = flattenQueryString(query);
        expect(result).toEqual({
            settings: ['{"theme":"dark","notifications":["x"]}']
        });
    });

    it('should stringify array of non-string values', () => {
        const query: Request['query'] = {
            points: [{ x: '1', y: '2' }, { x: '3', y: '4' }]
        };
        const result = flattenQueryString(query);
        expect(result).toEqual({
            points: ['{"x":"1","y":"2"}', '{"x":"3","y":"4"}']
        });
    });

    it('should handle mixed array of string and non-string values', () => {
        const query = {
            mixed: ['string', 123, { key: 'value' }]
        } as Request['query'];
        const result = flattenQueryString(query);
        expect(result.mixed).toBeDefined();
        expect(result.mixed.length).toBe(3);
        expect(typeof result.mixed[0]).toBe('string');
        expect(typeof result.mixed[1]).toBe('string');
        expect(typeof result.mixed[2]).toBe('string');
    });

    it('should handle null and undefined values', () => {
        const query = {
            undefinedValue: undefined
        } as Request['query'];
        const result = flattenQueryString(query);
        expect(result).toEqual({
            undefinedValue: ['undefined']
        });
    });
});

describe('shouldBeSkipped', () => {
    it('should return false for non-string currentUrl', () => {
        // @ts-ignore - Testing invalid input
        const result = shouldBeSkipped(['test'], null);
        expect(result).toBe(false);
    });

    it('should return true when currentUrl exactly matches a skipped endpoint', () => {
        const result = shouldBeSkipped(
            [
                {httpVerb: 'get', path: '/api/health'},
                {httpVerb: 'get', path: '/api/metrics'}
            ],
            'get',
            '/api/health'
        );
        expect(result).toBe(true);
    });

    it('should return false when currentUrl does not match any skipped endpoint', () => {
        const result = shouldBeSkipped(
            [
                {httpVerb: 'post', path: '/api/health'},
                {httpVerb: 'post', path: '/api/metrics'},
            ],
            'get',
            '/api/users');
        expect(result).toBe(false);
    });

    it('should return true when currentUrl matches a pattern in skipped endpoints', () => {
        const result = shouldBeSkipped(
            [
                {httpVerb: 'get', path: '/api/health'},
                {httpVerb: 'put', path: '/api/users/:id'},
            ],
            'put',
            '/api/users/123'
        );
        expect(result).toBe(true);
    });

    it('should return true for complex path patterns', () => {
        const result = shouldBeSkipped(
            [
                {httpVerb: 'patch', path:'/api/organizations/:orgId/users/:userId/profile'}
            ],
            'patch',
            '/api/organizations/org-123/users/user-456/profile'
        );
        expect(result).toBe(true);
    });

    it('should return false when pattern is similar but not matching', () => {
        const result = shouldBeSkipped(
            [
                {httpVerb: 'get', path: '/api/users/:id'}
            ],
            'get',
            '/api/userprofiles/123'
        );
        expect(result).toBe(false);
    });

    it('should handle empty skipped endpoints array', () => {
        const result = shouldBeSkipped([], 'get', '/api/users');
        expect(result).toBe(false);
    });

    it('should handle path with query parameters', () => {
        const result = shouldBeSkipped(
            [{httpVerb: 'get', path: '/api/search'}],
            'get',
            '/api/search?q=test&page=1'
        );
        expect(result).toBe(true);
    });

    it('should fail with wildcard patterns', () => {
        expect(() => {
            shouldBeSkipped(
                [{httpVerb: 'get', path: '/api/files/*'}],
                'get',
                '/api/files/documents/report.pdf'
            )
        }).toThrow();
    });

});

/**
 * Below is an arb generator for openApi paths works as follows:
 * 1. Generates an arb array of strings where each string is between length 1-10 and only contains valid chars
 * 2. Generates an array of random booleans where each boolean corresponds to a string in the array from step 1. Each
 *    boolean determines whether the corresponding string in the array from step 1 is a path variable or not.
 * 3. Combines the two arrays into a record
 * 4. This data structure can be used to generate an openApi path and an express path
 */
const lowerCase = 'abcdefghijklmnopqrstuvwxyz';
const upperCase = lowerCase.toUpperCase();
const VALID_CHARS = `-_${lowerCase}${upperCase}`.split('');
const pathGenerator = fc.array(
    fc.string({
        unit: fc.constantFrom(...VALID_CHARS),
        minLength: 1,
        maxLength: 10,
    }),
    {minLength: 1, maxLength: 25}
)
.chain(pathParts => 
    fc.record({
        pathParts: fc.constant(pathParts),
        maskToDetermineWhetherSegmentIsVariable: fc.array(
            fc.boolean(),
            {
                minLength: pathParts.length,
                maxLength: pathParts.length
            }
        )
    })
);

function generateOpenApiPathFromArb(pathParts: string[], maskToDetermineWhetherSegmentIsVariable: boolean[]) {
    return '/' + pathParts.map((pathPart, i) => {
        if (maskToDetermineWhetherSegmentIsVariable[i]) {
            return `{${pathPart.replaceAll('-', 'x')}}`;
        }
        return pathPart;
    }).join('/')
}

function generateExpressPathFromArb(pathParts: string[], maskToDetermineWhetherSegmentIsVariable: boolean[]) {
    return '/' + pathParts.map((pathPart, i) => {
        if (maskToDetermineWhetherSegmentIsVariable[i]) {
            return `:${pathPart.replaceAll('-', 'x')}`;
        }
        return pathPart;
    }).join('/')
}

/**
 * This test tests the function by providing an alternate implementation where we build random openAPI paths
 * and express paths from the same random data. The test then checks if the conversion function produces the
 * same result as the alternate implementation.
 * 
 */
describe('convertOpenAPIPathToExpress prop tests', () => {
    it('should handle openAPI to express conversion properly for any openAPI-compliant path', () => {
        fc.assert(
            fc.property(
                pathGenerator,
                ({pathParts, maskToDetermineWhetherSegmentIsVariable }) => {
                    const openAPIPath = generateOpenApiPathFromArb(pathParts, maskToDetermineWhetherSegmentIsVariable);
                    const expressPath = generateExpressPathFromArb(pathParts, maskToDetermineWhetherSegmentIsVariable);
                    console.log(`OPENAPI:   ${openAPIPath}`);
                    console.log(`EXPRESS:   ${expressPath}`);
                    console.log(`CONVERTED: ${convertOpenAPIPathToExpress(openAPIPath)}`);
                    return convertOpenAPIPathToExpress(openAPIPath) === expressPath;
                }
            )
        )
    });
});