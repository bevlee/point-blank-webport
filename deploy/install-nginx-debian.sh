#!/bin/sh
set -eu
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl gnupg
curl -fsSL https://nginx.org/keys/nginx_signing.key -o /tmp/nginx_signing.key
gpg --show-keys --with-colons /tmp/nginx_signing.key | grep -q '573BFD6B3D8FBC641079A6ABABF5BD827BD9BF62'
keyring_dir=$(mktemp -d)
gpg --homedir "$keyring_dir" --batch --import /tmp/nginx_signing.key
# Export only the nginx package-signing keys approved for this release.
gpg --homedir "$keyring_dir" --batch --export \
    8540A6F18833A80E9C1653A42FD21310B49F6B46 \
    573BFD6B3D8FBC641079A6ABABF5BD827BD9BF62 \
    9E9BE90EACBCDE69FE9B204CBCDCD8A38D88A2B3 \
    > /usr/share/keyrings/nginx-archive-keyring.gpg
test -s /usr/share/keyrings/nginx-archive-keyring.gpg
rm -rf "$keyring_dir"
echo 'deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] https://nginx.org/packages/mainline/debian bookworm nginx' > /etc/apt/sources.list.d/nginx.list
apt-get update
apt-get install -y --no-install-recommends -o Dpkg::Options::=--force-confold nginx=1.31.9-1~bookworm
rm -rf /var/lib/apt/lists/* /tmp/nginx_signing.key
nginx -v 2>&1 | grep -q 'nginx/1.31.9'
