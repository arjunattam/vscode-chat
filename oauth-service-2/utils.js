exports.redirectUrl = (token, service, team) => {
  return `vscode://karigari.chat/redirect?token=${token}&service=${service}&team=${team}`;
}

exports.issueUrl = (errorMessage, serviceName) => {
  const encode = encodeURIComponent;
  const title = `[oauth-service] Sign in with ${serviceName} failed: ${errorMessage}`;
  const body = `- Extension version:\n- VS Code version:`;
  const baseUrl = "https://github.com/karigari/vscode-chat/issues/new/";
  return `${baseUrl}?title=${encode(title)}&body=${encode(body)}`;
};

exports.redirectError = (errorMessage, serviceName) => {
  return `vscode://karigari.chat/error?msg=${errorMessage}&service=${serviceName}`;
};
