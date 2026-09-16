# Security policy

GoodBit is a single-user desktop app that watches a folder on your own
machine and keeps a local database next to it. It is a personal project
maintained by one person, not a company with a security team, but the
surface it exposes is deliberately small and reports are read.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository: the
Security tab, "Report a vulnerability". That opens a private thread with the
maintainer rather than a public issue, which matters here because most of
what could go wrong involves a path on your own disk or a token in your own
config file.

There is no dedicated security address and no response-time commitment to
promise. This is maintained outside of working hours by one person; reports
are read, and something genuinely exploitable gets fixed ahead of everything
else queued.

## What the app's surface actually is

GoodBit does not listen on the network by default, and most of what it does
listen on was deliberately moved off one.

- **The internal API is not a port.** Every call from the renderer to main
  goes over one IPC channel to a listener on a named pipe on Windows (a Unix
  socket on other platforms), at a path generated fresh each launch, behind
  a secret generated at the same time. It used to bind `127.0.0.1` on an
  OS-chosen port; that was reachable by nothing outside the machine, but by
  every other program on it, and this API can delete clips. A named pipe has
  no address for another program to find without already knowing it, which
  is most of the fix; the secret stays because a single unauthenticated
  local pipe is still a single point of failure.
- **Media is served off disk, not proxied.** The `goodbit://` protocol
  handler reads files straight off disk with Range support. It does not
  listen on any socket.
- **A `goodbit://` link is the one thing that comes in from outside.** The
  publisher setup guide ends with one so nobody has to retype a forty
  character token by hand. It is parsed strictly, and the dialog that opens
  shows exactly what it is being asked to do before anything happens.
  **A link can never write a setting.** Anything that can open a browser can
  send one of these links, and a link that silently repointed the publisher
  would send every clip published afterwards to whoever sent it, which is
  the failure this is written to rule out.
- **The MCP server is off by default.** Turning it on, in Settings under
  Connections, starts an HTTP server bound to `127.0.0.1` so a local AI
  assistant (Claude Code, Claude Desktop, Cursor) can work on the library.
  It sits behind a bearer token checked before any request reaches the
  protocol, and `enableDnsRebindingProtection` with an Origin allow list, per
  the MCP specification's requirement rather than as an extra. It exposes
  eleven task-shaped tools, not the internal API: nothing returns a video,
  and nothing deletes a clip. `trim_clip` is the one destructive tool it
  offers, and its own description says so.
- **The publisher is optional and out of process.** `publisher/` is a
  separate Express service you run yourself, typically in Docker, and point
  GoodBit at. It is not part of the app's attack surface in the sense this
  file otherwise means: if you run it, its exposure is whatever you put in
  front of it (a reverse proxy, a domain, a firewall rule), and that is your
  configuration to secure, not GoodBit's.

## What a token here can honestly promise

Both the internal API's secret and the MCP server's bearer token live in a
local config file, readable by anything running as the same Windows user
account. That is a real boundary (it stops a web page or another machine
from reaching either one) and not a stronger one: it is not a defence
against other software already running as you on the same machine. That is
what a desktop app can honestly promise, and claiming more than that would
be the actual security problem.

## The installer is unsigned, on purpose

Releases are an NSIS installer and a portable exe, neither signed with a
paid code-signing certificate. Windows SmartScreen will show "Windows
protected your PC" the first time you run either one; "More info" then
"Run anyway" gets past it. This is documented in the README and is a cost
decision, not an oversight: it is not a vulnerability report.
