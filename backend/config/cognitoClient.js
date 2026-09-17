const crypto = require("crypto");

const region = process.env.AWS_COGNITO_REGION || process.env.AWS_REGION;
const clientId = process.env.AWS_COGNITO_CLIENT_ID;
const clientSecret = process.env.AWS_COGNITO_CLIENT_SECRET;

function isConfigured() {
  return Boolean(region && clientId);
}

function secretHash(username) {
  if (!clientSecret) return undefined;
  return crypto.createHmac("sha256", clientSecret).update(`${username}${clientId}`).digest("base64");
}

async function request(operation, payload) {
  if (!isConfigured()) throw new Error("Cognito is not configured");
  const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": `AWSCognitoIdentityProviderService.${operation}` },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || data.Message || "Cognito request failed");
    error.code = String(data.__type || "").split("#").pop();
    throw error;
  }
  return data;
}

function signUp({ username, password, email, name }) {
  return request("SignUp", {
    ClientId: clientId, Username: username, Password: password, SecretHash: secretHash(username),
    UserAttributes: [{ Name: "email", Value: email }],
  });
}

function confirmSignUp({ username, code }) {
  return request("ConfirmSignUp", { ClientId: clientId, Username: username, ConfirmationCode: code, SecretHash: secretHash(username) });
}

async function authenticate({ username, password }) {
  const AuthParameters = { USERNAME: username, PASSWORD: password };
  const hash = secretHash(username);
  if (hash) AuthParameters.SECRET_HASH = hash;
  const result = await request("InitiateAuth", { AuthFlow: "USER_PASSWORD_AUTH", ClientId: clientId, AuthParameters });
  if (!result.AuthenticationResult?.AccessToken) throw new Error(`Cognito challenge ${result.ChallengeName || "could not be completed"}`);
  return result;
}

async function changePassword({ username, currentPassword, newPassword }) {
  const auth = await authenticate({ username, password: currentPassword });
  return request("ChangePassword", { AccessToken: auth.AuthenticationResult.AccessToken, PreviousPassword: currentPassword, ProposedPassword: newPassword });
}

module.exports = { isConfigured, signUp, confirmSignUp, authenticate, changePassword };
