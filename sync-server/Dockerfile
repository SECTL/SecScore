FROM rust:1.93-bookworm AS builder

WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY migrations ./migrations
COPY src ./src

RUN cargo build --release --locked

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home --home-dir /app secscore

WORKDIR /app
COPY --from=builder /build/target/release/secscore-sync-server /usr/local/bin/secscore-sync-server
RUN mkdir -p /app/logs \
    && chown -R secscore:secscore /app /usr/local/bin/secscore-sync-server

USER secscore
ENV BIND_ADDR=0.0.0.0:8787 \
    RUST_LOG=info \
    SYNC_LOG_DIR=/app/logs

EXPOSE 8787
ENTRYPOINT ["/usr/local/bin/secscore-sync-server"]
