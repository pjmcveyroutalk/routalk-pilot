# Production Verification Origin Hardening

The save-point audit found that production verification constructed its self-check URL directly from forwarding headers.

Those headers are normally supplied by the hosting platform, but a verification boundary should not blindly interpolate them into an outbound fetch target.

This change:

- accepts only the first forwarded host/protocol value;
- validates the host against a strict hostname/optional-port form;
- normalizes protocol to HTTP or HTTPS;
- refuses verification when the origin is invalid;
- applies the same origin rules to the command lifecycle's internal verification request.

This is a security/reliability hardening change and does not alter the provider-neutral verification model.
