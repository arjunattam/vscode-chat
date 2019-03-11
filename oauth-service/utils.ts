import { APIGatewayEvent } from "aws-lambda";

export const parseQueryParams = (event: APIGatewayEvent) => {
  const { queryStringParameters } = event;
  let error, code;

  if (!!queryStringParameters) {
    code = queryStringParameters.code;
    error = queryStringParameters.error;
  } else {
    error = "no_code_param";
  }

  return { code, error };
};

export const getIssueUrl = (errorMessage: string, serviceName: string) => {
  const encode = encodeURIComponent;
  const title = `[oauth-service] Sign in with ${serviceName} failed: ${errorMessage}`;
  const body = `- Extension version:\n- VS Code version:`;
  const baseUrl = "https://github.com/karigari/vscode-chat/issues/new/";
  return `${baseUrl}?title=${encode(title)}&body=${encode(body)}`;
};

export const getRedirect = (token: string, service: string, team: string) => {
  return `vscode://karigari.chat/redirect?token=${token}&service=${service}&team=${team}`;
};

export const getRedirectError = (errorMessage: string, serviceName: string) => {
  return `vscode://karigari.chat/error?msg=${errorMessage}&service=${serviceName}`;
};
