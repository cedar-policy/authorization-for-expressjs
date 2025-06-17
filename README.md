# Cedar Authorization for ExpressJS

A middleware package that enables Cedar-based authorization for Express.js applications. This package makes it easy to implement fine-grained authorization controls using Cedar policies while seamlessly integrating with your Express.js application's authentication system.

## Features

- 🔒 Cedar-based authorization middleware for Express.js
- 🎯 Fine-grained access control with Cedar policies
- 🔑 Seamless integration with OIDC/JWT authentication
- ⚡ Optimized authorization checks
- 🛠️ Customizable principal entity mapping
- 🚫 Endpoint exclusion support
- 📝 Configurable logging

## Installation

```bash
npm install @cedar-policy/authorization-for-expressjs
```

## Quick Start

1. Create your Cedar schema and policies
2. Set up the authorization middleware
3. Define your routes

```javascript
const express = require('express');
const { ExpressAuthorizationMiddleware, CedarInlineAuthorizationEngine } = require('@cedar-policy/authorization-for-expressjs');

const app = express();

// Load your Cedar policies and schema
const policies = [
    fs.readFileSync('policies/policy_1.cedar', 'utf8'),
    fs.readFileSync('policies/policy_2.cedar', 'utf8')
];

// Initialize the Cedar authorization engine
const cedarAuthorizationEngine = new CedarInlineAuthorizationEngine({
    staticPolicies: policies.join('\n'),
    schema: {
        type: 'jsonString',
        schema: fs.readFileSync('schema.json', 'utf8'),
    }
});

// Configure the Express authorization middleware
const expressAuthorization = new ExpressAuthorizationMiddleware({
    schema: {
        type: 'jsonString',
        schema: fs.readFileSync('schema.json', 'utf8'),
    },
    authorizationEngine: cedarAuthorizationEngine,
    principalConfiguration: {
        type: 'custom',
        getPrincipalEntity: async (req) => {
            // Map your authenticated user to a Cedar principal
            const user = req.user;
            return {
                uid: {
                    type: 'YourApp::User',
                    id: user.sub
                },
                attrs: {
                    ...user,
                },
                parents: user.groups.map(group => ({
                    type: 'YourApp::UserGroup',
                    id: group
                }))
            };
        }
    },
    skippedEndpoints: [
        {httpVerb: 'get', path: '/login'},
        {httpVerb: 'get', path: '/health'},
    ],
    logger: {
        debug: console.log,
        log: console.log,
    }
});

// Use the middleware after your authentication middleware
app.use(authMiddleware);  // Your authentication middleware
app.use(expressAuthorization.middleware);

// Define your routes
app.get('/protected-resource', (req, res) => {
    res.json({ message: 'Access granted!' });
});
```

## Configuration Options

### ExpressAuthorizationMiddleware

The middleware constructor accepts an options object with the following properties:

- `schema`: Cedar schema configuration. The schema is the structure of the entities and actions in your application.
  - `type`: Schema type ('jsonString' for now, 'cedar' coming soon)
  - `schema`: Cedar schema as a string, in the format dictated by `type`
- `authorizationEngine`: The authorization engine for the application. Current options are:
       - Cedar - @cedar-policy/authorization-for-expressjs
       - Amazon Verified Permissions (AVP) - @verifiedpermissions/authorization-clients
- `skippedEndpoints`: Array of endpoints to skip authorization checks. For example, endpoints that are meant to be open to everyone (eg. `/login` and `/signup`) or endpoints that will be protected with the more granular version of the middleware.
  - `httpVerb`: HTTP method in lowercase
  - `path`: Express route path template
- `contextConfiguration` (optional): The context object passed in the Cedar-based authorization request.
- `logger`: Logging configuration
  - `debug`: Debug log function
  - `log`: Standard log function
- `principalConfiguration`: Configuration for mapping authenticated users to Cedar principals. It's a type union like so:
```typescript
    | {type: 'identityToken'}
    | {type: 'accessToken'}
    | {
        type: 'custom',
        getPrincipalEntity: (req: Request) => Promise<Entity>,
    };
```
The first two are for identity and access tokens. What they will do is pass a dummy principal to the AuthorizationEngine where the principal is just the token itself. So the first two are really only meant to be used for an `AuthorizationEngine` that does authentication AND authorization, like for example the `AVPAuthorizationEngine` provided by the `verifiedpermissions/authorization-clients-js` package which uses `IsAuthorizedWithToken` under the hood. The `custom` principal configuration meant to be used with any `AuthorizationEngine`, and it presumes you have done authentication first, separately, before the middleware ran.


## Complete Example

Check out the [examples](./examples) directory for a complete implementation of a protected API using this middleware.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This project is licensed under the Apache-2.0 License.
