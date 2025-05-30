# Pet Store API with Cedar Authorization

A simple Express.js API for managing a pet store inventory, secured with Cedar.

## Setup

```bash
# Install dependencies
npm install

# Start the server
npm start

# Start with auto-reload (requires nodemon)
npm run dev
```

## Authorization Model

This application implements a role-based access control model using Cedar:

- **Customers** can:
  - View all pets (`GET /pets`)
  - View individual pet details (`GET /pets/{petId}`)

- **Employees** can:
  - View all pets (`GET /pets`)
  - Create new pets (`POST /pets`)
  - View individual pet details (`GET /pets/{petId}`)
  - Mark pets as sold (`POST /pets/{petId}/sale`)

## Cedar Integration Components

- **Cedar Schema** (`v4.cedarschema.json`): Defines entity types, actions, and their relationships
- **Cedar Policies** (`policies/`): Contains policy files that define authorization rules
  - `policy_1.cedar`: Customer permissions
  - `policy_2.cedar`: Employee permissions
- **Authorization Middleware**: Uses `@cedar-policy/authorization-for-expressjs` to enforce policies

## Authentication

The application uses JWT-based authentication. You'll need to:

1. Configure the JWKS URI and issuer in the `middleware/authnMiddleware.js` file
2. Include a valid JWT token in the Authorization header for API requests

## API Endpoints

### GET /pets
Returns a list of all pets in the store.

**Authorization**: Accessible by customers and employees

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Buddy",
    "species": "Dog",
    "breed": "Golden Retriever",
    "age": 3,
    "sold": false
  }
]
```

### POST /pets
Creates a new pet in the store.

**Authorization**: Accessible by employees only

**Request Body:**
```json
{
  "name": "Whiskers",
  "species": "Cat",
  "breed": "Siamese",
  "age": 2
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Whiskers",
  "species": "Cat",
  "breed": "Siamese",
  "age": 2,
  "sold": false
}
```

### GET /pets/{petId}
Returns details for a specific pet.

**Authorization**: Accessible by customers and employees

**Response:**
```json
{
  "id": "uuid",
  "name": "Buddy",
  "species": "Dog",
  "breed": "Golden Retriever",
  "age": 3,
  "sold": false
}
```

### POST /pets/{petId}/sale
Marks a pet as sold.

**Authorization**: Accessible by employees only

**Response:**
```json
{
  "id": "uuid",
  "name": "Buddy",
  "species": "Dog",
  "breed": "Golden Retriever",
  "age": 3,
  "sold": true,
  "soldAt": "2025-05-13T17:35:00.000Z"
}
```

## Principal Entity Resolution

The application maps JWT claims to Cedar principals using the `principalEntityFetcher` function:

```javascript
async function principalEntityFetcher(req) {
  const user = req.user;
  const userGroups = user["cognito:groups"].map(userGroupId => ({
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

This function extracts user groups from the JWT token and maps them to user groups defined in the Cedar schema, which are then used for authorization decisions based on the defined policies.
