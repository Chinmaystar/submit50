# =============================================================================
# Untrusted-code sandbox image.
#
# Contains ONLY the compiler toolchains it needs to judge — no application
# code, no secrets, no credentials, no Docker CLI, no network tools beyond
# what gcc/g++/javac need:
#   - gcc   (C17)   -> /usr/bin/gcc    -std=c17
#   - g++   (C++17) -> /usr/bin/g++    -std=c++17
#   - JDK17 (Java)  -> /usr/bin/javac /usr/bin/java
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
    gcc \
    g++ \
    libc6-dev \
    openjdk-17-jdk-headless \
    coreutils \
    time \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --uid 1500 --create-home --shell /usr/sbin/nologin judge

# No root login, no sudo, nothing else here.
USER judge
WORKDIR /work

LABEL org.opencontainers.image.title="acm-judge-sandbox"
LABEL org.opencontainers.image.description="Hardened sandbox for untrusted C/C++17/Java17 submissions (Submit50 judge)"

# Sanity entrypoint — the runner always specifies the exact binary to run.
CMD ["/bin/false"]