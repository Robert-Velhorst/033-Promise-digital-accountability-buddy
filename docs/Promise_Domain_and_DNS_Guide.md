# Promise Domain and DNS Guide

The production target for Promise is Hetzner. No production domain or DNS cutover is recorded in this repository.

Before launch, select and register the domain, provision the Hetzner service, and confirm the public ingress address. Then add DNS records at the domain registrar using the values for that Hetzner ingress. Configure TLS at the reverse proxy and verify HTTPS, redirects, and application health before announcing a production URL.

Do not copy historical provider addresses or assume a domain is already configured. Record the chosen domain, DNS records, TLS renewal method, and rollback procedure here after they have been verified.
