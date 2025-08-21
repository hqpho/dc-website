# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Stage 1: Python Builder
# Uses a specific Python patch version on a slim Debian Bookworm base
FROM python:3.11.4-slim-bookworm AS python-builder

# Stage 2: Node.js Builder
# Uses a specific Node.js patch version. Note: This specific patch version's slim image
# might be based on Debian Bullseye, not Bookworm, leading to a slight mix of Debian releases.
# If strict Bookworm consistency is preferred over exact patch version, consider 'node:18-slim-bookworm'.
FROM node:18.4.0-slim AS node-builder

# Stage 3: Go Builder
# Uses a specific Go patch version on a Debian Bookworm base
FROM golang:1.23.11-bookworm AS go-builder

# Stage 4: Protoc Builder
# Downloads and extracts protoc, as there isn't a dedicated "protoc" base image for easy copying.
FROM debian:bookworm-slim AS protoc-builder
ARG TARGETARCH
ENV PROTOC_VERSION="21.12"
RUN apt update && \
    # Explicitly install ca-certificates along with curl and unzip for this stage's curl
    apt install -y --no-install-recommends curl unzip ca-certificates && \
    PROTOC_ARCH="" && \
    case ${TARGETARCH} in \
        amd64) PROTOC_ARCH="x86_64";; \
        arm64) PROTOC_ARCH="aarch_64";; \
        *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1;; \
    esac && \
    curl -LO "https://github.com/protocolbuffers/protobuf/releases/download/v${PROTOC_VERSION}/protoc-${PROTOC_VERSION}-linux-${PROTOC_ARCH}.zip" && \
    unzip protoc-${PROTOC_VERSION}-linux-${PROTOC_ARCH}.zip -d /usr/local && \
    rm protoc-${PROTOC_VERSION}-linux-${PROTOC_ARCH}.zip && \
    # Clean up after download and extraction
    apt autoremove -y curl unzip ca-certificates && \
    apt clean && \
    rm -rf /var/lib/apt/lists/*

# Stage 5: Envoy Builder
# Uses the official Envoy proxy image for the specified version to get the Envoy binary
FROM envoyproxy/envoy:v1.31.0 AS envoy-builder

# Stage 5: Google Cloud SDK Builder
FROM google/cloud-sdk:469.0.0-slim AS gcloud-builder

# Final Stage: Combine all components + Chrome/ChromeDriver
# Using debian:bookworm-slim as a minimal base for the final image.
FROM debian:bookworm-slim
# This arg should be populated by buildx.
ARG TARGETARCH

# Install common utilities needed for the combined environment,
# including build-essential for some tools, and tools for Chrome/ChromeDriver.
RUN apt update && apt install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    build-essential \
    gnupg \
    wget \
    unzip \
    && \
    apt autoremove -y && \
    apt clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Set WORKDIR for potential later commands
WORKDIR /resources

# --- Install Chromium, ChromeDriver, and fonts ---
# Install from Debian's official repositories for multi-platform support.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    chromium chromium-driver fonts-indic fonts-noto fonts-noto-cjk \
    && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy Python runtime
COPY --from=python-builder /usr/local /usr/local

# Copy Node.js runtime
COPY --from=node-builder /usr/local/bin /usr/local/bin
COPY --from=node-builder /usr/local/lib/node_modules /usr/local/lib/node_modules

# Copy Go installation
COPY --from=go-builder /usr/local/go /usr/local/go

# Copy Protoc binary and include files
COPY --from=protoc-builder /usr/local/bin/protoc /usr/local/bin/protoc
COPY --from=protoc-builder /usr/local/include/google /usr/local/include/google

# Copy Envoy binary
COPY --from=envoy-builder /usr/local/bin/envoy /usr/local/bin/envoy

# Copy Google Cloud SDK
COPY --from=gcloud-builder /usr/lib/google-cloud-sdk /usr/lib/google-cloud-sdk

# Set PATH to include all binaries
# --- IMPORTANT: Configure GOPATH and install Go Protobuf plugins ---
ENV GOPATH="/go"
ENV PATH="/usr/local/go/bin:${GOPATH}/bin:/usr/local/bin:/usr/lib/google-cloud-sdk/bin:${PATH}"

# Create GOPATH directories and install Go Protobuf plugins
# This must happen AFTER Go is installed and its PATH is set up
RUN mkdir -p ${GOPATH}/src ${GOPATH}/bin && \
    go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.30.0 && \
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.3.0

# Specify a non-root user to run as
ARG USERNAME=docker
ARG USER_UID=1001
ARG USER_GID=$USER_UID

# Create the user and grant sudo privileges
RUN apt-get update \
    && apt-get install -y sudo \
    # Create a group for our user
    && groupadd --gid $USER_GID $USERNAME \
    # Create the user with a specific UID, GID, and home directory
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME \
    # Grant passwordless sudo access to the new user
    && echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME \
    # Set secure permissions on the sudoers file
    && chmod 0440 /etc/sudoers.d/$USERNAME \
    # Clean up apt cache to keep image small
    && rm -rf /var/lib/apt/lists/*

# Switch to the user
USER $USERNAME

# Set the default working directory to the user's home
WORKDIR /home/$USERNAME
