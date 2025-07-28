# Coreflux VS Code Extension - Telemetry & Privacy

This document explains the telemetry data collection in the Coreflux VS Code Extension.

## What is Telemetry?

Telemetry is the anonymous collection of usage data that helps us understand how the extension is being used and improve the user experience. All telemetry data is completely anonymous and contains no personally identifiable information.

## Opt-In Policy

Telemetry is **disabled by default**. You must explicitly opt-in to enable telemetry data collection.

To enable telemetry:
1. Open VS Code Settings (Ctrl/Cmd + ,)
2. Search for "coreflux telemetry"
3. Check the "Telemetry Enabled" option

## What Data Do We Collect?

When telemetry is enabled, we collect the following information:

### Startup Event (once per installation)
- Extension version
- VS Code version  
- Operating system (platform, release, architecture)
- System locale and timezone
- Whether telemetry consent was given

### Usage Events
- **New File Created**: File name (anonymized), location type (workspace/untitled/outside)
- **Broker Connection**: Broker address (anonymized), TLS usage, authentication usage
- **Onboarding Progress**: Step completion, step IDs, progress tracking

### Technical Information
- Anonymous installation GUID (random UUID, not linked to any personal data)
- Timestamps (UTC)
- Schema version for data format compatibility

## What Data Do We NOT Collect?

We strictly avoid collecting any personally identifiable information:

- ❌ **No usernames** or account information
- ❌ **No IP addresses** or location data
- ❌ **No file contents** or source code
- ❌ **No exact file paths** or sensitive data
- ❌ **No personal MQTT broker credentials**
- ❌ **No business-specific data** or configurations

## How is Data Transmitted?

- Data is sent anonymously to `mqtt://stats.coreflux.org:1883`
- All events use a unique random GUID per installation
- No authentication or personal identifiers are included
- Transmission uses standard MQTT protocol
- Failed transmissions are queued and retried (max 7 days)

## Data Retention

- Telemetry events are ephemeral and not retained long-term
- Local event queue is automatically cleaned after 7 days
- No persistent storage of personal data

## Opt-Out

You can disable telemetry at any time:

1. Open VS Code Settings
2. Search for "coreflux telemetry" 
3. Uncheck the "Telemetry Enabled" option
4. Changes take effect immediately (no restart required)

## GDPR Compliance

This telemetry system is designed to be GDPR compliant:

- **Consent**: Explicit opt-in required
- **Anonymity**: No personal data collected
- **Control**: Easy opt-out at any time
- **Transparency**: Full disclosure of collected data

## Technical Implementation

The telemetry system:

- Uses singleton pattern for reliability
- Implements exponential backoff for failed connections
- Queues events locally when offline
- Never blocks the UI during transmission
- Handles network errors gracefully

## Contact

For questions about telemetry or privacy:
- Visit: [https://coreflux.org/privacy](https://coreflux.org/privacy)
- Email: privacy@coreflux.org

## Schema Details

### Event Topic Structure
```
coreflux/vscode-lot-extension/<guid>/<event-type>
```

### Event Types
- `startup` - First extension activation
- `new-file` - LOT notebook file creation
- `broker-connected` - MQTT broker connection success
- `onboarding/step` - Individual onboarding step completion
- `onboarding/completed` - Full onboarding completion

### Example Event Payload
```json
{
  "guid": "random-uuid-per-installation",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "schemaVersion": 1,
  "eventSpecificData": "varies by event type"
}
```

---

**Last Updated**: January 2024  
**Schema Version**: 1