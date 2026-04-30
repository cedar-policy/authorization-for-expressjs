import { CedarInlineAuthorizationEngine, ExpressAuthorizationMiddleware } from '../../src';
import { StringifiedSchema } from '@cedar-policy/cedar-authorization';
import express from 'express';
import http from 'http';

const schema: StringifiedSchema = {
    type: 'jsonString',
    schema: JSON.stringify({
        UsersApp: {
            entityTypes: {
                User: { shape: { attributes: {}, type: 'Record' } },
                Application: { shape: { attributes: {}, type: 'Record' } },
            },
            actions: {
                'get /users': {
                    appliesTo: {
                        context: { type: 'Record', attributes: {} },
                        principalTypes: ['User'],
                        resourceTypes: ['Application'],
                    },
                    annotations: { httpVerb: 'get', httpPathTemplate: '/users' },
                },
                'get /users/{id}': {
                    appliesTo: {
                        context: { type: 'Record', attributes: {} },
                        principalTypes: ['User'],
                        resourceTypes: ['Application'],
                    },
                    annotations: { httpVerb: 'get', httpPathTemplate: '/users/{id}' },
                },
            },
            annotations: { mappingType: 'SimpleRest' },
            commonTypes: {},
        },
    }),
};

const cedarAuthorizationEngine = new CedarInlineAuthorizationEngine({
    schema,
    staticPolicies: 'permit(principal, action == UsersApp::Action::"get /users/{id}", resource);',
});

function createApp() {
    const expressAuthorization = new ExpressAuthorizationMiddleware({
        schema,
        authorizationEngine: cedarAuthorizationEngine,
        principalConfiguration: {
            type: 'custom',
            getPrincipalEntity: async () => ({
                uid: { type: 'UsersApp::User', id: 'testuser' },
                attrs: {},
                parents: [],
            }),
        },
    });

    const app = express();
    app.use(expressAuthorization.middleware);
    app.get('/users', (_req, res) => res.send('user list'));
    app.get('/users/:id', (_req, res) => res.send('user detail'));
    return app;
}

describe('action matching', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeAll(async () => {
        const app = createApp();
        server = await new Promise<http.Server>((resolve) => {
            const s = app.listen(0, () => resolve(s));
        });
        const addr = server.address() as { port: number };
        baseUrl = `http://localhost:${addr.port}`;
    });

    afterAll(() => {
        server.close();
    });

    it('allows a request matching a permitted parameterized action', async () => {
        const res = await fetch(`${baseUrl}/users/123`);
        expect(res.status).toBe(200);
    });

    it('denies a request with no matching permit policy', async () => {
        const res = await fetch(`${baseUrl}/users`);
        expect(res.status).toBe(401);
    });

    it('matches actions using the path only, ignoring query strings', async () => {
        const res = await fetch(`${baseUrl}/users/?x=1`);
        expect(res.status).toBe(401);
    });

    it('matches actions using the path only, ignoring multiple query parameters', async () => {
        const res = await fetch(`${baseUrl}/users/?x=1&y=2`);
        expect(res.status).toBe(401);
    });
});
