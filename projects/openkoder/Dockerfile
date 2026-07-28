# projects/openkoder/Dockerfile
FROM rust:1.75-slim AS builder

WORKDIR /usr/src/app
COPY zcash_extractor .

# Install build dependencies for libgit2
RUN apt-get update && \
    apt-get install -y pkg-config libssl-dev cmake && \
    rm -rf /var/lib/apt/lists/*

# Build the release binary
RUN cargo build --release

FROM debian:bookworm-slim

WORKDIR /app

# Copy the compiled binary
COPY --from=builder /usr/src/app/target/release/zcash_extractor /usr/local/bin/zcash_extractor
# Copy the frontend assets
COPY zcash_extractor/frontend /app/frontend

# Install runtime dependencies (libgit2, ssl)
RUN apt-get update && \
    apt-get install -y libgit2-1.7 libssl3 ca-certificates && \
    rm -rf /var/lib/apt/lists/*

EXPOSE 3000

# Default behavior: run the full data processing pipeline.
# To just serve existing data, the user can override the command: docker run ... zcash_extractor --serve
ENTRYPOINT ["zcash_extractor"]
CMD []
