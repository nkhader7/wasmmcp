#!/usr/bin/env bash
# Build gitleaks-wasm for wasm32-wasip2 and copy to the module registry.
# Run from: wasm/gitleaks/
#
# Prerequisites:
#   rustup target add wasm32-wasip2

set -euo pipefail

TARGET="wasm32-wasip2"
PROFILE="release"
OUT_DIR="../../modules/gitleaks/8.30"

echo "[1/3] Checking gitleaks.toml..."
if [[ ! -f "gitleaks.toml" ]]; then
  echo "      gitleaks.toml not found — copy D:/Download/gitleaks/gitleaks.toml here first"
  exit 1
fi

echo "[2/3] Building gitleaks-wasm (${TARGET} ${PROFILE})..."
rustup target add "${TARGET}" 2>/dev/null || true
cargo build --target "${TARGET}" --profile "${PROFILE}"

WASM_SRC="target/${TARGET}/${PROFILE}/gitleaks.wasm"
if [[ ! -f "${WASM_SRC}" ]]; then
  echo "Build produced no .wasm at ${WASM_SRC}" >&2
  exit 1
fi

echo "[3/3] Copying to module registry..."
mkdir -p "${OUT_DIR}"
cp "${WASM_SRC}" "${OUT_DIR}/gitleaks.wasm"

SIZE_KB=$(du -k "${OUT_DIR}/gitleaks.wasm" | cut -f1)
echo ""
echo "Done. ${OUT_DIR}/gitleaks.wasm (${SIZE_KB} KB)"
echo ""
echo "Update modules/index.json sha256 with:"
echo "  sha256sum ${OUT_DIR}/gitleaks.wasm"
