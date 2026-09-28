# workspaces-auth Specification

## Purpose
Gives each business its own isolated workspace with multiple users, and ensures every API call is authenticated and can only see data belonging to the caller's workspace.

## Requirements

### Requirement: Workspace registration
The system SHALL allow a new business to register by providing a workspace name, user name, email, and password, creating the workspace and its first user in one step.

#### Scenario: Successful registration
- **WHEN** a client submits a registration with a workspace name, name, unused email, and a password of at least 8 characters
- **THEN** the system creates the workspace and user, and returns an access token for that user

#### Scenario: Email already registered
- **WHEN** a client submits a registration with an email that already belongs to a user
- **THEN** the system rejects the request with a 409 error and creates nothing

### Requirement: Login
The system SHALL issue a signed, expiring access token when a user logs in with a correct email and password.

#### Scenario: Correct credentials
- **WHEN** a user submits a registered email and its correct password
- **THEN** the system returns an access token that identifies the user and their workspace

#### Scenario: Wrong credentials
- **WHEN** a user submits an unknown email or an incorrect password
- **THEN** the system returns a 401 error with the same message in both cases

### Requirement: Authenticated access
Every endpoint except registration, login, health, and inbound channel webhooks SHALL require a valid access token.

#### Scenario: Missing or invalid token
- **WHEN** a request to a protected endpoint has no token, a malformed token, or an expired token
- **THEN** the system returns a 401 error

#### Scenario: Current user
- **WHEN** an authenticated user requests their own profile
- **THEN** the system returns the user's id, name, email, and workspace id and name

### Requirement: Workspace isolation
The system SHALL scope every read and write to the authenticated user's workspace. Resources belonging to another workspace SHALL be indistinguishable from resources that do not exist.

#### Scenario: Accessing another workspace's conversation
- **WHEN** a user requests a conversation id that belongs to a different workspace
- **THEN** the system returns a 404 error

#### Scenario: Listing only own data
- **WHEN** a user lists conversations
- **THEN** only conversations from the user's workspace are returned

### Requirement: Password protection
The system SHALL store passwords only as salted one-way hashes and SHALL NOT return password data in any response.

#### Scenario: User data in responses
- **WHEN** any endpoint returns user information
- **THEN** the response contains no password or password hash field
