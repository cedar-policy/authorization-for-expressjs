# Pet Store API

A simple Express.js API for managing a pet store inventory.

## Setup

```bash
# Install dependencies
npm install

# Start the server
npm start

# Start with auto-reload (requires nodemon)
npm run dev
```

## API Endpoints

### GET /pets
Returns a list of all pets in the store.

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
