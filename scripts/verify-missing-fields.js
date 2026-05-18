// Simulate checkMissingFields with our schema and better-auth data

const ourSchema = {
  id: true,
  accountId: true,
  providerId: true,
  userId: true,
  accessToken: true,
  refreshToken: true,
  idToken: true,
  accessTokenExpiresAt: true,
  refreshTokenExpiresAt: true,
  scope: true,
  password: true,
  createdAt: true,
  updatedAt: true,
};

// What better-auth passes to createOAuthUser for account (after ...tokens spread)
const betterAuthAccountData = {
  providerId: 'google',
  accountId: '123',
  accessToken: 'token',
  refreshToken: 'refresh',
  tokenType: 'Bearer',      // from tokens
  scopes: ['openid', 'profile', 'email'],  // from tokens
  idToken: 'id_token',
  scope: 'openid profile email',  // explicitly set
};

console.log('=== Checking missing fields ===');
for (const key in betterAuthAccountData) {
  if (!ourSchema[key]) {
    console.log('MISSING in schema:', key);
  }
}

// Also check user data
const ourUserSchema = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  image: true,
  phone: true,
  createdAt: true,
  updatedAt: true,
  lastSeen: true,
  marketingConsent: true,
  marketingConsentAt: true,
};

// What better-auth passes for user (from Google getUserInfo)
const betterAuthUserData = {
  name: 'Test User',
  email: 'test@example.com',
  emailVerified: true,
  image: 'https://example.com/pic.jpg',
};

console.log('\n=== Checking user missing fields ===');
for (const key in betterAuthUserData) {
  if (!ourUserSchema[key]) {
    console.log('MISSING in schema:', key);
  }
}

if (!Object.keys(betterAuthAccountData).some(k => !ourSchema[k]) &&
    !Object.keys(betterAuthUserData).some(k => !ourUserSchema[k])) {
  console.log('No missing fields found in this simulation');
}
