# Security policy

SpecPlanner 0.5.1 supports local repositories, with native-host verification in Orca on macOS. Use the latest release; older builds retain their historical verification records but do not receive separate maintenance. See [release verification](docs/validation-0.5.1.md) for tested environments and limitations.

Report suspected vulnerabilities through [GitHub private vulnerability reporting](https://github.com/fiddeb/specplanner/security/advisories/new). Include the release version, host and Node versions, a description of the boundary crossed, and a minimal reproduction using disposable data. Keep credentials and private planning files out of public issues. No response-time commitment is made.

The trusted Orca worker and MCP server run with the local account's filesystem access. Workspace, revision and archive checks protect application operations; they are not an operating-system sandbox. App-only tool visibility depends on the host and is not server authentication. Do not expose the stdio server through an unauthenticated network bridge.

Ordinary defects and installation questions belong in [GitHub Issues](https://github.com/fiddeb/specplanner/issues). Dependency reports are assessed against the shipped package and reachable behavior; a clean npm audit does not establish that the application has no vulnerabilities.
