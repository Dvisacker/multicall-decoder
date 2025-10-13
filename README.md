# Multicall Decoder

A CLI tool and library to decode multicall transaction data. It fetches ABIs from Etherscan and falls back to the 4byte directory for signature lookups.

## Features

- Decodes multicall formats (Multicall2, Multicall3, tryAggregate, tryBlockAndAggregate)
- Supports multiple networks (Ethereum, Polygon, Arbitrum, Optimism, Base) - untested
- AI-powered explanations via Claude CLI

## Installation

```bash
npm install
npm run build
```

For global installation:

```bash
npm install -g .
```

## Usage

### CLI Commands

#### Decode Multicall Transaction Data

```bash
# Basic usage
multicall-decoder decode <multicall-data>

# With Etherscan API key
multicall-decoder decode <multicall-data> --api-key YOUR_API_KEY

# With different network
multicall-decoder decode <multicall-data> --network polygon

# Verbose output
multicall-decoder decode <multicall-data> --verbose

# JSON output
multicall-decoder decode <multicall-data> --json

# Get AI explanation using Claude CLI
multicall-decoder decode <multicall-data> --explain

# Combine options
multicall-decoder decode <multicall-data> --verbose --explain --api-key YOUR_API_KEY
```

#### Decode Single Call

```bash
# Decode a single contract call
multicall-decoder decode-call <contract-address> <call-data>

# With options
multicall-decoder decode-call <contract-address> <call-data> --api-key YOUR_API_KEY --network mainnet

# With explanation
multicall-decoder decode-call <contract-address> <call-data> --explain
```

### Environment Variables

You can set the Etherscan API key as an environment variable:

```bash
export ETHERSCAN_API_KEY=your_api_key_here
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-k, --api-key <key>` | Etherscan API key | `ETHERSCAN_API_KEY` env var |
| `-n, --network <network>` | Network to use | `mainnet` |
| `-v, --verbose` | Enable verbose output | `false` |
| `-j, --json` | Output as JSON | `false` |
| `-e, --explain` | Get AI explanation using Claude CLI | `false` |

## Examples

### Example 1: Decode Multicall3 Transaction

```bash
multicall-decoder decode "0x82ad56cb00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002..."
```

### Example 2: Get JSON Output

```bash
multicall-decoder decode <data> --json > output.json
```

### Example 3: Get AI-Powered Explanation

```bash
# Requires Claude CLI to be installed and configured
multicall-decoder decode <data> --explain

# With verbose output to see contract names being fetched
multicall-decoder decode <data> --explain --verbose
```

The `--explain` flag uses the Claude CLI in pipe mode to provide:
- Plain-language explanation of what the transaction does
- Context about the contracts being called (fetched from Etherscan)
- Breakdown of arguments and their purpose
- Analysis of how calls work together

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev decode <data>

# Build the project
npm run build

# Run tests (if available)
npm test
```

