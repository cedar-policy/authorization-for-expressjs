# Cedar Express.js Pet Store Sample

This repository contains a sample Express.js application demonstrating how to implement authorization using Cedar with Express.js. The repository includes two versions of the same application:

1. **Start**: A basic Express.js Pet Store API without Cedar
2. **Finish**: The same application integrated with the Cedar Express middleware for authorization

## Overview

This sample demonstrates how to secure a REST API using Cedar. The application is a simple pet store API that allows users to:

- List all pets
- Create new pets
- Get details about a specific pet
- Mark pets as sold

## Directory Structure

```
CedarJSPetStoreExpressSample/
├── start/                  # Starting point application without Cedar
│   ├── app.js              # Main application file
│   ├── middleware/         # Authentication middleware
│   ├── openapi.json        # API specification
│   └── package.json        # Dependencies
│
├── finish/                 # Completed application with Cedar
│   ├── app.js              # Main application with the Cedar authorization-for-expressjs package
│   ├── middleware/         # Authentication middleware
│   ├── policies/           # Cedar policy files
│   │   ├── policy_1.cedar  # Customer policy
│   │   └── policy_2.cedar  # Employee policy
│   ├── v4.cedarschema.json # Cedar schema definition
│   ├── openapi.json        # API specification
│   └── package.json        # Dependencies with Cedar package
```

## Key Differences

The main differences between the `start` and `finish` versions:

1. **Dependencies**:
   - The `finish` version includes the `@cedar-policy/authorization-for-expressjs` package

2. **Authorization**:
   - The `start` version only has authentication via JWT
   - The `finish` version adds Cedar Policy authorization with role-based access control

3. **Policy Files**:
   - The `finish` version includes Cedar policy files that define permissions:
     - `policy_1.cedar`: Allows customers to view pets
     - `policy_2.cedar`: Allows employees full access to all API endpoints

4. **Schema Definition**:
   - The `finish` version includes a Cedar schema file (`v4.cedarschema.json`) that defines:
     - Entity types (User, UserGroup, Application)
     - Actions (GET/POST operations)
     - Annotations for HTTP verbs and path templates

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Running the Start Version

```bash
cd start
npm install
npm start
```

The server will start on port 3000 (or the port specified in the PORT environment variable).

### Running the Finish Version

```bash
cd finish
npm install
npm start
```

## Authentication

Both versions use JWT-based authentication. You'll need to:

1. Configure the JWKS URI and issuer in the `middleware/authnMiddleware.js` file
2. Include a valid JWT token in the Authorization header for API requests

## Authorization Model

The `finish` version implements a role-based access control model using Cedar Policy:

- **Customers** can:
  - View all pets (`GET /pets`)
  - View individual pet details (`GET /pets/{petId}`)

- **Employees** can:
  - View all pets (`GET /pets`)
  - Create new pets (`POST /pets`)
  - View individual pet details (`GET /pets/{petId}`)
  - Mark pets as sold (`POST /pets/{petId}/sale`)

## Cedar Integration

The `finish` version demonstrates several key Cedar concepts:

1. **Policy Definition**: Cedar policies written in a human-readable format
2. **Schema Definition**: JSON schema defining entity types and actions
3. **Principal Resolution**: Mapping JWT claims to Cedar principals
4. **Middleware Integration**: Using the Cedar Express.js middleware for authorization

## API Endpoints

- `GET /pets` - Get all pets
- `POST /pets` - Create a new pet
- `GET /pets/{petId}` - Get a specific pet by ID
- `POST /pets/{petId}/sale` - Mark a pet as sold

## Resources

- [Cedar Policy Documentation](https://docs.cedarpolicy.com/)
- [Express.js Documentation](https://expressjs.com/)
