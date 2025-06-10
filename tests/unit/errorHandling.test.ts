import { describe, expect, it, vi } from "vitest";
import { CedarInlineAuthorizationEngine, ExpressAuthorizationMiddleware } from "../../src";
import fs from 'fs';
import path from 'path';
import { StringifiedSchema } from "@cedar-policy/cedar-authorization";
import express from 'express';

const schema: StringifiedSchema = {
    type: 'jsonString',
    schema: fs.readFileSync(path.join(__dirname, 'v4.cedarschema.json'), 'utf8'),
};

const cedarAuthorizationEngine = new CedarInlineAuthorizationEngine({
    schema,
    staticPolicies: 'permit(principal,action,resource);',
});


describe('error Handling tests for handler-specific middleware', () => {
    it('should handle errors in fetching the resource gracefully', async () => {
        const expressAuthorization = new ExpressAuthorizationMiddleware({
            schema,
            authorizationEngine: cedarAuthorizationEngine,
            principalConfiguration: {
                type: 'custom',
                getPrincipalEntity: async (req) => {
                    return {
                        uid: {
                            type: "NotebooksApp::User",
                            id: "Alice"
                        },
                        attrs: {},
                        parents: []
                    };
                },
            },
            skippedEndpoints: [
                { httpVerb: 'get', path: '/login' },
                { httpVerb: 'get', path: '/api-spec/v3' },
                { httpVerb: 'get', path: '/notebooks/:id' },
                { httpVerb: 'put', path: '/notebooks/:id' },
                { httpVerb: 'delete', path: '/notebooks/:id' },
            ],
            logger: {
                debug: s => console.log(s),
                log: s => console.log(s),
            }
        });
        
        
        const app = express();
        app.use(express.json());
        app.use(expressAuthorization.middleware);

        app.get(
            '/notebooks/:id',
            expressAuthorization.handlerSpecificMiddleware({
                resourceProvider: async req => {
                    throw new Error('Error fetching resource');
                }
            }),
            (req, res) => {
                res.send('Hello World!');
            }
        );

        await new Promise(resolve => {
            app.listen(8080, () => {
                console.log('Server listening...');
                resolve(true);
            });
        });

        const result = await fetch('http://localhost:8080/notebooks/123');
        expect(result.status).toBe(400);
    });

    it('should handle errors in fetching the entities gracefully', async () => {
        const expressAuthorization = new ExpressAuthorizationMiddleware({
            schema,
            authorizationEngine: cedarAuthorizationEngine,
            principalConfiguration: {
                type: 'custom',
                getPrincipalEntity: async (req) => {
                    return {
                        uid: {
                            type: "NotebooksApp::User",
                            id: "Alice"
                        },
                        attrs: {},
                        parents: []
                    };
                },
            },
            skippedEndpoints: [
                { httpVerb: 'get', path: '/login' },
                { httpVerb: 'get', path: '/api-spec/v3' },
                { httpVerb: 'get', path: '/notebooks/:id' },
                { httpVerb: 'put', path: '/notebooks/:id' },
                { httpVerb: 'delete', path: '/notebooks/:id' },
            ],
            logger: {
                debug: s => console.log(s),
                log: s => console.log(s),
            }
        });
        
        
        const app = express();
        app.use(express.json());
        app.use(expressAuthorization.middleware);

        app.get(
            '/notebooks/:id',
            expressAuthorization.handlerSpecificMiddleware({
                resourceProvider: async req => {
                    return {
                        uid: {
                            type: "NotebooksApp::Notebook",
                            id: "123"
                        },
                        attrs: {},
                        parents: []
                    };
                },
                entitiesProvider: async req => {
                    throw new Error('Error fetching entities');
                }
            }),
            (req, res) => {
                res.send('Hello World!');
            }
        );

        await new Promise(resolve => {
            app.listen(8080, () => {
                console.log('Server listening...');
                resolve(true);
            });
        });

        const result = await fetch('http://localhost:8080/notebooks/123');
        expect(result.status).toBe(400);
    });
});