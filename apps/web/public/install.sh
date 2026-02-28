#!/usr/bin/env bash
set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
RED="\033[0;31m"
RESET="\033[0m"

echo ""
echo -e "${BOLD}Titan Always-On Daemon Installer${RESET}"
echo "================================="
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo -e "${RED}Error: Node.js is not installed.${RESET}"
  echo "Please install Node.js 22+ from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  echo -e "${RED}Error: Node.js 22+ is required (found v$(node -v)).${RESET}"
  echo "Please upgrade from https://nodejs.org"
  exit 1
fi

echo -e "${GREEN}Node.js $(node -v) detected${RESET}"
echo ""

# Install titan-daemon
echo "Installing titan-daemon..."
npm install -g titan-daemon@latest

echo ""
echo "Running setup wizard..."
titan-daemon setup

echo ""
echo -e "${GREEN}${BOLD}Titan Always-On Daemon installed successfully!${RESET}"
echo ""
echo "Commands:"
echo "  titan-daemon status   - Check daemon status"
echo "  titan-daemon logs     - View Alfred logs"
echo "  titan-daemon restart  - Restart the daemon"
echo "  titan-daemon stop     - Stop the daemon"
echo ""
