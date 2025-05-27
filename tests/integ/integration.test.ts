import { describe, it, beforeAll, expect } from 'vitest';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { 
  CognitoIdentityProviderClient, 
  InitiateAuthCommand,
  InitiateAuthCommandInput
} from "@aws-sdk/client-cognito-identity-provider";

const BASE_URL = 'http://localhost:3000';

const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const TEST_USERNAME = process.env.COGNITO_TEST_USERNAME;
const TEST_PASSWORD = process.env.TEST_PASSWORD;
const COGNITO_CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET;
const AWS_REGION = process.env.AWS_REGION;
const PRINCIPAL_TYPE = process.env.PRINCIPAL_TYPE;

function calculateSecretHash(username: string): string {
  if (!COGNITO_CLIENT_ID || !COGNITO_CLIENT_SECRET) {
    throw new Error('Missing required auth configs');
  }
  const message = username + COGNITO_CLIENT_ID;
  return crypto.createHmac('SHA256', COGNITO_CLIENT_SECRET)
    .update(message)
    .digest('base64');
}

async function getAllCognitoTokens() {
  if (!COGNITO_CLIENT_ID || !TEST_USERNAME || !TEST_PASSWORD || !AWS_REGION) {
    throw new Error('Missing required vars for auth');
  }

  const client = new CognitoIdentityProviderClient({ 
    region: AWS_REGION
  });

  const params: InitiateAuthCommandInput = {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: COGNITO_CLIENT_ID,
    AuthParameters: {
      "USERNAME": TEST_USERNAME,
      "PASSWORD": TEST_PASSWORD,
      "SECRET_HASH": calculateSecretHash(TEST_USERNAME)
    }
  };

  try {
    const command = new InitiateAuthCommand(params);
    const response = await client.send(command);
    
    if (!response.AuthenticationResult?.IdToken || !response.AuthenticationResult?.AccessToken) {
      throw new Error('Missing authentication tokens in response');
    }

    return {
      idToken: response.AuthenticationResult.IdToken,
      accessToken: response.AuthenticationResult.AccessToken
    };
  } catch (error) {
    console.error('Authentication Error:', error);
    throw error;
  }
}

interface AuthTokens {
  idToken: string;
  accessToken: string;
}

describe('Express Library integration tests', () => {
  let authTokens: AuthTokens;

  beforeAll(async () => {
    try {
      authTokens = await getAllCognitoTokens();
    } catch (error) {
      console.error('Test setup failed:', error);
      throw error;
    }
  });

  it(`should be authorized to create a new artist with ${PRINCIPAL_TYPE} principal type`, async () => {
    
    const newArtist = {
      name: 'Test Artist',
      genre: 'Pop',
      bio: 'This is a test artist bio'
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if(PRINCIPAL_TYPE === 'accessToken') {
      headers['Authorization'] = `Bearer ${authTokens.accessToken}`;
    } else if (PRINCIPAL_TYPE === 'identityToken'){
      headers['Authorization'] = `Bearer ${authTokens.idToken}`;
    }

    const response = await fetch(`${BASE_URL}/artists`, {
      method: 'POST',
      headers,
      body: JSON.stringify(newArtist)
    });

    expect(response.status).toBe(201);
  });

  it(`should fail to create a new artist with invalid ${PRINCIPAL_TYPE} principal type`, async () => {

    if(PRINCIPAL_TYPE === 'custom'){
      console.log('custom principal configured by service');
      return;
    }

    const newArtist = {
      name: 'Test Artist',
      genre: 'Pop',
      bio: 'This is a test artist bio'
    };

    const response = await fetch(`${BASE_URL}/artists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer randominvalidtoken'
      },
      body: JSON.stringify(newArtist)
    });

    expect(response.status).toBeGreaterThan(300);

  });
});