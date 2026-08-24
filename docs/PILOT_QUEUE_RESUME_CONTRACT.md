# Queue Resume Contract

Every accepted `/api/queue` response now includes a non-secret `resume_url` tied to the accepted `command_id`.

The URL contains no trigger secret, GitHub credential, queue encryption key, or provider token. A phone client can safely remember the URL and ask the operator to authenticate again when command details are recovered.

This creates a stable server-defined recovery contract for the upcoming main-screen persistence integration.
