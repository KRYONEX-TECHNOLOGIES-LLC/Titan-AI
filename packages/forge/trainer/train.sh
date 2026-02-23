#!/bin/bash
# ── Titan Forge — Training Launch Script ──
# Run on a cloud GPU (RunPod A100 80GB: $1.64/hr, Lambda Labs H100: $2.49/hr)
#
# Usage:
#   ./train.sh phase1       — General capability
#   ./train.sh phase2       — Code specialization
#   ./train.sh phase3       — Titan specialization
#   ./train.sh all          — All 3 phases in sequence
#   ./train.sh unsloth      — Use Unsloth instead of Axolotl (faster)
#
# Setup (run once on the cloud instance):
#   pip install axolotl[flash-attn,deepspeed]
#   pip install unsloth  # alternative

set -e

PHASE=${1:-phase1}
TRAINING_DIR="$(dirname "$0")"
DATA_DIR="$TRAINING_DIR/../training-data"
OUTPUT_DIR="$TRAINING_DIR/../output"

echo "=== Titan Forge Training Pipeline ==="
echo "Phase: $PHASE"
echo "Data directory: $DATA_DIR"
echo "Output directory: $OUTPUT_DIR"
echo ""

# Check data exists
if [ ! -d "$DATA_DIR" ]; then
  echo "ERROR: training-data/ not found. Run export first:"
  echo "  pnpm --filter @titan/forge run export --format curriculum --output ./training-data"
  exit 1
fi

run_axolotl() {
  local config=$1
  echo "--- Running Axolotl: $config ---"
  python -m axolotl.cli.train "$TRAINING_DIR/$config"
  echo "--- Done: $config ---"
}

run_unsloth() {
  local config=$1
  echo "--- Running Unsloth: $config ---"
  # Unsloth wrapper script
  python "$TRAINING_DIR/unsloth_train.py" --config "$TRAINING_DIR/$config"
  echo "--- Done: $config ---"
}

case $PHASE in
  phase1)
    run_axolotl "axolotl-phase1-general.yml"
    ;;
  phase2)
    run_axolotl "axolotl-phase2-code.yml"
    ;;
  phase3)
    run_axolotl "axolotl-phase3-titan.yml"
    ;;
  all)
    echo "Running all 3 curriculum phases..."
    run_axolotl "axolotl-phase1-general.yml"
    echo ""
    run_axolotl "axolotl-phase2-code.yml"
    echo ""
    run_axolotl "axolotl-phase3-titan.yml"
    echo ""
    echo "=== All phases complete ==="
    echo "Final model: $OUTPUT_DIR/titan-forge-v1-titan"
    ;;
  unsloth)
    # Unsloth is faster — use for quick iteration
    run_unsloth "axolotl-phase1-general.yml"
    ;;
  *)
    echo "Unknown phase: $PHASE"
    echo "Use: phase1, phase2, phase3, all, or unsloth"
    exit 1
    ;;
esac

echo ""
echo "Next step: Run eval to compare student vs teacher:"
echo "  pnpm --filter @titan/forge run eval --run-id <RUN_ID>"
