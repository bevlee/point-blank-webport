FROM docker.io/coturn/coturn:4.6.3@sha256:71c3c990283385567f11794ee692e3a47b66fd9b0bb39e42afbe776e331dd888
USER root
# The upstream binary's file capability prevents exec when Kubernetes drops ALL capabilities.
# TURN listens above 1024; it needs no privileged capability.
RUN binary="$(command -v turnserver)" && cat "$binary" > /tmp/turnserver-unprivileged && chmod 755 /tmp/turnserver-unprivileged && mv /tmp/turnserver-unprivileged "$binary"
USER 65534:65534
