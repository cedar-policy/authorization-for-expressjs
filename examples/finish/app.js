const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const { ExpressAuthorizationMiddleware, CedarInlineAuthorizationEngine } = require ('@cedar-policy/authorization-for-expressjs');
const verifyToken = require('./middleware/authnMiddleware');

// Middleware
app.use(express.json());
app.use(verifyToken)

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

async function principalEntityFetcher(req) {
       
  const user = req.user;   // it's common practice for the authn middleware to store the user info from the decoded token here

  // Set group membership claim key for your oidc identity provider ("cognito:groups" for Cognito)
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

app.use(expressAuthorization.middleware);

// List of pets
const pets = [{
    id: uuidv4(),
    name: "Fido",
    species: "Dog",
    breed: null,
    age: null,
    sold: false
  }];

// GET /pets - Get all pets
app.get('/pets', (req, res) => {
  res.status(200).json(pets);
});

// POST /pets - Create a new pet
app.post('/pets', (req, res) => {
  const { name, species, breed, age } = req.body;
  
  // Validate required fields
  if (!name || !species) {
    return res.status(400).json({ error: 'Name and species are required fields' });
  }
  
  const newPet = {
    id: uuidv4(),
    name,
    species,
    breed: breed || null,
    age: age || null,
    sold: false
  };
  
  pets.push(newPet);
  res.status(201).json(newPet);
});

// GET /pets/{petId} - Get a specific pet by ID
app.get('/pets/:petId', (req, res) => {
  const { petId } = req.params;
  const pet = pets.find(p => p.id === petId);
  
  if (!pet) {
    return res.status(404).json({ error: 'Pet not found' });
  }
  
  res.status(200).json(pet);
});

// POST /pets/{petId}/sale - Mark a pet as sold
app.post('/pets/:petId/sale', (req, res) => {
  const { petId } = req.params;
  const petIndex = pets.findIndex(p => p.id === petId);
  
  if (petIndex === -1) {
    return res.status(404).json({ error: 'Pet not found' });
  }
  
  if (pets[petIndex].sold) {
    return res.status(400).json({ error: 'Pet is already sold' });
  }
  
  // Mark the pet as sold and add sale information
  pets[petIndex] = {
    ...pets[petIndex],
    sold: true,
    soldAt: new Date().toISOString()
  };
  
  res.status(200).json(pets[petIndex]);
});

// Start the server
app.listen(port, () => {
  console.log(`Pet store API server running on port ${port}`);
});

module.exports = app; // Export for testing purposes
