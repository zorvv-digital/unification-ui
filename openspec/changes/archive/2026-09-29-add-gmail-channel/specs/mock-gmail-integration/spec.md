# Spec Delta

## REMOVED Requirements

### Requirement: Initialize with Mock Data
**Reason**: Gmail messages now come from the backend instead of frontend mock data.
**Migration**: The demo workspace's simulated Gmail channel provides the sample messages; real workspaces connect Gmail through `gmail-channel`.

### Requirement: Fake Message Sending
**Reason**: Replies are now sent through the backend Gmail channel instead of being appended to local state.
**Migration**: Use the unified inbox send action; in the demo workspace the simulated Gmail channel accepts replies without sending real email.
