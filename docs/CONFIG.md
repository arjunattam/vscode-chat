# Configuration

## Network proxy

To use this extension behind a proxy, configure the proxy url.

```json
{
  "chat.proxyUrl": "YOUR_PROXY_URL"
}
```

## Self-signed certificates

If you have overriding self-signed SSL certificates, you can set the `rejectTlsUnauthorized` config to false.

```json
{
  "chat.rejectTlsUnauthorized": false
}
```

## Telemetry

This extension collects anonymized telemetry data to improve the product. This respects your editor's telemetry settings, and you can opt-out by setting the `enableTelemetry` setting to `false`.

```json
{
  "telemetry.enableTelemetry": false
}
```

## Auto-launch Live Share Chat

By default, the extension auto-launches the Live Share Chat window every time a new Live Share session is started. This behaviour can be disabled:

```json
{
  "chat.autoLaunchLiveShareChat": false
}
```
