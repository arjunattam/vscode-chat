export const vscode = acquireVsCodeApi();

export function sendMessage(text, type) {
    vscode.postMessage({
        type,
        text
    });
}

export function formattedTime(ts) {
    const d = new Date(+ts * 1000);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function openLink(href) {
    return sendMessage(href, "link");
}
