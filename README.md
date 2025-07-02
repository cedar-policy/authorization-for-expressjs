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

### Prerequisites

Before you implement the Express integration, ensure you have:

- [Node.js](https://nodejs.org/) and [npm](https://docs.npmjs.com/) installed
- An [Express.js](https://expressjs.com/) application
- An OpenID Connect (OIDC) identity provider (optional for testing)

### Setting up the integration

Let's walk through how to secure your application APIs using Cedar with the new package for Express.

#### Step 1: Add the Cedar Authorization Middleware package

The Cedar Authorization Middleware package will be used to generate a Cedar schema, create sample authorization policies, and perform the authorization in your application.

```bash
npm i --save @cedar-policy/authorization-for-expressjs
```

#### Step 2: Generate Cedar schema from your APIs

A Cedar [schema](../overview/terminology.html#term-schema) defines the authorization model for an application, including the entity types in the application and the actions users are allowed to take. We recommend defining a [namespace](../overview/terminology.html#term-namespaces) for your schema. In this example, we use YourNamespace. Your policies are validated against this schema when you run the application.

The `authorization-for-expressjs` package can analyze the [OpenAPI specification](https://swagger.io/specification/) of your application and generate a Cedar schema. Specifically, the paths object is required in your specification.

If you don't have an OpenAPI specification,  you can follow the quick instructions of the [express-openapi-generator](https://github.com/nklisch/express-openapi-generator) package to generate an OpenAPI specification.

You can generate a Cedar schema by running, replacing `openapi.json` with the file of your schema and `YourNamespace` with the namespace of our choice:

```bash
npx @cedar-policy/authorization-for-expressjs generate-schema --api-spec openapi.json --namespace YourNamespace --mapping-type SimpleRest
```

This will generate a schema file named `v4.cedarschema.json` in the package root.

#### Step 3: Define authorization policies

If no policies are configured, Cedar denies all authorization requests. We will add policies that grant access to APIs only for authorized user groups.

Generate sample Cedar policies:

```bash
npx @cedar-policy/authorization-for-expressjs generate-policies --schema v4.cedarschema.json
```

This will generate sample policies in the /policies directory. You can then customize these policies based on your use cases. For example:

```cedar
// Defines permitted administrator user group actions
permit (
    principal in YourNamespace::UserGroup::"<userPoolId>|administrator",
    action,
    resource
);

// Defines permitted employee user group actions
permit (
    principal in YourNamespace::UserGroup::"<userPoolId>|employee",
    action in
        [YourNamespace::Action::"GET /resources",
         YourNamespace::Action::"POST /resources",
         YourNamespace::Action::"GET /resources/{resourceId}",
         YourNamespace::Action::"PUT /resources/{resourceId}"],
    resource
);
```
Note: If you specified an `operationId` in the OpenAPI specification, the action names defined in the Cedar Schema will use that `operationId` instead of the default `<HTTP Method> /<PATH>` format. In this case, ensure the naming of your Actions in your Cedar Policies matches the naming of your Actions in your Cedar Schema.

For large applications with complex authorization policies, it can be challenging to analyze and audit the actual permissions provided by the many different policies. Cedar also provides the [Cedar Analysis CLI](https://github.com/cedar-policy/cedar-spec/tree/main/cedar-lean-cli) to help developers perform policy analysis on their policies.

#### Step 4: Update the application code to call Cedar and authorize API access

The application will use the Cedar middleware to authorize every request against the Cedar policies. First, add the package to the project and define the `CedarInlineAuthorizationEngine` and `ExpressAuthorizationMiddleware`. This block of code can be added to the top of the `app.js` file:

```javascript
const { ExpressAuthorizationMiddleware, CedarInlineAuthorizationEngine } = require('@cedar-policy/authorization-for-expressjs');

const policies = [
    fs.readFileSync(path.join(__dirname, 'policies', 'policy_1.cedar'), 'utf8'),
    fs.readFileSync(path.join(__dirname, 'policies', 'policy_2.cedar'), 'utf8')
];

const cedarAuthorizationEngine = new CedarInlineAuthorizationEngine({
    staticPolicies: policies.join('\n'),
    schema: {
        type: 'jsonString',
        schema: fs.readFileSync(path.join(__dirname, 'v4.cedarschema.json'), 'utf8'),
    }
});

const expressAuthorization = new ExpressAuthorizationMiddleware({
    schema: {
        type: 'jsonString',
        schema: fs.readFileSync(path.join(__dirname, 'v4.cedarschema.json'), 'utf8'),
    },
    authorizationEngine: cedarAuthorizationEngine,
    principalConfiguration: {
        type: 'custom',
        getPrincipalEntity: principalEntityFetcher
    },
    skippedEndpoints: [
        {httpVerb: 'get', path: '/login'},
        {httpVerb: 'get', path: '/api-spec/v3'},
    ],
    logger: {
        debug: s => console.log(s),
        log: s => console.log(s),
    }
});
```

Next, add the Express Authorization middleware to the application:

```javascript
const app = express();

app.use(express.json());
app.use(verifyToken());   // validate user token
// ... other pre-authz middlewares

app.use(expressAuthorization.middleware);

// ... other middlewares
```

#### Step 5: Add application code to configure the user

The Cedar authorizer requires user groups and attributes to authorize requests. The authorization middleware relies on the function passed to `getPrincipalEntity` in the initial configuration to generate the principal entity. You need to implement this function to generate the user entity:

```javascript
async function principalEntityFetcher(req) {
    const user = req.user;   // it's common practice for the authn middleware to store the user info from the decoded token here
    const userGroups = user["groups"].map(userGroupId => ({
        type: 'PetStoreApp::UserGroup',
        id: userGroupId       
    }));
    return {
        uid: {
            type: 'PetStoreApp::User',
            id: user.sub
        },
        attrs: {
            ...user,
        },
        parents: userGroups 
    };
}
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
  - Custom - Define your own authorization engine
- `skippedEndpoints`: Array of endpoints to skip authorization checks. For example, endpoints that are meant to be open to everyone (eg. `/login` and `/signup`) or endpoints that will be protected with the more granular version of the middleware.
  - `httpVerb`: HTTP method in lowercase
  - `path`: Express route path template
- `contextConfiguration` (optional): The context object passed in the Cedar-based authorization request.
- `logger`: Logging configuration
  - `debug`: Debug log function  
    **Note** - Debug loggers will log unsecure information, such as user tokens, and should never be used in production applications. 
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
The `identityToken` and `access Token` types are for identity and access tokens, respectively. They pass the token itself as the principal and should be used with an `AuthorizationEngine` that does authentication AND authorization. For example, the `AVPAuthorizationEngine` provided by the [verifiedpermissions/authorization-clients-js](https://github.com/verifiedpermissions/authorization-clients-js) package which calls the Amazon Verified Permissions API [IsAuthorizedWithToken](https://docs.aws.amazon.com/verifiedpermissions/latest/apireference/API_IsAuthorizedWithToken.html). 

The `custom` type is meant to be used with any `AuthorizationEngine`, and presumes you have done authentication before running the middleware.


## Complete Example

Check out the [examples](./examples) directory for a complete implementation of a protected API using this middleware.

## Tools to generate schemas from OpenAPI specs and sample policies

These tools exist a different package, called `@cedar-policy/cedar-authorization` repo. For details on how they work, see that package's [readme](https://github.com/cedar-policy/cedar-authorization).

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This project is licensed under the Apache-2.0 License.

## Publishing

Publishing to npm is done according to these links:

- https://docs.github.com/en/actions/use-cases-and-examples/publishing-packages/publishing-nodejs-packages  
- https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository#creating-a-release  
