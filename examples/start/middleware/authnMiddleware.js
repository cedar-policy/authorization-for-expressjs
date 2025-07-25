const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// Initialize the JWKS client
const client = jwksClient({
  jwksUri: '<jwks uri for your oidc identity provider>',
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000 // 10 minutes
});

// Function to get the signing key
const getSigningKey = (header, callback) => {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
};

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ message: 'Authorization header missing' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Token missing' });
  }

  // Verify the token
  jwt.verify(token, getSigningKey, {
    algorithms: ['RS256'],
    issuer: `<issuer uri for your oidc identity provider>`
  }, (err, decoded) => {
    if (err) {
      console.error('JWT verification error:', err);
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    // Add the decoded token to the request object
    req.user = decoded;
    next();
  });
};

module.exports = verifyToken;