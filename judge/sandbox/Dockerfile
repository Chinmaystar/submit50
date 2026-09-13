# =============================================================================
# Untrusted-code sandbox image.
#
# Contains ONLY the compiler toolchain — no application code, no secrets, no
# credentials, no Docker CLI, no network tools beyond what g++ needs.
# Every judge execution runs as the unprivileged `judge` user in a container
# from this image, launched with:
#   --network none --cap-drop ALL --read-only --pids-limit ...
#   --memory ... --memory-swap ... --cpus ... --security-opt no-new-privileges
# (see src/runner/dockerRunner.ts for the full flag set)
# =============================================================================

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    g++ \
    libc6-dev \
    coreutils \
    time \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --uid 1500 --create-home --shell /usr/sbin/nologin judge

# No root login, no sudo, nothing else here.
USER judge
WORKDIR /work

LABEL org.opencontainers.image.title="acm-judge-sandbox"
LABEL org.opencontainers.image.description="Hardened sandbox for untrusted C++17 submissions (Submit50 judge)"

# Sanity entrypoint — the runner always specifies the exact binary to run.
CMD ["/bin/false"]
